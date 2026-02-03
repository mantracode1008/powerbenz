require('dotenv').config({ path: 'server/.env' });
const Container = require('../server/models/Container');
const ContainerItem = require('../server/models/ContainerItem');
const sequelize = require('../server/config/database');

async function checkData() {
    console.log('--- CHECKING DATA STATUS ---');
    try {
        await sequelize.authenticate();
        console.log('Database Connected.');

        const cCount = await Container.count();
        const iCount = await ContainerItem.count();

        console.log(`Containers Found: ${cCount}`);
        console.log(`Items Found: ${iCount}`);

        if (cCount === 0) {
            console.log('CRITICAL: Database appears empty!');
        } else {
            console.log('Data exists. Issue is likely UI or Connection path.');
        }

    } catch (error) {
        console.error('Connection Error:', error);
    } finally {
        await sequelize.close();
    }
}

checkData();
