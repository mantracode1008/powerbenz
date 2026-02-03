require('dotenv').config({ path: 'server/.env' });
const sequelize = require('../server/config/database');

async function inspectItems() {
    console.log('--- INSPECTING ITEMS (LIVE) ---');
    try {
        await sequelize.authenticate();

        const query = `
            SELECT "itemName", "quantity", "rate", "amount", "updatedAt"
            FROM "ContainerItems"
            ORDER BY "updatedAt" DESC
            LIMIT 10
        `;

        const items = await sequelize.query(query, { type: sequelize.QueryTypes.SELECT });
        console.table(items);

    } catch (error) {
        console.error('SQL Error:', error);
    } finally {
        await sequelize.close();
    }
}

inspectItems();
