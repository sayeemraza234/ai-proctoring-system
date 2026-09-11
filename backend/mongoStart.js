/**
 * MongoDB Startup Helper
 *
 * Priority:
 *   1. Use MONGO_URI from .env if set (supports MongoDB Atlas)
 *   2. Try connecting to local MongoDB (localhost:27017)
 *   3. Fall back to mongodb-memory-server (data lost on restart — OK for dev/demo)
 *
 * This module NEVER crashes the server. It always resolves with a working URI.
 */

const mongoose = require('mongoose');
const dns = require('dns');

// On Windows, local router DNS often fails SRV records with ECONNREFUSED.
// Using Google and Cloudflare DNS resolvers fixes Atlas SRV lookups reliably.
try {
    dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch {}

async function startMongoDB() {
    const MONGO_URI = process.env.MONGO_URI || '';

    // ── Option 1: Explicit URI in .env (Atlas or custom host) ───────────────
    if (MONGO_URI && MONGO_URI.trim()) {
        const isAtlas = MONGO_URI.includes('mongodb.net') || MONGO_URI.includes('mongodb+srv://');
        console.log('📡 Connecting to MongoDB URI from .env...');
        if (isAtlas) console.log('   ☁️  MongoDB Atlas detected');

        try {
            await mongoose.connect(MONGO_URI, {
                serverSelectionTimeoutMS: 15000,
                connectTimeoutMS: 15000
            });
            console.log('✅ Connected to MongoDB:', isAtlas ? 'Atlas Cloud ☁️' : MONGO_URI.split('@')[1] || MONGO_URI);
            return MONGO_URI;
        } catch (err) {
            console.warn('⚠️  MongoDB URI connection failed:', err.message.split('\n')[0]);
            if (isAtlas) {
                console.warn('');
                console.warn('   Atlas troubleshooting:');
                console.warn('   • Go to cloud.mongodb.com → Network Access → Add IP Address → Allow from Anywhere (0.0.0.0/0)');
                console.warn('   • Make sure your cluster is NOT paused (click "Resume" if needed)');
                console.warn('   • Verify username/password in the MONGO_URI');
                console.warn('');
                console.warn('   ⚡ Continuing with in-memory fallback. Data will NOT persist across restarts.');
            }
            // Always fall through — never crash the app
        }
    }

    // ── Option 2: Local MongoDB ──────────────────────────────────────────────
    const localUri = 'mongodb://127.0.0.1:27017/ai_proctoring';
    try {
        await mongoose.connect(localUri, {
            serverSelectionTimeoutMS: 2000,
            connectTimeoutMS: 2000
        });
        console.log('✅ Connected to local MongoDB at', localUri);
        return localUri;
    } catch {
        console.warn('⚠️  Local MongoDB not available. Using in-memory fallback...');
    }

    // ── Option 3: In-memory fallback (always works — development/demo safe) ──
    try {
        const { MongoMemoryServer } = require('mongodb-memory-server');
        const mongod = await MongoMemoryServer.create({
            instance: { dbName: 'ai_proctoring' }
        });
        const uri = mongod.getUri();

        await mongoose.connect(uri);
        console.log('');
        console.log('🧪 ════════════════════════════════════════════════════════════');
        console.log('   Running with IN-MEMORY MongoDB (development mode)');
        console.log('   ⚠️  All data will be LOST when the server restarts.');
        console.log('   → To persist data: Set MONGO_URI in backend/.env');
        console.log('   → Or install MongoDB Community: https://www.mongodb.com/try/download/community');
        console.log('   ════════════════════════════════════════════════════════════');
        console.log('');

        // Graceful cleanup
        process.on('exit', () => { try { mongod.stop(); } catch {} });
        process.on('SIGINT', () => { try { mongod.stop(); } catch {} process.exit(0); });
        process.on('SIGTERM', () => { try { mongod.stop(); } catch {} process.exit(0); });

        return uri;
    } catch (memErr) {
        console.error('❌ Failed to start any MongoDB instance:', memErr.message);
        console.error('');
        console.error('── Fix Options ──────────────────────────────────────────────');
        console.error('  Option A (Recommended): MongoDB Atlas (free cloud DB)');
        console.error('    1. Go to https://cloud.mongodb.com and sign up');
        console.error('    2. Create a free M0 cluster');
        console.error('    3. Whitelist your IP: Network Access → Allow from Anywhere');
        console.error('    4. Set MONGO_URI in backend/.env');
        console.error('');
        console.error('  Option B: Install MongoDB Community Server');
        console.error('    https://www.mongodb.com/try/download/community');
        console.error('─────────────────────────────────────────────────────────────');
        throw memErr;
    }
}

module.exports = { startMongoDB };
