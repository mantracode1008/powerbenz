const { Sequelize, Op } = require('sequelize');
const sequelize = require('../config/database');
const ContainerItem = require('../models/ContainerItem');
const Container = require('../models/Container');

(async () => {
    try {
        console.log('Connecting to DB...');
        await sequelize.authenticate();
        console.log('Connected to ' + sequelize.config.storage);

        const countItems = await ContainerItem.count();
        const countContainers = await Container.count();
        console.log(`Total ContainerItems: ${countItems}`);
        console.log(`Total Containers: ${countContainers}`);

        if (countContainers > 0 && countItems === 0) {
            console.log("Containers exist but Items are 0. This implies data integrity issue or wrong table.");
        }

    } catch (error) {
        console.error('Error:', error);
    }
})();
