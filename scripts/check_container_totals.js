require('dotenv').config({ path: 'server/.env' });
const sequelize = require('../server/config/database');

async function checkContainerTotals() {
    console.log('--- CHECKING CONTAINER TOTALS (LIVE) ---');
    try {
        await sequelize.authenticate();

        // 1. Get All Containers with their stored totalAmount
        const query = `
            SELECT id, "containerNo", "totalAmount", "date"
            FROM "Containers"
            ORDER BY "date" DESC
            LIMIT 10
        `;
        const containers = await sequelize.query(query, { type: sequelize.QueryTypes.SELECT });

        console.log(`Found ${containers.length} containers.`);

        for (const c of containers) {
            // 2. Sum Items for this container
            const itemSumQuery = `
                SELECT SUM(amount) as "realTotal"
                FROM "ContainerItems"
                WHERE "containerId" = :id
            `;
            const [result] = await sequelize.query(itemSumQuery, {
                replacements: { id: c.id },
                type: sequelize.QueryTypes.SELECT
            });

            const realTotal = parseFloat(result.realTotal) || 0;
            const storedTotal = parseFloat(c.totalAmount) || 0;

            console.log(`[${c.containerNo}] Stored: ${storedTotal} | Real (Items): ${realTotal} | Match: ${Math.abs(storedTotal - realTotal) < 1}`);
        }

        // 3. Check Global Sum from Containers Table
        const [globalSum] = await sequelize.query('SELECT SUM("totalAmount") as "grandTotal" FROM "Containers"', { type: sequelize.QueryTypes.SELECT });
        console.log(`GLOBAL STORED SUM: ${globalSum.grandTotal}`);

    } catch (error) {
        console.error('SQL Error:', error);
    } finally {
        await sequelize.close();
    }
}

checkContainerTotals();
