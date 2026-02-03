const { Sequelize } = require('sequelize');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const sequelize = require('../config/database');
const Model = require('../models/Item'); // Check Item model

async function checkData() {
    try {
        await sequelize.authenticate();
        console.log('✅ Connected to DB');

        const items = await Model.findAll();
        console.log(`Found ${items.length} items.`);

        if (items.length > 0) {
            console.log('Sample Item:', items[0].toJSON());
        } else {
            console.log('❌ No items found! Table might be empty.');
        }

    } catch (err) {
        console.error('❌ Error fetching data:', err);
    } finally {
        await sequelize.close();
    }
}

checkData();
