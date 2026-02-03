const { Sequelize, DataTypes } = require('sequelize');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../server/.env') });

console.log('Using PostgreSQL connection (DATABASE_URL found).');

const sequelize = new Sequelize(process.env.DATABASE_URL, {
    dialect: 'postgres',
    protocol: 'postgres',
    dialectOptions: {
        ssl: {
            require: true,
            rejectUnauthorized: false
        }
    },
    logging: false
});

async function fixCoper() {
    try {
        await sequelize.authenticate();
        console.log('Connected to DB.');

        // 1. Find the anomalous item (Buy ~409.5, Rem > 409.5)
        const [items] = await sequelize.query(`
            SELECT id, "itemName", quantity, "remainingQuantity"
            FROM "ContainerItems"
            WHERE "itemName" ILIKE '%Coper%' 
            AND quantity > 409 AND quantity < 410
        `);

        if (items.length === 0) {
            console.log('No matching Coper item found.');
            return;
        }

        const item = items[0];
        console.log(`Found Item: ${item.itemName} | ID: ${item.id} | Qty: ${item.quantity} | Rem: ${item.remainingQuantity}`);

        // 2. Update remainingQuantity to 309.5 (Assuming 100kg Sold from this 409.5 stock)
        // We set it to 309.5
        const targetStock = 309.5;

        console.log(`Fixing stock... Setting remainingQuantity to ${targetStock}`);

        await sequelize.query(`
            UPDATE "ContainerItems"
            SET "remainingQuantity" = ${targetStock}
            WHERE id = '${item.id}'
        `);

        console.log('Update Complete.');

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await sequelize.close();
    }
}

fixCoper();
