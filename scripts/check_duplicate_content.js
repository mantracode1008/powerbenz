const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../server/.env') });
const sequelize = require('../server/config/database');
const ContainerItem = require('../server/models/ContainerItem');

async function checkDuplicates() {
    try {
        await sequelize.authenticate();

        const id1 = '89d81720-f795-4612-b964-768e0d147fe8';
        const id2 = 'c03dac42-3e14-45fb-aad9-0d202212e0f0';

        const count1 = await ContainerItem.count({ where: { containerId: id1 } });
        const count2 = await ContainerItem.count({ where: { containerId: id2 } });

        console.log(`\nDuplicate Check:`);
        console.log(`ID 1 (${id1}): ${count1} items`);
        console.log(`ID 2 (${id2}): ${count2} items`);

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await sequelize.close();
    }
}

checkDuplicates();
