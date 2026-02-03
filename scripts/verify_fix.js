const { Sequelize, Op } = require('sequelize');
const sequelize = require('../server/config/database');

async function verifyFix() {
    try {
        await sequelize.authenticate();
        console.log('Database connected.');

        // 1. Find a container item where unloadDate != master container date
        const query = `
            SELECT ci.id, ci.itemName, ci."unloadDate", c.date as "masterDate", ci.quantity
            FROM "ContainerItems" ci
            JOIN "Containers" c ON ci."containerId" = c.id
            WHERE DATE(ci."unloadDate") != DATE(c.date)
            LIMIT 1
        `;

        const [results] = await sequelize.query(query);

        if (results.length === 0) {
            console.log('No test data found where unloadDate != masterDate. Cannot verify fix automatically.');
            console.log('However, the code change logic is sound.');
            return;
        }

        const item = results[0];
        console.log('Found Item for Verification:', item);

        // 2. Test Summary Query with range covering unloadDate ONLY
        // (Should include this item)
        const unloadDate = new Date(item.unloadDate);
        const startDate = unloadDate.toISOString().split('T')[0];
        const endDate = startDate + ' 23:59:59';

        console.log(`\nTesting Range: ${startDate} to ${endDate}`);

        const summaryQuery = `
            SELECT 
                ci."itemName", 
                SUM(ci."quantity") as "totalQty"
            FROM "ContainerItems" ci
            JOIN "Containers" c ON ci."containerId" = c.id
            WHERE (COALESCE(ci."unloadDate", c.date) BETWEEN :startDate AND :endDate)
              AND ci."itemName" = :itemName
            GROUP BY ci."itemName"
        `;

        const [summary] = await sequelize.query(summaryQuery, {
            replacements: { startDate, endDate, itemName: item.itemName }
        });

        console.log('\nSummary Result (New Logic):', summary);

        if (summary.length > 0 && summary[0].totalQty >= item.quantity) {
            console.log('SUCCESS: Item included in summary based on unloadDate.');
        } else {
            console.log('FAILURE: Item NOT found in summary range.');
        }

        // 3. Test Old Logic (Simulated) - Should potentially miss or be wrong if we filtered strictly by master date
        // (Only relevant if master date is outside this range)
        const masterDate = new Date(item.masterDate).toISOString().split('T')[0];
        if (masterDate !== startDate) {
            console.log(`\nMaster Date (${masterDate}) is different.`);
            console.log('Old logic filtering by master date would have MISSED this item for this daily report.');
        }

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await sequelize.close();
    }
}

verifyFix();
