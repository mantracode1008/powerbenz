const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../server/.env') });
const sequelize = require('../server/config/database');
const ContainerItem = require('../server/models/ContainerItem');
const Container = require('../server/models/Container');
const Sale = require('../server/models/Sale');
const SaleAllocation = require('../server/models/SaleAllocation');
const { Op } = require('sequelize');

const reconcileStock = async () => {
    try {
        console.log('Connecting to database...');
        await sequelize.authenticate();
        console.log('Database connected.');

        // Target Item Name from arguments or default to 'TT OK'
        const targetItemName = process.argv[2] || 'TT OK';
        console.log(`Reconciling Stock for item: ${targetItemName} (Case Insensitive)`);

        // 1. Fetch All Container Items for this Item (Purchase History)
        // 1. Fetch All Container Items for this Item (Purchase History)
        let containerItems = await ContainerItem.findAll({
            where: {
                itemName: { [Op.like]: targetItemName }
            },
            include: [{
                model: Container,
                attributes: ['date', 'containerNo', 'id']
            }]
        });

        // Manual Sort to avoid alias issues
        containerItems.sort((a, b) => {
            const dateA = a.Container?.date ? new Date(a.Container.date) : new Date(0);
            const dateB = b.Container?.date ? new Date(b.Container.date) : new Date(0);
            return dateA - dateB;
        });

        if (containerItems.length === 0) {
            console.log('No container items found for this name.');
            return;
        }

        console.log(`Found ${containerItems.length} purchase entries.`);

        // 2. Fetch All Sales for this Item (Sales History)
        const sales = await Sale.findAll({
            where: {
                itemName: { [Op.like]: targetItemName }
            },
            order: [['date', 'ASC']]
        });

        console.log(`Found ${sales.length} sales entries.`);

        // 3. Calculate Totals
        const totalPurchase = containerItems.reduce((sum, item) => sum + item.quantity, 0);
        const totalSold = sales.reduce((sum, sale) => sum + sale.quantity, 0);

        console.log('--- Current Totals ---');
        console.log(`Total Purchase: ${totalPurchase.toFixed(2)}`);
        console.log(`Total Sold:     ${totalSold.toFixed(2)}`);
        console.log(`Expected Stock: ${(totalPurchase - totalSold).toFixed(2)}`);

        // 4. RESET Stock to Full (Undo all sales)
        console.log('\nResetting all items to full stock...');
        for (const item of containerItems) {
            item.remainingQuantity = item.quantity; // Reset to full
            // We don't save yet, we simulate in memory first or save batch?
            // Safest to save to clear slate.
            await item.save();
        }

        // Optional: clear allocations for these items? 
        // Technically strict, but we are just fixing the remainingQuantity numbers.
        // If we want to be thorough, we should destroy allocations impacting these items.
        // But Sale model might have allocations to other items?
        // No, SaleAllocation links saleId and containerItemId.
        // We can delete allocations linked to these containerItems.
        const itemIds = containerItems.map(i => i.id);
        await SaleAllocation.destroy({
            where: {
                containerItemId: { [Op.in]: itemIds }
            }
        });
        console.log('Cleared old allocations.');


        // 5. Re-Apply Sales (FIFO)
        console.log('\nRe-applying sales...');
        let remainingSold = totalSold;

        // Create new allocations mapping
        const newAllocations = [];

        // We iterate through sales just to track, but really we just need to deduct `totalSold` from the `containerItems` FIFO.
        // BUT, capturing which sale map to which item is good for future. 
        // However, here we just want to fix the `remainingQuantity`.
        // Let's do simple deduction first.

        for (const item of containerItems) {
            if (remainingSold <= 0.001) break;

            const available = item.quantity; // it's full now
            const deduct = Math.min(available, remainingSold);

            item.remainingQuantity = available - deduct;
            await item.save();

            console.log(`  Entry ${item.Container?.containerNo} (${item.quantity}): Deducted ${deduct.toFixed(2)} -> Rem: ${item.remainingQuantity.toFixed(2)}`);

            remainingSold -= deduct;
        }

        if (remainingSold > 0.001) {
            console.warn(`WARNING: Sold amount exceeds Purchase amount! Deficit: ${remainingSold.toFixed(2)}`);
        }

        console.log('\nStock Reconciliation Complete.');

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await sequelize.close();
    }
};

reconcileStock();
