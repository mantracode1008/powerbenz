const Sequelize = require('sequelize');
const { Op } = Sequelize;
require('dotenv').config({ path: './.env' }); // Adjust path if needed

const sequelize = new Sequelize(process.env.DATABASE_URL, {
    dialect: 'mysql',
    logging: false
});

async function checkTTOK() {
    try {
        await sequelize.authenticate();
        console.log('Connection has been established successfully.');

        const query = `
            SELECT 
                SUM(quantity) as totalPurchase,
                SUM(remainingQuantity) as currentStock
            FROM ContainerItems
            WHERE TRIM(UPPER(itemName)) = 'TT OK'
        `;

        const [results] = await sequelize.query(query);
        const stockData = results[0];
        console.log('--- ContainerItems (Stock) ---');
        console.log(`Total Purchase: ${stockData.totalPurchase}`);
        console.log(`Current Stock (DB): ${stockData.currentStock}`);

        const salesQuery = `
            SELECT SUM(quantity) as totalSold
            FROM Sales
            WHERE TRIM(UPPER(itemName)) = 'TT OK'
        `;
        const [saleResults] = await sequelize.query(salesQuery);
        console.log('--- Sales Table ---');
        console.log(`Total Sold (Sales Table): ${saleResults[0].totalSold}`);

        console.log('--- Calculation Check ---');
        const expectedStock = stockData.totalPurchase - saleResults[0].totalSold;
        console.log(`Expected Stock (Purchase - Sold): ${expectedStock}`);
        console.log(`Discrepancy: ${stockData.currentStock - expectedStock}`);

        // Let's check detail of ContainerItems to see which ones are empty
        const detailQuery = `
            SELECT id, quantity, remainingQuantity, unloadDate
            FROM ContainerItems
            WHERE TRIM(UPPER(itemName)) = 'TT OK'
        `;
        const [details] = await sequelize.query(detailQuery);
        console.log('--- ContainerDetails ---');
        console.table(details);

    } catch (error) {
        console.error('Unable to connect to the database:', error);
    } finally {
        await sequelize.close();
    }
}

checkTTOK();
