const Sequelize = require('sequelize');
const { Op } = Sequelize;
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const sequelize = require('./config/database');
const Sale = require('./models/Sale');
const ContainerItem = require('./models/ContainerItem');
const Container = require('./models/Container');
const SaleAllocation = require('./models/SaleAllocation');

async function recalculateStockAll() {
    let t;
    try {
        await sequelize.authenticate();
        console.log('DB Connected.');

        // 1. Get All Item Names
        const items = await ContainerItem.findAll({
            attributes: [[Sequelize.fn('DISTINCT', Sequelize.fn('TRIM', Sequelize.fn('UPPER', Sequelize.col('itemName')))), 'normName']],
            raw: true
        });

        console.log(`Found ${items.length} unique items to check.`);

        for (const itemObj of items) {
            const ITEM_NAME = itemObj.normName;

            try {
                t = await sequelize.transaction();

                // Fetch Buckets
                const buckets = await ContainerItem.findAll({
                    where: Sequelize.where(
                        Sequelize.fn('TRIM', Sequelize.fn('UPPER', Sequelize.col('itemName'))),
                        ITEM_NAME
                    ),
                    include: [{ model: Container, required: true }],
                    order: [[Container, 'date', 'ASC']],
                    transaction: t,
                    lock: t.LOCK.UPDATE
                });

                if (buckets.length === 0) {
                    await t.commit();
                    continue;
                }

                const totalPurchase = buckets.reduce((sum, b) => sum + b.quantity, 0);
                const currentRemainingDb = buckets.reduce((sum, b) => sum + b.remainingQuantity, 0);

                // Fetch Sales
                const sales = await Sale.findAll({
                    where: Sequelize.where(
                        Sequelize.fn('TRIM', Sequelize.fn('UPPER', Sequelize.col('itemName'))),
                        ITEM_NAME
                    ),
                    order: [['date', 'ASC'], ['createdAt', 'ASC']],
                    transaction: t
                });

                const totalSold = sales.reduce((sum, s) => sum + s.quantity, 0);
                const expectedRem = totalPurchase - totalSold;

                // Check for discrepancy (allow small float diff)
                if (Math.abs(currentRemainingDb - expectedRem) > 0.05) {
                    console.log(`⚠️  FIXING: ${ITEM_NAME}`);
                    console.log(`   Purchase: ${totalPurchase.toFixed(2)} | Sold: ${totalSold.toFixed(2)}`);
                    console.log(`   DB Stock: ${currentRemainingDb.toFixed(2)} -> Expected: ${expectedRem.toFixed(2)}`);

                    // --- RESET LOGIC ---
                    const bucketIds = buckets.map(b => b.id);

                    // 1. Reset Buckets to Full
                    for (const bucket of buckets) {
                        bucket.remainingQuantity = bucket.quantity;
                        await bucket.save({ transaction: t });
                    }

                    // 2. Clear Allocations
                    await SaleAllocation.destroy({
                        where: { containerItemId: { [Op.in]: bucketIds } },
                        transaction: t
                    });

                    // 3. Re-Allocate (FIFO)
                    for (const sale of sales) {
                        let remainingToFill = parseFloat(sale.quantity);

                        for (const bucket of buckets) {
                            if (remainingToFill <= 0.001) break;

                            // Re-read bucket state from memory (updated in loop)
                            const currentStock = parseFloat(bucket.remainingQuantity);
                            if (currentStock <= 0.001) continue;

                            const take = Math.min(currentStock, remainingToFill);

                            bucket.remainingQuantity = currentStock - take;
                            await bucket.save({ transaction: t });

                            await SaleAllocation.create({
                                saleId: sale.id,
                                containerItemId: bucket.id,
                                quantity: take
                            }, { transaction: t });

                            remainingToFill -= take;
                        }

                        if (remainingToFill > 0.01) {
                            console.warn(`   ⚠️ Sale ${sale.id} for ${ITEM_NAME} incomplete! Missing: ${remainingToFill}`);
                        }
                    }
                    console.log(`   ✅ Fixed ${ITEM_NAME}.`);
                } else {
                    // console.log(`   OK: ${ITEM_NAME}`);
                }

                await t.commit();

            } catch (innerErr) {
                if (t) await t.rollback();
                console.error(`❌ Error fixing ${ITEM_NAME}:`, innerErr.message);
            }
        }

        console.log('--- ALL ITEMS PROCESSED ---');

    } catch (error) {
        console.error('Meta Error:', error);
    } finally {
        await sequelize.close();
    }
}

recalculateStockAll();
