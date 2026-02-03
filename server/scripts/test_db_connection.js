const fs = require('fs');
const path = require('path');
const { Sequelize } = require('sequelize');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const sequelize = require('../config/database');

async function testConnection() {
    console.log('--- Testing Database Connection ---');
    console.log('DB URL:', process.env.DATABASE_URL ? 'FOUND (Hidden)' : 'MISSING');

    try {
        await sequelize.authenticate();
        console.log('✅ Connection has been established successfully.');
        const dialect = sequelize.getDialect();
        console.log(`ℹ️  Dialect: ${dialect}`);

        if (dialect === 'postgres') {
            const [results] = await sequelize.query("SELECT NOW();");
            console.log('🕒 Server Time:', results[0].now);
        }

    } catch (error) {
        console.error('❌ Unable to connect to the database:', error);
    } finally {
        await sequelize.close();
    }
}

testConnection();
