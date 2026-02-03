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

const Container = sequelize.define('Container', {
    id: { type: DataTypes.UUID, primaryKey: true },
    containerNo: DataTypes.STRING,
    date: DataTypes.DATE,
    firm: DataTypes.STRING
});

const ContainerItem = sequelize.define('ContainerItem', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    itemName: DataTypes.STRING,
    quantity: DataTypes.FLOAT,
    remainingQuantity: DataTypes.FLOAT,
    containerId: DataTypes.UUID
});

Container.hasMany(ContainerItem, { foreignKey: 'containerId' });
ContainerItem.belongsTo(Container, { foreignKey: 'containerId' });

async function checkAnomalies() {
    try {
        await sequelize.authenticate();
        console.log('Connected to SQLite.');

        // 1. Check Row Count
        // Note: Postgres table names might be quoted like "ContainerItems"
        const [results] = await sequelize.query('SELECT count(*) as "count" FROM "ContainerItems"');
        console.log('Total ContainerItems in DB:', results[0].count);

        // 2. Check Coper items specifically
        const [coperItems] = await sequelize.query(`
            SELECT 
                ci.id, 
                ci."itemName", 
                ci.quantity as "purchaseQty", 
                ci."remainingQuantity" as "activeStock",
                c."containerNo", 
                c.date as "purchaseDate"
            FROM "ContainerItems" ci
            LEFT JOIN "Containers" c ON ci."containerId" = c.id
            WHERE ci."itemName" ILIKE '%Coper%' OR ci."itemName" ILIKE '%Copper%'
        `);

        console.log('\n--- COPPER ITEMS FOUND ---');
        let totalPurchase = 0;
        let totalStock = 0;

        coperItems.forEach(item => {
            console.log(`[${item.containerNo || 'No Container'}] Item: ${item.itemName} | Buy: ${item.purchaseQty} | Rem: ${item.activeStock}`);
            totalPurchase += item.purchaseQty;
            totalStock += item.activeStock;
        });
        console.log('---------------------------');
        console.log(`Total Buy: ${totalPurchase}`);
        console.log(`Total Stock (Rem): ${totalStock}`);

        // 3. Check Sales for Coper
        const [sales] = await sequelize.query(`
            SELECT * FROM "Sales" 
            WHERE "itemName" ILIKE '%Coper%' OR "itemName" ILIKE '%Copper%'
        `);
        console.log('\n--- SALES FOUND ---');
        console.log(`Found ${sales.length} sales for Copper.`);
        sales.forEach(s => {
            console.log(`Sale: ${s.date} | Qty: ${s.quantity} | Buyer: ${s.buyerName}`);
        });

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await sequelize.close();
    }
}

checkAnomalies();
