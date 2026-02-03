const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../server/.env') });
const { Op } = require('sequelize');
const sequelize = require('../server/config/database');
const Container = require('../server/models/Container');
const ContainerItem = require('../server/models/ContainerItem');
const Item = require('../server/models/Item');

async function fixZeroValues() {
    const t = await sequelize.transaction();
    try {
        await sequelize.authenticate();
        console.log('DB Connected');

        // 1. Fetch all items to build a Rate Map
        const items = await Item.findAll();
        const rateMap = {}; // "clean name" -> rate
        items.forEach(i => {
            if (i.name) {
                rateMap[i.name.trim().toLowerCase()] = i.defaultRate;
            }
        });

        console.log(`Loaded ${items.length} master items for rate lookups.`);

        // 2. Find ContainerItems with 0 amount but > 0 quantity
        const zeroItems = await ContainerItem.findAll({
            where: {
                amount: 0,
                quantity: { [Op.gt]: 0 }
            },
            transaction: t
        });

        console.log(`Found ${zeroItems.length} items with 0 value. Fixing...`);

        let fixedCount = 0;
        const containersToTouch = new Set();

        for (const ci of zeroItems) {
            const cleanName = (ci.itemName || '').trim().toLowerCase();
            const rate = rateMap[cleanName];

            if (rate && rate > 0) {
                const newAmount = ci.quantity * rate;

                // Update
                ci.rate = rate;
                ci.amount = newAmount;
                await ci.save({ transaction: t });

                if (ci.containerId) containersToTouch.add(ci.containerId);
                fixedCount++;
                if (fixedCount % 100 === 0) process.stdout.write('.');
            } else {
                if (fixedCount < 10) console.log(`Skipping "${ci.itemName}" (Clean: "${cleanName}") - Rate in Master: ${rate}`);
            }
        }
        console.log(`\nFixed ${fixedCount} items.`);

        // 3. Recalculate Totals for affected Containers
        console.log(`Recalculating totals for ${containersToTouch.size} containers...`);
        for (const containerId of containersToTouch) {
            const total = await ContainerItem.sum('amount', {
                where: { containerId },
                transaction: t
            });

            await Container.update({ totalAmount: total || 0 }, {
                where: { id: containerId },
                transaction: t
            });
        }

        await t.commit();
        console.log('SUCCESS: Values updated.');

    } catch (error) {
        await t.rollback();
        console.error('ERROR:', error);
    } finally {
        await sequelize.close();
    }
}

fixZeroValues();
