require('dotenv').config({ path: 'server/.env' });
const sequelize = require('../server/config/database');

async function checkDatesJson() {
    console.log('--- CHECKING DATES & AMOUNTS (JSON) ---');
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
        console.log(JSON.stringify(results, null, 2));

        // Group by Date to see counts
        const counts = {};
        results.forEach(r => {
            const d = r.unloadDate ? new Date(r.unloadDate).toISOString().split('T')[0] : 'NoDate';
            counts[d] = (counts[d] || 0) + 1;
        });
        console.log('Counts per Date:', counts);

    } catch (error) {
        console.error('SQL Error:', error);
    } finally {
        await sequelize.close();
    }
}

checkDatesJson();
