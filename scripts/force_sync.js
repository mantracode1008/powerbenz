const sequelize = require('../server/config/database');
const Container = require('../server/models/Container');
const ContainerItem = require('../server/models/ContainerItem');

(async () => {
    try {
        console.log('--- FORCING SYNC ---');
        await sequelize.authenticate();
        console.log('Auth Successful.');

        await sequelize.sync({ alter: true });
        console.log('Sync Successful. Tables created.');

        const tables = await sequelize.getQueryInterface().showAllTables();
        console.log('Tables now:', tables);

    } catch (e) {
        console.error('SYNC ERROR:', e);
    } finally {
        await sequelize.close();
    }
})();
