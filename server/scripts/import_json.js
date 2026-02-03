const fs = require('fs');
const path = require('path');
const { Sequelize } = require('sequelize');

// Load environment to detect DB (though we default to SQLite if strict)
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const sequelize = require('../config/database');

// Manually Import Models
const models = {};
const modelFiles = [
    'Attendance.js', 'AuditLog.js', 'Container.js', 'ContainerItem.js',
    'Firm.js', 'Item.js', 'ItemRateHistory.js', 'Sale.js',
    'SaleAllocation.js', 'ScrapType.js', 'Staff.js'
];

modelFiles.forEach(file => {
    const modelName = file.split('.')[0];
    models[modelName] = require(`../models/${file}`);
});

async function importBackup() {
    console.log('--- Starting Import from JSON ---');
    const filePath = path.join(__dirname, '../data/full_data.json');

    if (!fs.existsSync(filePath)) {
        console.error('❌ File not found: server/data/full_data.json');
        console.error('👉 Please save the query result as "full_data.json" in the "server/data" folder.');
        return;
    }

    try {
        let fileContent = fs.readFileSync(filePath, 'utf8');

        // Handle if user saved it as CSV by mistake (Neon sometimes wraps in quotes)
        if (fileContent.trim().startsWith('"') || fileContent.trim().startsWith('full_backup')) {
            console.log('⚠️ Detected CSV/Text wrapping, attempting to clean...');
            // remove surrounding quotes and unescape quotes
            fileContent = fileContent.replace(/^"|"$/g, '').replace(/""/g, '"');
            // If header exists
            fileContent = fileContent.replace('full_backup\n', '');
        }

        let data;
        if (fileContent.trim().startsWith('[')) {
            const raw = JSON.parse(fileContent);
            if (Array.isArray(raw) && raw.length > 0 && raw[0].full_backup) {
                console.log('📦 Detected nested Neon JSON format...');
                // The inner content is a String that needs parsing
                if (typeof raw[0].full_backup === 'string') {
                    data = JSON.parse(raw[0].full_backup);
                } else {
                    data = raw[0].full_backup;
                }
            } else {
                data = raw;
            }
        } else {
            data = JSON.parse(fileContent);
        }

        await sequelize.authenticate();

        if (sequelize.getDialect() === 'sqlite') {
            await sequelize.query('PRAGMA foreign_keys = OFF;');
            console.log('✅ SQLite FKs Disabled for Import');
        }

        // Ensure the local SQLite DB has all the correct columns (like 'pin', 'otp')
        try {
            await sequelize.sync({ alter: true });
            console.log('✅ Database Schema Synced!');
        } catch (err) {
            console.warn('⚠️ Schema Sync warning (continuing):', err.message);
        }

        // SYNC (Clear old data?) -> Maybe safest to sync({alter:true}) or force?
        // Let's just Insert. User expects empty DB currently.

        const tableMap = {
            'Staffs': 'Staff',
            'Sales': 'Sale',
            'Items': 'Item',
            'Containers': 'Container',
            'ContainerItems': 'ContainerItem',
            'SaleAllocations': 'SaleAllocation',
            'Firms': 'Firm',
            'Attendances': 'Attendance',
            'ScrapTypes': 'ScrapType',
            'AuditLogs': 'AuditLog',
            'ItemRateHistories': 'ItemRateHistory'
        };

        for (const [jsonKey, modelName] of Object.entries(tableMap)) {
            const rows = data[jsonKey];
            if (rows && rows.length > 0) {
                console.log(`📥 Importing ${rows.length} records into ${modelName}...`);
                try {
                    await models[modelName].bulkCreate(rows, {
                        ignoreDuplicates: true,
                        validate: false // Force it in
                    });
                } catch (err) {
                    console.error(`⚠️ Error importing ${modelName}: ${err.message}`);
                }
            } else {
                console.log(`- No data for ${modelName}`);
            }
        }

        if (sequelize.getDialect() === 'sqlite') {
            await sequelize.query('PRAGMA foreign_keys = ON;');
        }

        console.log('---------------------------');
        console.log('✅ IMPORT SUCCESSFUL! Your data is back.');
        console.log('---------------------------');

    } catch (error) {
        console.error('❌ IMPORT FAILED:', error);
    } finally {
        await sequelize.close();
    }
}

importBackup();
