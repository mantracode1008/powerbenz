const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../server/.env') });
const sequelize = require('../server/config/database');
const ContainerItem = require('../server/models/ContainerItem');
const Container = require('../server/models/Container');
const Sale = require('../server/models/Sale');
const SaleAllocation = require('../server/models/SaleAllocation');
const { Op } = require('sequelize');

const reconcileAllStock = async () => {
    try {
        console.log('Connecting to database...');
        await sequelize.authenticate();
        console.log('Database connected.');

        // 1. Get Distinct Item Names
        const distinctItemsParams = await ContainerItem.findAll({
            attributes: ['itemName'],
            group: ['itemName']
        });
        const distinctItemNames = distinctItemsParams.map(i => i.itemName);

        console.log(`Found ${distinctItemNames.length} distinct items to reconcile.`);

        for (const targetItemName of distinctItemNames) {
            console.log(`\n================================`);
            console.log(`Reconciling: ${targetItemName}`);

            // 2. Fetch Container Items (Purchase)
            let containerItems = await ContainerItem.findAll({
                where: {
                    itemName: { [Op.like]: targetItemName }
                },
                include: [{
                    model: Container,
                    attributes: ['date', 'containerNo', 'id']
                }]
            });

            // Clean up: Filter out entries where itemName is just visually same but actually different?
            // Op.like pattern matching might be broad.
            // If targetItemName has `%` it might cause issues, but we fetched exact names from DB.
            // HOWEVER, distinct might return "Copper" and "copper".
            // We should treat them case-insensitively usually, but here we iterate over what DB has.
            // Let's rely on the DB.

            // Manual Sort (FIFO by Container Date)
            containerItems.sort((a, b) => {
                const dateA = a.Container?.date ? new Date(a.Container.date) : new Date(0);
                const dateB = b.Container?.date ? new Date(b.Container.date) : new Date(0);
                return dateA - dateB;
            });

            if (containerItems.length === 0) continue;

            // 3. Fetch Sales
            const sales = await Sale.findAll({
                where: {
                    itemName: { [Op.like]: targetItemName }
                },
                order: [['date', 'ASC']]
            });

            // 4. Calculate Totals
            const totalPurchase = containerItems.reduce((sum, item) => sum + item.quantity, 0);
            const totalSold = sales.reduce((sum, sale) => sum + sale.quantity, 0);

            console.log(`Purchase: ${totalPurchase.toFixed(2)} | Sold: ${totalSold.toFixed(2)} | Net: ${(totalPurchase - totalSold).toFixed(2)}`);

            // 5. RESET Stock
            const itemIds = containerItems.map(i => i.id);
            await SaleAllocation.destroy({
                where: {
                    containerItemId: { [Op.in]: itemIds }
                }
            });

            // 6. Redistribute Sold Qty
            let remainingSold = totalSold;

            for (const item of containerItems) {
                // Reset first
                const originalQty = item.quantity;
                let newRemaining = originalQty;

                if (remainingSold > 0.001) {
                    const deduct = Math.min(originalQty, remainingSold);
                    newRemaining = originalQty - deduct;
                    remainingSold -= deduct;
                }

                if (Math.abs(item.remainingQuantity - newRemaining) > 0.001) {
                    item.remainingQuantity = newRemaining;
                    await item.save();
                    // quiet log if changed
                    // console.log(`  Updated ${item.Container?.containerNo}: ${originalQty} -> ${newRemaining}`);
                } else {
                    // Ensure it is saved if it was wrong (e.g. if we didn't reset explicitly above, we do it here)
                    // Actually we didn't "reset" in DB above, we just calculated new value.
                    // But we CLEARED allocations. So we MUST update connection to be consistent.
                    // If value is same, we might not save? No, logic above compares.
                }
            }

            // Double check validation if we want to be paranoid
        }

        console.log('\nGlobal Reconciliation Complete.');

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await sequelize.close();
    }
};

reconcileAllStock();
