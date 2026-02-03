const { Sequelize } = require('sequelize');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function testRawQuery() {
    const dbUrl = process.env.DATABASE_URL;
    const sequelize = new Sequelize(dbUrl, {
        dialect: 'mysql',
        logging: false
    });

    try {
        await sequelize.authenticate();
        console.log('✅ Connected to DB');

        // The suspected problematic query (Postgres style quotes)
        const query = `
            SELECT 
                TRIM(UPPER(ci."itemName")) as "normalizedName",
                ci."quantity",
                ci."remainingQuantity", 
                ci."rate",
                ci."amount",
                COALESCE(ci."unloadDate", c."date") as "effectiveDate",
                c."containerNo"
            FROM "ContainerItems" ci
            JOIN "Containers" c ON ci."containerId" = c."id"
            LIMIT 5
        `;

        console.log('Testing Postgres-style Quoted Query...');
        await sequelize.query(query);
        console.log('✅ Query Passed (Unexpected)');

    } catch (err) {
        console.log(`❌ Query Failed as expected: ${err.message}`);
    } finally {
        await sequelize.close();
    }
}

testRawQuery();
