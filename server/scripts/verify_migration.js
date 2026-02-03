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

async function verifyMigration() {
    console.log('--- Verifying Migration Data ---');
    const filePath = path.join(__dirname, '../data/full_data.json');

    if (!fs.existsSync(filePath)) {
        console.error('❌ File not found: server/data/full_data.json');
        return;
    }

    try {
        let fileContent = fs.readFileSync(filePath, 'utf8');

        // Handle common file wrapping issues
        if (fileContent.trim().startsWith('"') || fileContent.trim().startsWith('full_backup')) {
            fileContent = fileContent.replace(/^"|"$/g, '').replace(/""/g, '"');
            fileContent = fileContent.replace('full_backup\n', '');
        }

        let data;
        if (fileContent.trim().startsWith('[')) {
            const raw = JSON.parse(fileContent);
            if (Array.isArray(raw) && raw.length > 0 && raw[0].full_backup) {
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
        console.log('✅ Connected to Database for Verification');

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

        console.log('\n%-20s | %-12s | %-12s | %s', 'Model Name', 'JSON Count', 'DB Count', 'Status');
        console.log('-'.repeat(65));

        let allMatch = true;

        for (const [jsonKey, modelName] of Object.entries(tableMap)) {
            const jsonRows = data[jsonKey] || [];
            const jsonCount = jsonRows.length;

            let dbCount = 0;
            try {
                dbCount = await models[modelName].count();
            } catch (err) {
                console.error(`Error counting ${modelName}:`, err.message);
                dbCount = 'ERR';
            }

            const status = (jsonCount === dbCount) ? '✅ MATCH' : '❌ MISMATCH';
            if (jsonCount !== dbCount) allMatch = false;

            console.log('%-20s | %-12d | %-12s | %s', modelName, jsonCount, dbCount, status);
        }

        console.log('-'.repeat(65));
        if (allMatch) {
            console.log('🎉 ALL DATA VERIFIED SUCCESSFULLY!');
        } else {
            console.log('⚠️ SOME DATA MAY BE MISSING OR DUPLICATED. PLEASE CHECK.');
        }

    } catch (error) {
        console.error('❌ VERIFICATION FAILED:', error);
    } finally {
        await sequelize.close();
    }
}

verifyMigration();
