const Item = require('../models/Item');
const sequelize = require('../config/database');

const checkItems = async () => {
    try {
        await sequelize.authenticate();
        console.log('Connection has been established successfully.');

        const count = await Item.count();
        console.log(`Total items in DB: ${count}`);

        const items = await Item.findAll({ limit: 5 });
        console.log('First 5 items:', JSON.stringify(items, null, 2));

    } catch (error) {
        console.error('Unable to connect to the database:', error);
    } finally {
        await sequelize.close();
    }
};

checkItems();
