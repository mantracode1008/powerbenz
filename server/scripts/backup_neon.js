const fs = require('fs');
const path = require('path');

// 1. Manually Load Env and Force Neon URL
const envPath = path.join(__dirname, '../.env');
const envContent = fs.readFileSync(envPath, 'utf8');

// Find the Neon URL even if commented out
const match = envContent.match(/DATABASE_URL=['"]?(postgresql:\/\/.*?)['"]?(\r|\n|$)/);
if (match && match[1]) {
    process.env.DATABASE_URL = match[1];
    console.log('✅ Found Neon URL:', process.env.DATABASE_URL.split('@')[1]); // Log host only
} else {
    console.error('❌ Could not find DATABASE_URL in .env');
    process.exit(1);
}

// 2. Import Sequelize Config (will now use the URL above)
const sequelize = require('../config/database');

// 3. Manually Import All Models
const models = {};
const modelFiles = [
    'Attendance.js',
    'AuditLog.js',
    'Container.js',
    'ContainerItem.js',
    'Firm.js',
    'Item.js',
    'ItemRateHistory.js',
    'Sale.js',
    'SaleAllocation.js',
    'ScrapType.js',
    'Staff.js'
];

modelFiles.forEach(file => {
    const modelName = file.split('.')[0];
    models[modelName] = require(`../models/${file}`);
});

async function backup() {
    console.log('--- Starting Neon Backup ---');

    try {
        await sequelize.authenticate();
        console.log('✅ Connected to Neon DB!');

        const backupData = {};

        for (const file of modelFiles) {
            const modelName = file.split('.')[0];
            const Model = models[modelName];

            console.log(`Fetching ${modelName}...`);
            try {
                const data = await Model.findAll();
                backupData[modelName] = data.map(d => d.toJSON());
                console.log(`> ${data.length} records.`);
            } catch (err) {
                console.error(`> Error fetching ${modelName}:`, err.message);
                backupData[modelName] = [];
            }
        }

        const outputPath = path.join(__dirname, '../data/neon_full_backup.json');
        fs.writeFileSync(outputPath, JSON.stringify(backupData, null, 2));

        console.log('---------------------------');
        console.log('✅ BACKUP SUCCESSFUL!');
        console.log(`📁 File: ${outputPath}`);
        console.log('---------------------------');

    } catch (error) {
        console.error('❌ CONNECTION FAILED:', error.message);
        console.error('Check: Are you on Mobile Hotspot?');
    } finally {
        await sequelize.close();
    }
}

backup();
