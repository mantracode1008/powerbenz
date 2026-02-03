const fs = require('fs');
const path = require('path');
const { Sequelize } = require('sequelize');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const sequelize = require('../config/database');

async function cleanup() {
    try {
        await sequelize.authenticate();
        console.log('Dropping Items_backup...');
        await sequelize.query("DROP TABLE IF EXISTS Items_backup;");
        console.log('Done.');
    } catch (err) {
        console.error(err);
    } finally {
        await sequelize.close();
    }
}

cleanup();
