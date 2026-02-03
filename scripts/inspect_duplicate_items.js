const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../server/.env') });
const sequelize = require('../server/config/database');
const ContainerItem = require('../server/models/ContainerItem');

async function inspectItems() {
    try {
        await sequelize.authenticate();

        const id1 = '89d81720-f795-4612-b964-768e0d147fe8';
        const id2 = 'c03dac42-3e14-45fb-aad9-0d202212e0f0';

        const items1 = await ContainerItem.findAll({ where: { containerId: id1 }, raw: true });
        const items2 = await ContainerItem.findAll({ where: { containerId: id2 }, raw: true });

        console.log('\n--- Container 1 Items (10) ---');
        items1.forEach(i => console.log(`- ${i.itemName}: Qty ${i.quantity}, Amt ${i.amount}`));

        console.log('\n--- Container 2 Items (2) ---');
        items2.forEach(i => console.log(`- ${i.itemName}: Qty ${i.quantity}, Amt ${i.amount}`));

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await sequelize.close();
    }
}

inspectItems();
