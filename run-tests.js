require('dotenv').config();
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');

// Colors for terminal output
const RESET = "\x1b[0m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const BLUE = "\x1b[36m";
const BOLD = "\x1b[1m";

console.log(`${BOLD}${BLUE}====================================================${RESET}`);
console.log(`${BOLD}${BLUE}   MIYABI SYSTEM TEST SUITE: DIAGNOSTIC & TESTING   ${RESET}`);
console.log(`${BOLD}${BLUE}====================================================${RESET}\n`);

async function runTestSuite() {
    let passedTests = 0;
    let failedTests = 0;

    function assert(condition, message) {
        if (condition) {
            passedTests++;
            console.log(`  ${GREEN}✓ [PASS]${RESET} ${message}`);
        } else {
            failedTests++;
            console.log(`  ${RED}✗ [FAIL]${RESET} ${message}`);
        }
    }

    // =========================================================================
    //  1. COMPONENT TESTING (TESTS DE COMPOSANTE)
    // =========================================================================
    console.log(`${BOLD}${YELLOW}1. COMPONENT TESTING (TESTS DE COMPOSANTE)${RESET}`);
    console.log(`--------------------------------------------------`);

    // --- Component A: Message Sanitizer / Security Protection ---
    console.log(`\n${BOLD}[Component A] Message Sanitizer & Protection System${RESET}`);
    const sanitizer = require('./src/utils/messageSanitizer');

    // Test case 1.1: Standard safe message
    const safeMsg = {
        message: {
            conversation: "Bonjour Miyabi, est-ce que tu peux m'aider avec mes devoirs ?"
        }
    };
    const resSafe = sanitizer.inspectMessage(safeMsg);
    assert(resSafe.suspicious === false, "Un message standard et propre doit être accepté.");

    // Test case 1.2: RTL/LTR unicode override block (dangerous unicode)
    const rtlMsg = {
        message: {
            conversation: "Texte malveillant \u202E crasher"
        }
    };
    const resRtl = sanitizer.inspectMessage(rtlMsg);
    assert(resRtl.suspicious === true && resRtl.reason.includes("RTL/LTR override"), "Les overrides directionnels Unicode suspects doivent être bloqués.");

    // Test case 1.3: Text length overflow
    const longMsg = {
        message: {
            conversation: "A".repeat(6000)
        }
    };
    const resLong = sanitizer.inspectMessage(longMsg);
    assert(resLong.suspicious === true && resLong.reason.includes("long"), "Les messages de plus de 5000 caractères doivent être bloqués.");

    // Test case 1.4: Too many mentions
    const spamMentions = {
        message: {
            conversation: "Hé " + "@237690000000 ".repeat(25)
        }
    };
    const resSpamMentions = sanitizer.inspectMessage(spamMentions);
    assert(resSpamMentions.suspicious === true && resSpamMentions.reason.includes("mentions"), "Les spams de mentions (@...) doivent être bloqués.");

    // Test case 1.5: Dangerous coordinates
    const badLocationMsg = {
        message: {
            locationMessage: {
                degreesLatitude: 150.0, // Invalid latitude (> 90)
                degreesLongitude: 45.0
            }
        }
    };
    const resBadLoc = sanitizer.inspectMessage(badLocationMsg);
    assert(resBadLoc.suspicious === true && resBadLoc.reason.includes("Latitude GPS invalide"), "Les coordonnées GPS absurdes/invalides doivent être rejetées.");


    // --- Component B: Wallet Service (Database Fallback and operations) ---
    console.log(`\n${BOLD}[Component B] Wallet Service (Local JSON DB Fallback & Operations)${RESET}`);
    const walletService = require('./src/services/walletService');

    // Force walletService to initialize its local JSON database fallback
    walletService._initFallback();
    assert(walletService.useFallback === true, "L'initialisation de la base de données locale de secours doit réussir.");

    const testPseudo = "Tester_" + Math.floor(Math.random() * 10000);
    const testNom = "Unit Test Player";
    const testClasse = "Warrior";

    // Test case 1.6: Create wallet in local DB fallback
    const createRes = await walletService.createWallet(testNom, testPseudo, testClasse, 100, 50);
    assert(createRes.success === true && createRes.wallet.pseudo === testPseudo, "Création d'une fiche joueur dans la base de données locale.");

    // Test case 1.7: Reject duplicate wallet
    const duplicateRes = await walletService.createWallet(testNom, testPseudo, testClasse, 0, 0);
    assert(duplicateRes.success === false && duplicateRes.error === 'EXISTS', "Rejet d'un pseudo joueur doublon existant.");

    // Test case 1.8: Get wallet
    const getRes = await walletService.getWallet(testPseudo);
    assert(getRes.success === true && getRes.wallet.gems === 100, "Récupération d'une fiche joueur existante.");

    // Test case 1.9: Update gems (add)
    const updateAddRes = await walletService.updateCurrency(testPseudo, 'gems', 'add', 250);
    assert(updateAddRes.success === true && updateAddRes.newValue === 350, "Mise à jour positive (ajout) de monnaie (Gems).");

    // Test case 1.10: Update abyss coins (remove)
    const updateRemoveRes = await walletService.updateCurrency(testPseudo, 'abyssCoins', 'remove', 30);
    assert(updateRemoveRes.success === true && updateRemoveRes.newValue === 20, "Mise à jour négative (retrait) de monnaie (Abyss Coins).");

    // Test case 1.11: Delete wallet
    const deleteRes = await walletService.deleteWallet(testPseudo);
    assert(deleteRes.success === true, "Suppression d'une fiche joueur de la base de données locale.");

    const checkDeleted = await walletService.getWallet(testPseudo);
    assert(checkDeleted.success === false && checkDeleted.error === 'NOT_FOUND', "Vérification de la suppression de la fiche joueur.");


    // =========================================================================
    //  2. BLACK-BOX TESTING (TESTS EN BOÎTE NOIRE)
    // =========================================================================
    console.log(`\n${BOLD}${YELLOW}2. BLACK-BOX TESTING (TESTS EN BOÎTE NOIRE)${RESET}`);
    console.log(`--------------------------------------------------`);

    // Start a separate Express instance to test actual API endpoints black-box style
    const TEST_PORT = 3005;
    const testApp = express();
    const testServer = http.createServer(testApp);

    // Mock SessionManager to avoid requiring Baileys and causing import errors with tsx
    class MockSessionManager {
        constructor() {
            this.sessions = new Map();
        }
        createSession(sessionId, phoneNumber) {
            this.sessions.set(sessionId, { status: 'pending', phone: phoneNumber });
        }
        getStatus(sessionId) {
            return this.sessions.get(sessionId)?.status || 'not_found';
        }
        deleteSession(sessionId) {
            this.sessions.delete(sessionId);
        }
    }

    const { router: apiRouter, setSessionManager } = require('./src/routes/api');

    const testSessionManager = new MockSessionManager();
    setSessionManager(testSessionManager);

    testApp.use(express.json());
    testApp.use('/api', apiRouter);

    await new Promise((resolve) => {
        testServer.listen(TEST_PORT, '0.0.0.0', () => {
            console.log(`  ${BLUE}📡 Serveur de test en boîte noire démarré sur le port ${TEST_PORT}${RESET}`);
            resolve();
        });
    });

    const baseUrl = `http://localhost:${TEST_PORT}/api`;

    try {
        // Test case 2.1: POST /api/connect with invalid phone number
        try {
            await axios.post(`${baseUrl}/connect`, { phone: "" });
            assert(false, "Un appel de connexion sans numéro doit renvoyer une erreur.");
        } catch (err) {
            assert(err.response.status === 400, "POST /api/connect sans numéro retourne une erreur 400.");
        }

        // Test case 2.2: POST /api/connect with valid phone number
        const connectRes = await axios.post(`${baseUrl}/connect`, { phone: "237690000001" });
        assert(connectRes.status === 200 && connectRes.data.success === true && connectRes.data.sessionId !== undefined, "POST /api/connect crée une nouvelle session et renvoie un sessionId unique.");

        const activeSessionId = connectRes.data.sessionId;

        // Test case 2.3: GET /api/status/:sessionId
        const statusRes = await axios.get(`${baseUrl}/status/${activeSessionId}`);
        assert(statusRes.status === 200 && statusRes.data.sessionId === activeSessionId && statusRes.data.status !== undefined, "GET /api/status/:sessionId renvoie le statut correct de la session.");

        // Test case 2.4: POST /api/disconnect
        const disconnectRes = await axios.post(`${baseUrl}/disconnect`, { sessionId: activeSessionId });
        assert(disconnectRes.status === 200 && disconnectRes.data.success === true, "POST /api/disconnect supprime correctement la session active.");

        // Test case 2.5: GET /api/status/:sessionId should now return 'not_found'
        const statusAfterRes = await axios.get(`${baseUrl}/status/${activeSessionId}`);
        assert(statusAfterRes.status === 200 && statusAfterRes.data.status === 'not_found', "Le statut d'une session déconnectée doit être 'not_found'.");

    } catch (error) {
        console.error(`${RED}Erreur lors des tests en boîte noire:${RESET}`, error.message);
        failedTests++;
    } finally {
        // Shutdown test server
        await new Promise((resolve) => {
            testServer.close(() => {
                console.log(`\n  ${BLUE}📡 Serveur de test en boîte noire arrêté.${RESET}`);
                resolve();
            });
        });
    }

    // =========================================================================
    //  3. REPORT SUMMARY
    // =========================================================================
    console.log(`\n${BOLD}${BLUE}====================================================${RESET}`);
    console.log(`${BOLD}${BLUE}               RAPPORT DE DIAGNOSTIC                ${RESET}`);
    console.log(`${BOLD}${BLUE}====================================================${RESET}`);
    console.log(`  Tests réussis : ${GREEN}${passedTests}${RESET}`);
    console.log(`  Tests échoués : ${failedTests > 0 ? RED : GREEN}${failedTests}${RESET}`);
    console.log(`${BOLD}${BLUE}====================================================${RESET}\n`);

    if (failedTests > 0) {
        process.exit(1);
    } else {
        process.exit(0);
    }
}

runTestSuite().catch(err => {
    console.error("Crash critique dans le lanceur de tests:", err);
    process.exit(1);
});
