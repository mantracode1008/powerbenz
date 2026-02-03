const dotenv = require('dotenv');
const path = require('path');

// Explicitly load server/.env
dotenv.config({ path: path.join(__dirname, '../server/.env') });

const sequelize = require('../server/config/database');
const Staff = require('../server/models/Staff');

(async () => {
    try {
        console.log('🔄 Connecting to Database for Sync...');
        console.log('Target DB Host:', sequelize.config.host || 'SQLite (Local)');

        if (sequelize.getDialect() === 'sqlite') {
            console.error('❌ ERROR: Still pointing to SQLite! .env failed to load or DATABASE_URL is missing.');
            process.exit(1);
        }

        await sequelize.authenticate();
        console.log('✅ Connected to Postgres. Syncing Tables...');

        await sequelize.sync({ alter: true });

        console.log('✅ LIVE DATA SYNC COMPLETED!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Sync Failed:', error);
        process.exit(1);
    }
})();
