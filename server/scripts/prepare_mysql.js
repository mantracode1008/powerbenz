const { Sequelize } = require('sequelize');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function prepareDb() {
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl || !dbUrl.startsWith('mysql')) {
        console.error('❌ Not a MySQL URL');
        return;
    }

    // Parse URL manually or using URL object
    // mysql://root:pass@localhost:3306/db_name
    const urlParts = new URL(dbUrl);
    const dbName = urlParts.pathname.replace('/', '');

    // Construct root URL (without DB)
    const rootUrl = `${urlParts.protocol}//${urlParts.username}:${urlParts.password}@${urlParts.hostname}:${urlParts.port}/`; // Connect to root

    console.log(`Connecting to MySQL Root at ${urlParts.hostname}...`);
    const sequelize = new Sequelize(rootUrl, {
        dialect: 'mysql',
        logging: false
    });

    try {
        await sequelize.authenticate();
        console.log('✅ Connected to MySQL Root.');

        console.log(`Creating database '${dbName}' if not exists...`);
        await sequelize.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\`;`);
        console.log(`✅ Database '${dbName}' is ready.`);
    } catch (err) {
        console.error(`❌ Failed to prepare DB: ${err.message}`);
    } finally {
        await sequelize.close();
    }
}

prepareDb();
