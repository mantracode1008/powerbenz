require('dotenv').config({ path: 'server/.env' });
const sequelize = require('../server/config/database');

async function checkDates() {
    console.log('--- CHECKING CONTAINER DATES (LIVE) ---');
    try {
        await sequelize.authenticate();

        const query = `
            SELECT c."containerNo", c."date", ci."unloadDate", ci."amount"
            FROM "Containers" c
            JOIN "ContainerItems" ci ON c.id = ci."containerId"
            ORDER BY c."updatedAt" DESC
            LIMIT 20
        `;

        const results = await sequelize.query(query, { type: sequelize.QueryTypes.SELECT });
        console.table(results.map(r => ({
            No: r.containerNo,
            MasterDate: r.date, // Raw DB Value
            UnloadDate: r.unloadDate, // Raw DB Value
            Amount: r.amount
        })));

    } catch (error) {
        console.error('SQL Error:', error);
    } finally {
        await sequelize.close();
    }
}

checkDates();
