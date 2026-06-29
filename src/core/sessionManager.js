const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const pino = require('pino');
const path = require('path');
const fs = require('fs');

const messageHandler = require('../../src/handlers/messageHandler');

const SESSIONS_DIR = path.join(__dirname, '../../sessions');
if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR, { recursive: true });

const activeSessions = new Map();

class SessionManager {
    constructor(io) {
        this.io = io;
        this.phoneIndex = new Map();
    }

    async createSession(sessionId, phoneNumber) {
        if (activeSessions.has(sessionId)) {
            const existing = activeSessions.get(sessionId);
            if (existing.status === 'connected') {
                return { success: false, error: 'already_connected' };
            }
            if (existing.sock) {
                console.log(`Fermeture et nettoyage de l'ancienne socket pour la session ${sessionId}`);
                try {
                    existing.sock.ev.removeAllListeners('connection.update');
                    existing.sock.ev.removeAllListeners('creds.update');
                    existing.sock.ev.removeAllListeners('messages.upsert');
                    existing.sock.ev.removeAllListeners('group-participants.update');
                    existing.sock.end();
                } catch (e) {
                    console.error("Erreur lors de la fermeture de l'ancienne socket:", e);
                }
            }
        }

        const sessionPath = path.join(SESSIONS_DIR, sessionId);
        if (!fs.existsSync(sessionPath)) fs.mkdirSync(sessionPath, { recursive: true });

        // Sauvegarder les infos de la session pour la restauration automatique en cas de redémarrage
        try {
            const infoPath = path.join(sessionPath, 'session_info.json');
            fs.writeFileSync(infoPath, JSON.stringify({ sessionId, phoneNumber }), 'utf8');
        } catch (err) {
            console.error('Erreur lors de la sauvegarde des informations de session:', err);
        }

        const { state, saveCreds } = await useMultiFileAuthState(sessionPath);

        const sock = makeWASocket({
            printQRInTerminal: false,
            auth: state,
            logger: pino({ level: 'silent' }),
            browser: ['Ubuntu', 'Chrome', '20.0.04']
        });

        activeSessions.set(sessionId, {
            sock,
            status: 'pending',
            phone: phoneNumber,
            createdAt: Date.now()
        });

        this.phoneIndex.set(phoneNumber, sessionId);

        // ── Events de connexion ──
        sock.ev.on('connection.update', async (update) => {
            const currentSession = activeSessions.get(sessionId);
            if (!currentSession || currentSession.sock !== sock) {
                console.log(`[Ignore] connection.update pour une socket obsolète/inactive de la session : ${sessionId}`);
                return;
            }

            const { connection, lastDisconnect, qr } = update;

            // Si Baileys génère un QR code, on l'ignore (car on utilise le code d'appairage)
            if (qr) {
                console.log('QR code généré pour session:', sessionId, 'mais ignoré car on utilise le code d\'appairage.');
            }

            if (connection === 'open') {
                this._updateStatus(sessionId, 'connected');
                this.io.to(sessionId).emit('connected', {
                    message: 'Miyabi est connectée !',
                    phone: phoneNumber
                });
                try {
                    await sock.sendMessage(`${phoneNumber}@s.whatsapp.net`, {
                        text: `...Je suis là. T'as payé pour ça alors je vais faire mon travail. Envoie-moi un message pour commencer.`
                    });
                } catch (e) {}
            }

            if (connection === 'close') {
                const statusCode = (lastDisconnect?.error instanceof Boom)
                    ? lastDisconnect.error.output?.statusCode : null;

                console.log(`Connexion fermée pour la session ${sessionId}, code:`, statusCode);

                const isRegistered = sock.authState?.creds?.registered;
                const wasConnected = currentSession.status === 'connected';

                if (statusCode === DisconnectReason.loggedOut) {
                    if (wasConnected && !isRegistered) {
                        console.log(`Déconnexion définitive (loggedOut) de la session: ${sessionId}`);
                        this._updateStatus(sessionId, 'logged_out');
                        this.io.to(sessionId).emit('disconnected', { reason: 'logged_out' });
                        this.deleteSession(sessionId);
                    } else {
                        console.log(`Déconnexion 401 temporaire ou enregistrement en cours pour la session: ${sessionId}. Tentative de reconnexion...`);
                        this._updateStatus(sessionId, 'reconnecting');
                        this.io.to(sessionId).emit('reconnecting');
                        setTimeout(() => this.createSession(sessionId, phoneNumber), 5000);
                    }
                } else {
                    this._updateStatus(sessionId, 'reconnecting');
                    this.io.to(sessionId).emit('reconnecting');
                    setTimeout(() => this.createSession(sessionId, phoneNumber), 5000);
                }
            }
        });

        // ── Messages entrants ──
        sock.ev.on('messages.upsert', async ({ messages, type }) => {
            const currentSession = activeSessions.get(sessionId);
            if (!currentSession || currentSession.sock !== sock) return;

            if (type !== 'notify') return;
            for (const msg of messages) {
                if (msg.key.fromMe) continue;
                const isGroup = msg.key.remoteJid?.endsWith('@g.us');
                await messageHandler.handleMessage(sock, msg, isGroup);
            }
        });

        // ── Nouveaux membres groupe ──
        sock.ev.on('group-participants.update', async ({ id, participants, action }) => {
            const currentSession = activeSessions.get(sessionId);
            if (!currentSession || currentSession.sock !== sock) return;

            if (action === 'add') {
                for (const participant of participants) {
                    const number = participant.split('@')[0];
                    try {
                        await sock.sendMessage(id, {
                            text: `@${number} a rejoint. ...Bienvenue, j'imagine.`,
                            mentions: [participant]
                        });
                    } catch (e) {}
                }
            }
        });

        sock.ev.on('creds.update', () => {
            const currentSession = activeSessions.get(sessionId);
            if (!currentSession || currentSession.sock !== sock) return;
            saveCreds();
        });

        // ── Appairage par code si pas encore enregistré ──
        if (!sock.authState.creds.registered) {
            setTimeout(async () => {
                try {
                    const cleanPhone = phoneNumber.replace(/[^0-9]/g, '');
                    console.log(`Demande de code d'appairage pour : ${cleanPhone}`);
                    const code = await sock.requestPairingCode(cleanPhone);
                    console.log(`Code d'appairage généré : ${code}`);
                    this.io.to(sessionId).emit('pairing_code', { code });
                    this._updateStatus(sessionId, 'pairing_ready');
                } catch (err) {
                    console.error('Erreur lors de la demande du code d\'appairage:', err);
                    this.io.to(sessionId).emit('error', { message: 'Impossible de générer le code d\'appairage WhatsApp.' });
                }
            }, 3000);
        }

        return { success: true };
    }

    deleteSession(sessionId) {
        const session = activeSessions.get(sessionId);
        if (session?.sock) {
            try { session.sock.end(); } catch (e) {}
        }
        activeSessions.delete(sessionId);
        if (session?.phone) this.phoneIndex.delete(session.phone);

        const sessionPath = path.join(SESSIONS_DIR, sessionId);
        if (fs.existsSync(sessionPath)) {
            fs.rmSync(sessionPath, { recursive: true, force: true });
        }
    }

    getSession(sessionId) { return activeSessions.get(sessionId); }

    getStatus(sessionId) {
        return activeSessions.get(sessionId)?.status || 'not_found';
    }

    _updateStatus(sessionId, status) {
        const session = activeSessions.get(sessionId);
        if (session) {
            session.status = status;
            activeSessions.set(sessionId, session);
        }
    }

    cleanupStaleSessions() {
        const now = Date.now();
        for (const [id, session] of activeSessions.entries()) {
            if (session.status === 'pending' && now - session.createdAt > 600000) {
                this.deleteSession(id);
            }
        }
    }

    async loadExistingSessions() {
        console.log("🔍 Recherche de sessions existantes à restaurer...");
        if (!fs.existsSync(SESSIONS_DIR)) return;

        try {
            const files = fs.readdirSync(SESSIONS_DIR);
            for (const file of files) {
                const sessionPath = path.join(SESSIONS_DIR, file);
                const stat = fs.statSync(sessionPath);
                if (stat.isDirectory()) {
                    const sessionId = file;
                    const credsPath = path.join(sessionPath, 'creds.json');
                    const infoPath = path.join(sessionPath, 'session_info.json');

                    if (fs.existsSync(credsPath)) {
                        try {
                            const creds = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
                            const isRegistered = creds && (creds.registered || creds.me);

                            if (isRegistered) {
                                let phoneNumber = '';
                                if (fs.existsSync(infoPath)) {
                                    try {
                                        const info = JSON.parse(fs.readFileSync(infoPath, 'utf8'));
                                        phoneNumber = info.phoneNumber || info.phone;
                                    } catch (e) {}
                                }
                                if (!phoneNumber && creds.me && creds.me.id) {
                                    phoneNumber = creds.me.id.split(':')[0].split('@')[0];
                                }

                                if (phoneNumber) {
                                    console.log(`♻️ Restauration de la session active ${sessionId} pour le numéro ${phoneNumber}`);
                                    this.createSession(sessionId, phoneNumber).catch(err => {
                                        console.error(`Erreur lors de la restauration de la session ${sessionId}:`, err);
                                    });
                                } else {
                                    console.log(`⚠️ Impossible de restaurer la session ${sessionId}: numéro de téléphone introuvable.`);
                                }
                            } else {
                                console.log(`ℹ️ Session ${sessionId} trouvée mais non enregistrée. Ignorée.`);
                            }
                        } catch (err) {
                            console.error(`Erreur de lecture des credentials pour la session ${sessionId}:`, err);
                        }
                    }
                }
            }
        } catch (err) {
            console.error("Erreur lors de la recherche des sessions existantes:", err);
        }
    }
}

module.exports = SessionManager;
