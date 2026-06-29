const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

const FALLBACK_DIR = path.join(process.cwd(), 'data');
const FALLBACK_FILE = path.join(FALLBACK_DIR, 'wallets.json');

class WalletService {
    constructor() {
        this.client = null;
        this.db = null;
        this.collection = null;
        this.connected = false;
        this.useFallback = false;
    }

    async connect() {
        try {
            if (!process.env.MONGODB_URI) {
                throw new Error("MONGODB_URI n'est pas configuré.");
            }
            this.client = new MongoClient(process.env.MONGODB_URI);
            await this.client.connect();
            this.db = this.client.db(process.env.MONGODB_DB || 'miyabi');
            this.collection = this.db.collection('wallets');

            await this.collection.createIndex(
                { pseudo: 1 },
                { unique: true, collation: { locale: 'fr', strength: 2 } }
            );
            await this.collection.createIndex(
                { nom: 1 },
                { collation: { locale: 'fr', strength: 2 } }
            );

            this.connected = true;
            this.useFallback = false;
            logger.info('MongoDB: connecté à la base wallets');
        } catch (error) {
            logger.warn(`MongoDB: impossible de se connecter (${error.message}). Bascule automatique sur la base de données locale.`);
            this._initFallback();
        }
    }

    _initFallback() {
        try {
            if (!fs.existsSync(FALLBACK_DIR)) {
                fs.mkdirSync(FALLBACK_DIR, { recursive: true });
            }
            if (!fs.existsSync(FALLBACK_FILE)) {
                fs.writeFileSync(FALLBACK_FILE, JSON.stringify([], null, 4), 'utf8');
            }
            this.useFallback = true;
            this.connected = true;
            logger.info('Local DB: base de données locale initialisée et prête.');
        } catch (err) {
            logger.error('Local DB: erreur lors de l\'initialisation de la base locale:', err.message);
            this.connected = false;
        }
    }

    _readFallback() {
        try {
            if (!fs.existsSync(FALLBACK_FILE)) {
                return [];
            }
            const data = fs.readFileSync(FALLBACK_FILE, 'utf8');
            return JSON.parse(data || '[]');
        } catch (err) {
            logger.error('Local DB: erreur de lecture:', err.message);
            return [];
        }
    }

    _writeFallback(data) {
        try {
            fs.writeFileSync(FALLBACK_FILE, JSON.stringify(data, null, 4), 'utf8');
            return true;
        } catch (err) {
            logger.error('Local DB: erreur d\'écriture:', err.message);
            return false;
        }
    }

    // ── Vérification connexion ──
    _checkConnection() {
        if (!this.connected) {
            return { success: false, error: 'DB_NOT_CONNECTED' };
        }
        if (!this.useFallback && !this.collection) {
            return { success: false, error: 'DB_NOT_CONNECTED' };
        }
        return null;
    }

    async createWallet(nom, pseudo, classe, gems = 0, abyssCoins = 0) {
        const connErr = this._checkConnection();
        if (connErr) return connErr;

        if (this.useFallback) {
            try {
                const wallets = this._readFallback();
                const lowerPseudo = pseudo.toLowerCase().trim();
                const exists = wallets.some(w => w.pseudo.toLowerCase().trim() === lowerPseudo);
                if (exists) {
                    return { success: false, error: 'EXISTS' };
                }

                const now = new Date();
                const wallet = {
                    nom: nom.trim(),
                    pseudo: pseudo.trim(),
                    classe: classe.trim(),
                    gems: parseInt(gems) || 0,
                    abyssCoins: parseInt(abyssCoins) || 0,
                    createdAt: now.toISOString(),
                    updatedAt: now.toISOString()
                };

                wallets.push(wallet);
                this._writeFallback(wallets);
                logger.info(`Wallet créé (Local DB): ${pseudo}`);
                return { success: true, wallet };
            } catch (error) {
                logger.error('Erreur createWallet (Local DB):', error.message);
                return { success: false, error: 'DB_ERROR' };
            }
        }

        try {
            const now = new Date();
            const wallet = {
                nom,
                pseudo,
                classe,
                gems: parseInt(gems) || 0,
                abyssCoins: parseInt(abyssCoins) || 0,
                createdAt: now,
                updatedAt: now
            };
            await this.collection.insertOne(wallet);
            logger.info(`Wallet créé: ${pseudo}`);
            return { success: true, wallet };
        } catch (error) {
            if (error.code === 11000) {
                return { success: false, error: 'EXISTS' };
            }
            logger.error('Erreur createWallet:', error.message);
            return { success: false, error: 'DB_ERROR' };
        }
    }

    async deleteWallet(query) {
        const connErr = this._checkConnection();
        if (connErr) return connErr;

        if (this.useFallback) {
            try {
                const wallets = this._readFallback();
                const trimmedQuery = query.toLowerCase().trim();
                const initialLength = wallets.length;
                const filtered = wallets.filter(w => 
                    w.nom.toLowerCase().trim() !== trimmedQuery && 
                    w.pseudo.toLowerCase().trim() !== trimmedQuery
                );

                if (filtered.length === initialLength) {
                    return { success: false, error: 'NOT_FOUND' };
                }

                this._writeFallback(filtered);
                logger.info(`Wallet supprimé (Local DB): ${query}`);
                return { success: true };
            } catch (error) {
                logger.error('Erreur deleteWallet (Local DB):', error.message);
                return { success: false, error: 'DB_ERROR' };
            }
        }

        try {
            const filter = this._buildSearchFilter(query);
            const result = await this.collection.deleteOne(filter);
            if (result.deletedCount === 0) {
                return { success: false, error: 'NOT_FOUND' };
            }
            return { success: true };
        } catch (error) {
            logger.error('Erreur deleteWallet:', error.message);
            return { success: false, error: 'DB_ERROR' };
        }
    }

    async updateCurrency(query, type, action, amount) {
        const connErr = this._checkConnection();
        if (connErr) return connErr;

        if (this.useFallback) {
            try {
                const wallets = this._readFallback();
                const trimmedQuery = query.toLowerCase().trim();
                const idx = wallets.findIndex(w => 
                    w.nom.toLowerCase().trim() === trimmedQuery || 
                    w.pseudo.toLowerCase().trim() === trimmedQuery
                );

                if (idx === -1) return { success: false, error: 'NOT_FOUND' };

                const wallet = wallets[idx];
                const current = wallet[type] || 0;
                const delta = action === 'add' ? parseInt(amount) : -parseInt(amount);
                const newValue = Math.max(0, current + delta);

                wallet[type] = newValue;
                wallet.updatedAt = new Date().toISOString();

                wallets[idx] = wallet;
                this._writeFallback(wallets);

                return { success: true, wallet, previous: current, newValue };
            } catch (error) {
                logger.error('Erreur updateCurrency (Local DB):', error.message);
                return { success: false, error: 'DB_ERROR' };
            }
        }

        try {
            const filter = this._buildSearchFilter(query);
            const wallet = await this.collection.findOne(filter);
            if (!wallet) return { success: false, error: 'NOT_FOUND' };

            const current = wallet[type] || 0;
            const delta = action === 'add' ? parseInt(amount) : -parseInt(amount);
            const newValue = Math.max(0, current + delta);

            await this.collection.updateOne(filter, {
                $set: { [type]: newValue, updatedAt: new Date() }
            });

            const updated = await this.collection.findOne(filter);
            return { success: true, wallet: updated, previous: current, newValue };
        } catch (error) {
            logger.error('Erreur updateCurrency:', error.message);
            return { success: false, error: 'DB_ERROR' };
        }
    }

    async getWallet(query) {
        const connErr = this._checkConnection();
        if (connErr) return connErr;

        if (this.useFallback) {
            try {
                const wallets = this._readFallback();
                const trimmedQuery = query.toLowerCase().trim();
                const wallet = wallets.find(w => 
                    w.nom.toLowerCase().trim() === trimmedQuery || 
                    w.pseudo.toLowerCase().trim() === trimmedQuery
                );

                if (!wallet) return { success: false, error: 'NOT_FOUND' };
                return { success: true, wallet };
            } catch (error) {
                logger.error('Erreur getWallet (Local DB):', error.message);
                return { success: false, error: 'DB_ERROR' };
            }
        }

        try {
            const filter = this._buildSearchFilter(query);
            const wallet = await this.collection.findOne(filter);
            if (!wallet) return { success: false, error: 'NOT_FOUND' };
            return { success: true, wallet };
        } catch (error) {
            logger.error('Erreur getWallet:', error.message);
            return { success: false, error: 'DB_ERROR' };
        }
    }

    async getAllWallets() {
        const connErr = this._checkConnection();
        if (connErr) return connErr;

        if (this.useFallback) {
            try {
                const wallets = this._readFallback();
                const sorted = [...wallets].sort((a, b) => 
                    a.pseudo.localeCompare(b.pseudo, 'fr', { sensitivity: 'base' })
                );
                return { success: true, wallets: sorted };
            } catch (error) {
                logger.error('Erreur getAllWallets (Local DB):', error.message);
                return { success: false, error: 'DB_ERROR' };
            }
        }

        try {
            const wallets = await this.collection
                .find({})
                .sort({ pseudo: 1 })
                .toArray();
            return { success: true, wallets };
        } catch (error) {
            logger.error('Erreur getAllWallets:', error.message);
            return { success: false, error: 'DB_ERROR' };
        }
    }

    formatWallet(wallet) {
        const date = new Date(wallet.updatedAt);
        const dateStr = `${String(date.getDate()).padStart(2,'0')}/${String(date.getMonth()+1).padStart(2,'0')}/${date.getFullYear()}`;

        return `↤♖︎𝗟𝗢𝗪𝗘𝗥 𝗧𝗢𝗪𝗘𝗥♖︎↦
-- -- -- -- -- -- -- -- -- -- -- -- -- -- -- --
> 𝘞𝘢𝘭𝘭𝘦𝘵 𝘱𝘭𝘢𝘺𝘦𝘳𝘴💳
══════════════════
|• ℕ𝕠𝕞: *${wallet.nom}*
|• ℙ𝕤𝕖𝕦𝕕𝕠: *${wallet.pseudo}*
|• ℂ𝕝𝕒𝕤𝕤𝕖: *${wallet.classe}*
-- -- -- -- -- -- -- -- -- -- -- -- -- -- -- --
|• 𝔾𝕖𝕞: *${wallet.gems}💎*
|• 𝔸𝕓𝕪𝕤𝕤 𝕔𝕠𝕚𝕟𝕤: *${wallet.abyssCoins}🪙*
══════════════════ 
𝕌𝕡𝕕𝕒𝕥𝕖 𝕓𝕪: _*Miyabi*_

𝔻𝕒𝕥𝕖 𝕦𝕡𝕕𝕒𝕥𝕖: \`${dateStr}\`
══════════════════
-                 𝙻𝙾𝚆𝙴𝚁 𝚃𝙾𝚆𝙴𝚁`;
    }

    _buildSearchFilter(query) {
        const regex = new RegExp(`^${query.trim()}$`, 'i');
        return { $or: [{ nom: regex }, { pseudo: regex }] };
    }
}

module.exports = new WalletService();
