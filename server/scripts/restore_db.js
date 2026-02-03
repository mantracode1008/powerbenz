require('dotenv').config({ path: '../.env' });
const { Sequelize } = require('sequelize');
const fs = require('fs');
const path = require('path');

// Database Connection
// Note: This script assumes the database (schema) exists.
// If using a fresh VPS, user might need to create the DB first or let Sequelize create tables.
const sequelize = new Sequelize(process.env.DATABASE_URL, {
    dialect: 'mysql',
    logging: false
});

(async () => {
    try {
        const backupPath = path.join(__dirname, '../data/mysql_backup_latest.json');

        if (!fs.existsSync(backupPath)) {
            console.error('❌ No backup file found at:', backupPath);
            console.log('Please run "node scripts/backup_db.js" first.');
            process.exit(1);
        }

        console.log('🔄 Connecting to Database...');
        await sequelize.authenticate();
        console.log('✅ Connected.');

        // Sync to ensure tables exist
        console.log('🚧 synchronizing Tables...');
        await sequelize.sync();

        console.log('📂 Reading Backup File...');
        const backupData = JSON.parse(fs.readFileSync(backupPath, 'utf8'));

        console.log('💾 Restoring Data...');

        // Order matters due to foreign keys!
        // We will try to prioritize independent tables first.
        // Or disable foreign key checks temporarily.

        await sequelize.query('SET FOREIGN_KEY_CHECKS = 0', { raw: true });

        for (const [tableName, rows] of Object.entries(backupData)) {
            if (rows.length === 0) continue;

            console.log(`   - Restoring ${tableName} (${rows.length} rows)...`);

            // Truncate first to avoid duplicates if re-running
            // Using query instead of model.destroy for speed and missing models
            try {
                await sequelize.query(`TRUNCATE TABLE ${tableName}`, { raw: true });

                // Bulk Insert
                // We need to handle data types? JSON parse normally handles basic types.
                // Dates might be strings, but Sequelize/MySQL handles ISO strings well.

                // Construct insert query or use replacements
                // Simple approach: Use Sequelize QueryGenerator or raw insert? 
                // Let's use a simpler approach: Loop and insert? No, too slow.
                // Bulk insert via query is best for raw data restoration.

                // Risk: If column names changed. Assuming code version matches data version.

                // Safer generic bulk insert helper
                const columns = Object.keys(rows[0]).map(k => `\`${k}\``).join(',');

                // Chunking to avoid packet size limit
                const CHUNK_SIZE = 100;
                for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
                    const chunk = rows.slice(i, i + CHUNK_SIZE);
                    const values = chunk.map(row => {
                        return '(' + Object.values(row).map(val => {
                            if (val === null) return 'NULL';
                            if (typeof val === 'boolean') return val ? 1 : 0;
                            // Escape string
                            return sequelize.escape(val);
                        }).join(',') + ')';
                    }).join(',');

                    await sequelize.query(`INSERT INTO ${tableName} (${columns}) VALUES ${values}`);
                }

            } catch (err) {
                console.error(`   ⚠️ Error restoring ${tableName}: ${err.message}`);
            }
        }

        await sequelize.query('SET FOREIGN_KEY_CHECKS = 1', { raw: true });

        console.log('✨ Restore Complete!');
        process.exit(0);

    } catch (error) {
        console.error('❌ Restore Failed:', error);
        process.exit(1);
    }
})();
