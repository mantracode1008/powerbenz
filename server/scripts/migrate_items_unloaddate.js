const sequelize = require('../config/database');
const ContainerItem = require('../models/ContainerItem');

async function migrate() {
    try {
        await sequelize.authenticate();
        console.log('Database connected.');

        // Sync schema to add the new column
        await sequelize.sync({ alter: true });
        console.log('Schema synced (unloadDate column added).');

        process.exit(0);
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
}

migrate();
