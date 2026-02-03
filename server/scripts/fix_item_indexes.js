const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const sequelize = require('../config/database');

async function fixIndexes() {
    try {
        await sequelize.authenticate();
        console.log('Connected to DB.');

        const [results, metadata] = await sequelize.query("SHOW INDEX FROM Items");
        console.log('Current Indexes:', results.map(i => i.Key_name));

        const keyNames = results.map(i => i.Key_name).filter(k => k !== 'PRIMARY');
        const uniqueKeys = [...new Set(keyNames)];

        console.log('Indexes to remove:', uniqueKeys);

        for (const key of uniqueKeys) {
            console.log(`Dropping index: ${key}`);
            try {
                await sequelize.query(`DROP INDEX \`${key}\` ON Items`);
            } catch (e) {
                console.error(`Failed to drop ${key}:`, e.message);
            }
        }

        console.log('Cleanup complete. Now you can restart the server.');
        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

fixIndexes();
