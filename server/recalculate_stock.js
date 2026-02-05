const Sequelize = require('sequelize');
const { Op } = Sequelize;
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const sequelize = require('./config/database');
const Sale = require('./models/Sale');
const ContainerItem = require('./models/ContainerItem');
const Container = require('./models/Container');
const SaleAllocation = require('./models/SaleAllocation');

async function recalculateStock() {
    let t;
    try {
        await sequelize.authenticate();
        console.log('DB Connected.');

        const ITEM_NAME = 'TT OK';

        t = await sequelize.transaction();

        console.log(`--- Recalculating Stock for "${ITEM_NAME}" ---`);

        // 1. Fetch Target Items (Buckets)
        const buckets = await ContainerItem.findAll({
            where: {
                itemName: Sequelize.where(
                    Sequelize.fn('TRIM', Sequelize.fn('UPPER', Sequelize.col('itemName'))),
                    ITEM_NAME
                )
            },
            include: [{ model: Container, required: true }],
            order: [[Container, 'date', 'ASC']], // FIFO
            transaction: t,
            lock: t.LOCK.UPDATE
        });

        if (buckets.length === 0) {
            console.log('No buckets found.');
            await t.rollback();
            return;
        }

        const bucketIds = buckets.map(b => b.id);
        const totalPurchase = buckets.reduce((sum, b) => sum + b.quantity, 0);
        console.log(`Total Purchase (Buckets): ${totalPurchase}`);

        // 2. Fetch All Sales
        const sales = await Sale.findAll({
            where: {
                itemName: Sequelize.where(
                    Sequelize.fn('TRIM', Sequelize.fn('UPPER', Sequelize.col('itemName'))),
                    ITEM_NAME
                )
            },
            order: [['date', 'ASC'], ['createdAt', 'ASC']],
            transaction: t
        });

        const totalSold = sales.reduce((sum, s) => sum + s.quantity, 0);
        console.log(`Total Sold (Sales Table): ${totalSold}`);

        // 3. Reset Buckets
        console.log('Resetting buckets to full quantity...');
        for (const bucket of buckets) {
            bucket.remainingQuantity = bucket.quantity; // Reset
            await bucket.save({ transaction: t });
        }

        // 4. Clear Old Allocations
        console.log('Clearing old allocations...');
        await SaleAllocation.destroy({
            where: {
                containerItemId: { [Op.in]: bucketIds }
            },
            transaction: t
        });

        // 5. Re-Allocate (FIFO)
        console.log('Re-allocating sales...');
        let totalAllocated = 0;

        for (const sale of sales) {
            let remainingToFill = parseFloat(sale.quantity);

            // Iterate buckets to fill this sale
            // We must find buckets that have remaining > 0
            // Since we are inside a transaction and modifying objects, we can rely on our in-memory "buckets" array if we keep it updated.

            for (const bucket of buckets) {
                if (remainingToFill <= 0.001) break;

                const currentStock = parseFloat(bucket.remainingQuantity);
                if (currentStock <= 0.001) continue;

                const take = Math.min(currentStock, remainingToFill);

                // Deduct
                bucket.remainingQuantity = currentStock - take;
                await bucket.save({ transaction: t });

                // Create Allocation
                await SaleAllocation.create({
                    saleId: sale.id,
                    containerItemId: bucket.id,
                    quantity: take
                }, { transaction: t });

                remainingToFill -= take;
                totalAllocated += take;
            }

            if (remainingToFill > 0.01) {
                console.warn(`⚠️ Warning: Sale ${sale.id} (Qty: ${sale.quantity}) could not be fully filled! Missing: ${remainingToFill}`);
            }
        }

        console.log(`Total Allocated: ${totalAllocated}`);

        // 6. Verify Remaining
        const expectedRem = totalPurchase - totalAllocated;
        const actualRem = buckets.reduce((sum, b) => sum + b.remainingQuantity, 0);

        console.log(`Expected Remaining: ${expectedRem.toFixed(2)}`);
        console.log(`Actual Remaining (After Fix): ${actualRem.toFixed(2)}`);

        if (Math.abs(expectedRem - actualRem) > 0.01) {
            throw new Error('Mismatch in verification!');
        }

        await t.commit();
        console.log('✅ COMMIT SUCCESSFUL. Stock fixed.');

    } catch (error) {
        if (t) await t.rollback();
        console.error('❌ ERROR:', error);
    } finally {
        await sequelize.close();
    }
}

recalculateStock();
