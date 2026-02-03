const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../server/.env') });
const sequelize = require('../server/config/database');
const ContainerItem = require('../server/models/ContainerItem');

async function deleteGhostItem() {
    try {
        await sequelize.authenticate();
        console.log('DB Connected');

        const itemId = '79523c1c-1712-4e0c-9576-945f9fac44c7'; // Allu Atta in Container 04

        const item = await ContainerItem.findByPk(itemId);
        if (item) {
            console.log(`Found Item: ${item.itemName}`);
            console.log(`Container ID: ${item.containerId}`);
            console.log(`Quantity: ${item.quantity}`);
            console.log(`Remaining: ${item.remainingQuantity}`);

            console.log('Deleting...');
            await item.destroy();
            console.log('Item Deleted Successfully.');
        } else {
            console.log('Item NOT found. Already deleted?');
        }

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await sequelize.close();
    }
}

deleteGhostItem();
