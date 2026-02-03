const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { Sequelize } = require('sequelize');
const fs = require('fs');


// Ensure data dir exists
const dataDir = path.join(__dirname, '../data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir);
}

const sequelize = new Sequelize(process.env.DATABASE_URL, {
    dialect: 'mysql',
    logging: false
});

(async () => {
    try {
        await sequelize.authenticate();
        console.log('Connected to MySQL. Starting Backup...');

        const tables = await sequelize.getQueryInterface().showAllTables();
        const fullBackup = {};

        for (const table of tables) {
            // tables might be an object or string depending on version, usually string in mysql/sequelize
            const tableName = typeof table === 'object' ? table.tableName : table;

            console.log(`Backing up ${tableName}...`);
            const [results] = await sequelize.query(`SELECT * FROM ${tableName}`);
            fullBackup[tableName] = results;
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupPath = path.join(dataDir, `mysql_backup_${timestamp}.json`);
        // Also save a 'latest' version for easy finding
        const latestPath = path.join(dataDir, 'mysql_backup_latest.json');

        fs.writeFileSync(backupPath, JSON.stringify(fullBackup, null, 2));
        fs.writeFileSync(latestPath, JSON.stringify(fullBackup, null, 2));

        console.log(`✅ Backup Successful!`);
        console.log(`Saved to: ${latestPath}`);
        console.log(`(This file contains ALL your database records)`);

        process.exit(0);

    } catch (error) {
        console.error('❌ Backup Failed:', error);
        process.exit(1);
    }
})();
