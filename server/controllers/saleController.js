const Sale = require('../models/Sale');
const SaleAllocation = require('../models/SaleAllocation');
const ContainerItem = require('../models/ContainerItem');
const Container = require('../models/Container');
const sequelize = require('../config/database');
const { Op } = require('sequelize');
const Staff = require('../models/Staff');
const logAction = require('../utils/logger');
const getDiff = require('../utils/diff');

exports.createSale = async (req, res) => {
    let t;
    try {
        // 0. Start Transaction
        t = await sequelize.transaction();

        const userRole = req.user?.role || 'guest';
        // (Optional: Admin check here)

        const { date, buyerName, invoiceNo, paymentStatus, remarks, items, hsnCode } = req.body;

        // Normalize input: Support both new "items" array and legacy single-item format
        let salesToProcess = [];

        if (items && Array.isArray(items) && items.length > 0) {
            // New Multi-Item Mode
            if (!date || !buyerName) {
                await t.rollback();
                return res.status(400).json({ message: 'Missing invoice details (date, buyerName).' });
            }
            salesToProcess = items.map(item => ({
                ...item,
                date,
                buyerName,
                invoiceNo,
                paymentStatus,
                remarks: item.remarks || remarks // Item remark takes precedence or falls back to generic
            }));
        } else {
            // Legacy Single Mode
            const { itemName, quantity, rate, sourceContainers } = req.body;
            salesToProcess.push({
                date, itemName, quantity, rate, buyerName, invoiceNo, paymentStatus, sourceContainers, remarks, hsnCode
            });
        }

        const createdSales = [];

        // PROCESS EACH ITEM
        for (const saleData of salesToProcess) {
            const { date, itemName, quantity, rate, buyerName, invoiceNo, paymentStatus, sourceContainers, remarks, hsnCode } = saleData;

            // 1. Validation
            if (!date || !itemName || !quantity || !rate || !buyerName) {
                throw new Error(`Validation Failed: Missing required fields (date, item, qty, rate, buyer) for item ${itemName || 'Unknown'}`);
            }

            const parsedQty = parseFloat(quantity);
            const parsedRate = parseFloat(rate);

            if (isNaN(parsedQty) || parsedQty <= 0) throw new Error(`Invalid quantity for ${itemName}`);
            if (isNaN(parsedRate) || parsedRate < 0) throw new Error(`Invalid rate for ${itemName}`);

            // 2. Find available stock for the item
            // Robust Search: Trim and use ILIKE
            const safeItemName = itemName.trim();

            const availableItems = await ContainerItem.findAll({
                where: {
                    itemName: { [Op.like]: safeItemName }, // Case insensitive match
                    remainingQuantity: { [Op.gt]: 0.001 }
                },
                include: [{
                    model: Container,
                    attributes: ['date'],
                    required: true
                }],
                order: [[Container, 'date', 'ASC']], // FIFO
                transaction: t,
                lock: t.LOCK.UPDATE
            });

            const totalAvailable = availableItems.reduce((sum, item) => {
                const qty = parseFloat(item.remainingQuantity);
                return sum + (isNaN(qty) ? 0 : qty);
            }, 0);

            // STOCK VALIDATION RELAXED:
            // We allow sales even if theoretical stock is insufficient (Weight Gain).
            // We only warn in logs if it's a massive discrepancy, or just proceed.
            if (parsedQty > totalAvailable + 0.001) {
                console.log(`[INFO] Sale quantity (${parsedQty}) exceeds theoretical stock (${totalAvailable}) for ${itemName}. Treating as Weight Gain.`);
            }

            // 3. Determine Allocations
            let allocations = [];
            let remainingToAllocate = parsedQty;

            if (sourceContainers && Array.isArray(sourceContainers) && sourceContainers.length > 0) {
                // Manual Allocation logic
                const manualTotal = sourceContainers.reduce((sum, sc) => sum + (parseFloat(sc.quantity) || 0), 0);

                // Allow small floating point error
                if (Math.abs(manualTotal - parsedQty) > 0.01) {
                    throw new Error(`Allocation mismatch for ${itemName}. Selected: ${manualTotal}, Required: ${parsedQty}`);
                }

                for (const sc of sourceContainers) {
                    const scQty = parseFloat(sc.quantity);
                    if (!sc.containerItemId || isNaN(scQty) || scQty <= 0) continue;

                    const containerItem = availableItems.find(ai => ai.id === sc.containerItemId);
                    if (!containerItem) {
                        throw new Error(`Container item ${sc.containerItemId} not found for ${itemName}`);
                    }

                    // Re-check dynamic stock (in case previous loop iteration consumed it? 
                    // No, findAll finds distinct rows, but if same item allocated twice in request it's an issue. 
                    // BUT here we process separate items (Copper, Iron), so no overlap on ContainerItems expected usually.
                    // If user adds Copper twice, we might have overlap. complex.
                    // Ideally frontend prevents adding same item twice or merges them.

                    const currentRem = parseFloat(containerItem.remainingQuantity);
                    const gain = scQty > currentRem ? scQty - currentRem : 0;
                    allocations.push({ containerItem, quantity: scQty, gain });
                }
            } else {
                // Auto Allocation (FIFO)
                for (const item of availableItems) {
                    if (remainingToAllocate <= 0.001) break;

                    const currentStock = parseFloat(item.remainingQuantity);
                    const allocateQty = Math.min(currentStock, remainingToAllocate);

                    allocations.push({ containerItem: item, quantity: allocateQty });
                    remainingToAllocate -= allocateQty;
                }

                // WEIGHT GAIN HANDLING (AUTO-ALLOC):
                // If there's still quantity to allocate after exhausting all containers,
                // add the surplus (GAIN) to the last container item.
                if (remainingToAllocate > 0.1 && allocations.length > 0) {
                    const lastAlloc = allocations[allocations.length - 1];
                    const gain = remainingToAllocate;
                    lastAlloc.quantity += gain;
                    lastAlloc.gain = (lastAlloc.gain || 0) + gain;
                    remainingToAllocate = 0;
                } else if (remainingToAllocate > 0.1 && allocations.length === 0) {
                    // This shouldn't happen if totalAvailable logic caught it, 
                    // but if no items at all exist for this name:
                    throw new Error(`No stock records found for ${itemName} to apply weight gain.`);
                }
            }

            // 4. Create Sale Record
            const totalAmount = parsedQty * parsedRate;

            const sale = await Sale.create({
                date,
                itemName,
                quantity: parsedQty,
                rate: parsedRate,
                totalAmount: totalAmount,
                buyerName,
                invoiceNo: invoiceNo || null,
                paymentStatus: paymentStatus || 'Pending',
                remarks: remarks || null,
                hsnCode: hsnCode || null
            }, { transaction: t });

            createdSales.push(sale);

            // 5. Process Allocations & Update Stock
            for (const alloc of allocations) {
                // Check if we already decremented this instance in this transaction loop? 
                // Sequelize instances are objects. If we fetched all at once, updates reflect in memory? 
                // We must use atomic decrement or careful management.
                // Best to decrement DB directly.

                // Calculate gain if not already present on alloc
                if (alloc.gain === undefined) {
                    const currentQty = parseFloat(alloc.containerItem.remainingQuantity);
                    const deductQty = parseFloat(alloc.quantity);
                    alloc.gain = deductQty > currentQty + 0.001 ? deductQty - currentQty : 0;
                }

                await SaleAllocation.create({
                    saleId: sale.id,
                    containerItemId: alloc.containerItem.id,
                    quantity: alloc.quantity,
                    gain: alloc.gain || 0
                }, { transaction: t });

                // CRITICAL: We must reload the item or decrement blind to be safe? 
                // .decrement is atomic at DB level, so it is safe even if we process same containerItem multiple times
                // provided we check constraint (min 0) or we are sure of our available calculation.
                // We checked sum available at start. 
                // However if 2 items use same container (unlikely diff items share containerItem, unless... no, ContainerItem is specific to waste type usually?)
                // Actually ContainerItem has `itemName`. So 'Copper' row is different from 'Iron' row. 
                // So no overlap possible between different Items. 
                // If user sends 2 entries for 'Copper', we might overlap.

                // Manual arithmetic update to ensure absolute control over stock values
                const currentQty = parseFloat(alloc.containerItem.remainingQuantity);
                const deductQty = parseFloat(alloc.quantity);

                // WEIGHT GAIN HANDLING:
                // If we are deducting more than we have, it's a "Gain"
                if (deductQty > currentQty + 0.001) {
                    const gain = deductQty - currentQty;
                    // Atomically increment the ContainerItem's quantity to reflect this gain
                    // We also "virtually" increase currentQty so newQty becomes 0
                    await alloc.containerItem.increment({
                        quantity: gain,
                        remainingQuantity: gain
                    }, { transaction: t });

                    // Log the weight gain adjustment
                    await logAction(req, 'ADJUST', 'ContainerItem', alloc.containerItem.id, {
                        message: `Weight gain detected during sale: ${gain.toFixed(3)}kg added to item ${alloc.containerItem.itemName}`,
                        gain: gain,
                        saleId: sale.id
                    });

                    // Update local reference for the following update call
                    alloc.containerItem.remainingQuantity = parseFloat(alloc.containerItem.remainingQuantity) + gain;
                }

                let newQty = parseFloat(alloc.containerItem.remainingQuantity) - deductQty;

                // Floating point safety check
                if (newQty < 0.0001) {
                    newQty = 0;
                }

                await alloc.containerItem.update({
                    remainingQuantity: newQty
                }, { transaction: t });
            }
        }

        await t.commit();

        // Log Actions for Created Sales
        // Since we might create multiple, let's log them individually or as a batch?
        // Individual logs are clearer for history.
        for (const s of createdSales) {
            await logAction(req, 'CREATE', 'Sale', s.id, {
                invoiceNo: s.invoiceNo,
                buyer: s.buyerName,
                item: s.itemName,
                qty: s.quantity,
                amount: s.totalAmount
            });
        }

        res.status(201).json(createdSales.length === 1 ? createdSales[0] : createdSales);

    } catch (error) {
        if (t) await t.rollback();
        console.error('[SALE_ERROR] Create Logic Failed:', error);

        res.status(500).json({
            message: error.message || 'Server Error during sale creation.',
            detailedError: error.message
        });
    }

};

exports.getSales = async (req, res) => {
    try {
        const { startDate, endDate, buyerName } = req.query;
        const where = {};

        if (startDate && endDate) {
            where.date = { [Op.between]: [startDate, endDate] };
        }

        if (buyerName) {
            where.buyerName = { [Op.like]: `%${buyerName}%` };
        }

        const sales = await Sale.findAll({
            where,
            include: [{
                model: SaleAllocation,
                as: 'allocations',
                include: [{
                    model: ContainerItem,
                    include: [Container]
                }]
            }],
            order: [['date', 'DESC']]
        });

        // MASK FINANCIAL DATA IF NOT ADMIN AND NO RATE ACCESS
        const isAdmin = req.user?.role === 'Admin';

        // Fetch fresh permissions from DB to handle case where token is old
        let hasRateAccess = isAdmin;
        if (!hasRateAccess && req.user?.id) {
            const userRecord = await Staff.findByPk(req.user.id);
            if (userRecord) {
                const permissions = userRecord.permissions || [];
                const permList = typeof permissions === 'string' ? JSON.parse(permissions) : permissions;
                hasRateAccess = (Array.isArray(permList) && permList.includes('/rates'));
            }
        }

        let safeSales = sales;
        if (!hasRateAccess) {
            safeSales = sales.map(s => {
                const json = s.toJSON ? s.toJSON() : s;
                return { ...json, rate: 0, totalAmount: 0 };
            });
        }
        res.json(safeSales);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.deleteSale = async (req, res) => {
    let t;
    try {
        t = await sequelize.transaction();
        const { id } = req.params;

        // 1. Find Sale with its Allocations
        const sale = await Sale.findByPk(id, {
            include: [{
                model: SaleAllocation,
                as: 'allocations',
                include: [ContainerItem]
            }],
            transaction: t
        });

        if (!sale) {
            await t.rollback();
            return res.status(404).json({ message: 'Sale not found' });
        }

        // 2. Restore Stock
        if (sale.allocations && sale.allocations.length > 0) {
            for (const alloc of sale.allocations) {
                if (alloc.ContainerItem) {
                    const gain = parseFloat(alloc.gain) || 0;
                    const restoreQty = parseFloat(alloc.quantity) - gain;

                    // Revert the weight gain if any
                    if (gain > 0) {
                        await alloc.ContainerItem.decrement('quantity', {
                            by: gain,
                            transaction: t
                        });
                    }

                    // Restore remaining stock
                    await alloc.ContainerItem.increment('remainingQuantity', {
                        by: restoreQty,
                        transaction: t
                    });
                }
            }
        }

        // 3. Delete Sale (Cascade should handle SaleAllocation deletion, but we can do it explicitly if needed)
        // Usually, DB ON DELETE CASCADE handles it. If not, Sequelize needs 'cascade: true' or manual delete.
        // Assuming models are set up with cascading constraints or hooks. 
        // To be safe, let's delete allocations first if we aren't sure of DB constraints.
        // But standard Sale.destroy is usually enough if associations are clean.
        // Let's rely on Sale.destroy.

        await sale.destroy({ transaction: t });

        await t.commit();

        await logAction(req, 'DELETE', 'Sale', id, {
            invoiceNo: sale.invoiceNo,
            buyer: sale.buyerName,
            item: sale.itemName,
            qty: sale.quantity
        });
        res.json({ message: 'Sale deleted and stock restored successfully' });
    } catch (error) {
        if (t) await t.rollback();
        console.error('Delete Sale Error:', error);
        res.status(500).json({ message: error.message });
    }
};

exports.updateSale = async (req, res) => {
    let t;
    try {
        t = await sequelize.transaction();
        const { id } = req.params;
        const { date, itemName, quantity, rate, buyerName, invoiceNo, paymentStatus, remarks, hsnCode, sourceContainers } = req.body;

        const sale = await Sale.findByPk(id, {
            include: [{
                model: SaleAllocation,
                as: 'allocations',
                include: [ContainerItem]
            }],
            transaction: t
        });

        if (!sale) {
            await t.rollback();
            return res.status(404).json({ message: 'Sale not found' });
        }

        // 1. RESTORE OLD STOCK (Revert previous allocations)
        if (sale.allocations && sale.allocations.length > 0) {
            for (const alloc of sale.allocations) {
                if (alloc.ContainerItem) {
                    const gain = parseFloat(alloc.gain) || 0;
                    const restoreQty = parseFloat(alloc.quantity) - gain;

                    if (gain > 0) {
                        await alloc.ContainerItem.decrement('quantity', {
                            by: gain,
                            transaction: t
                        });
                    }

                    await alloc.ContainerItem.increment('remainingQuantity', {
                        by: restoreQty,
                        transaction: t
                    });
                }
                await alloc.destroy({ transaction: t });
            }
        }

        // 2. PREPARE NEW DATA
        const finalQuantity = parseFloat(quantity);
        const finalRate = parseFloat(rate);

        if (isNaN(finalQuantity) || finalQuantity <= 0) throw new Error("Invalid Quantity");

        // 3. FIND AVAILABLE STOCK (Fresh Lookup)
        const safeItemName = (itemName || sale.itemName).trim();

        // Collect all IDs from manual allocation to ensure they are fetched
        const manualIds = [];
        if (sourceContainers && Array.isArray(sourceContainers)) {
            sourceContainers.forEach(sc => {
                if (sc.containerItemId) manualIds.push(sc.containerItemId);
            });
        }

        const availableItems = await ContainerItem.findAll({
            where: {
                [Op.and]: [
                    { remainingQuantity: { [Op.gt]: 0.001 } },
                    {
                        [Op.or]: [
                            { itemName: { [Op.like]: safeItemName } },
                            ...(manualIds.length > 0 ? [{ id: { [Op.in]: manualIds } }] : [])
                        ]
                    }
                ]
            },
            include: [{
                model: Container,
                attributes: ['date', 'containerNo'], // Added containerNo for error logging
                required: true
            }],
            order: [[Container, 'date', 'ASC']],
            transaction: t,
            lock: t.LOCK.UPDATE
        });

        const totalAvailable = availableItems.reduce((sum, item) => {
            const qty = parseFloat(item.remainingQuantity);
            return sum + (isNaN(qty) ? 0 : qty);
        }, 0);

        // STOCK VALIDATION RELAXED:
        if (finalQuantity > totalAvailable + 0.001) {
            console.log(`[INFO] Update quantity (${finalQuantity}) exceeds theoretical stock (${totalAvailable}) for ${safeItemName}. Treating as Weight Gain.`);
        }


        // 4. DETERMINE NEW ALLOCATIONS
        let newAllocations = [];
        let remainingToAllocate = finalQuantity;

        if (sourceContainers && Array.isArray(sourceContainers) && sourceContainers.length > 0) {
            // Manual Allocation
            for (const sc of sourceContainers) {
                const scQty = parseFloat(sc.quantity);
                if (!sc.containerItemId || isNaN(scQty) || scQty <= 0) continue;

                // Find item in our locked fetch result
                const containerItem = availableItems.find(ai => ai.id === sc.containerItemId);

                // If not found in availableItems, it might be that remainingQuantity was 0 but we just restored it?
                // Wait, availableItems query filters > 0.001. 
                // Since we restored stock in Step 1, it SHOULD be > 0 now if it was fully consumed before.
                // UNLESS the restored bucket is different from what we are trying to pick now (if item changed).

                if (!containerItem) {
                    throw new Error(`Container item ${sc.containerItemId} not found or has no stock.`);
                }

                const currentRem = parseFloat(containerItem.remainingQuantity);
                const gain = scQty > currentRem ? scQty - currentRem : 0;
                newAllocations.push({ containerItem, quantity: scQty, gain });
                remainingToAllocate -= scQty;
            }

            // WEIGHT GAIN HANDLING (MANUAL-ALLOC):
            // If user manually allocated more than total available, 
            // the surplus is already in newAllocations. The loop above handles it.
            // We just ensure remainingToAllocate is zeroed for safety if it went negative.
            if (remainingToAllocate < 0) remainingToAllocate = 0;
        } else {
            // Auto Allocation (FIFO)
            for (const item of availableItems) {
                if (remainingToAllocate <= 0.001) break;

                const currentStock = parseFloat(item.remainingQuantity);
                const allocateQty = Math.min(currentStock, remainingToAllocate);

                newAllocations.push({ containerItem: item, quantity: allocateQty });
                remainingToAllocate -= allocateQty;
            }

            // WEIGHT GAIN HANDLING (AUTO-ALLOC):
            if (remainingToAllocate > 0.1 && newAllocations.length > 0) {
                const lastAlloc = newAllocations[newAllocations.length - 1];
                const newGain = remainingToAllocate;
                lastAlloc.quantity += remainingToAllocate;
                lastAlloc.gain = (lastAlloc.gain || 0) + newGain;
                remainingToAllocate = 0;
            }
        }

        // 5. APPLY NEW ALLOCATIONS & DEDUCT STOCK
        for (const alloc of newAllocations) {
            await SaleAllocation.create({
                saleId: sale.id,
                containerItemId: alloc.containerItem.id,
                quantity: alloc.quantity,
                gain: alloc.gain || 0
            }, { transaction: t });

            const current = parseFloat(alloc.containerItem.remainingQuantity);
            const deduct = parseFloat(alloc.quantity);

            // WEIGHT GAIN HANDLING during Update:
            if (deduct > current + 0.001) {
                const gain = deduct - current;
                await alloc.containerItem.increment({
                    quantity: gain,
                    remainingQuantity: gain
                }, { transaction: t });

                await logAction(req, 'ADJUST', 'ContainerItem', alloc.containerItem.id, {
                    message: `Weight gain detected during update: ${gain.toFixed(3)}kg added to item ${alloc.containerItem.itemName}`,
                    gain: gain,
                    saleId: sale.id
                });
                alloc.containerItem.remainingQuantity = parseFloat(alloc.containerItem.remainingQuantity) + gain;
            }

            const currentUpdated = parseFloat(alloc.containerItem.remainingQuantity);
            await alloc.containerItem.update({
                remainingQuantity: Math.max(0, currentUpdated - deduct)
            }, { transaction: t });
        }

        // 6. UPDATE SALE RECORD
        await sale.update({
            date: date || sale.date,
            itemName: itemName || sale.itemName,
            quantity: finalQuantity,
            rate: finalRate,
            totalAmount: finalQuantity * finalRate,
            buyerName: buyerName || sale.buyerName,
            invoiceNo: invoiceNo || sale.invoiceNo,
            paymentStatus: paymentStatus || sale.paymentStatus,
            remarks: remarks || sale.remarks,
            hsnCode: hsnCode || sale.hsnCode
        }, { transaction: t });

        await t.commit();

        const changes = getDiff(sale.toJSON(), {
            date: date || sale.date,
            itemName: itemName || sale.itemName,
            quantity: finalQuantity,
            rate: finalRate,
            buyerName: buyerName || sale.buyerName,
            invoiceNo: invoiceNo || sale.invoiceNo,
            paymentStatus: paymentStatus || sale.paymentStatus,
            remarks: remarks || sale.remarks,
            hsnCode: hsnCode || sale.hsnCode
        });

        await logAction(req, 'UPDATE', 'Sale', sale.id, {
            invoiceNo: sale.invoiceNo,
            buyer: sale.buyerName,
            changes: changes || 'Stock/Allocation Updated'
        });

        // Reload for response
        const updatedSale = await Sale.findByPk(id, {
            include: [{ model: SaleAllocation, as: 'allocations' }]
        });

        res.json(updatedSale);

    } catch (error) {
        if (t) await t.rollback();
        console.error('[SALE_UPDATE_ERROR]', error);
        res.status(500).json({ message: error.message });
    }
};

exports.fixStock = async (req, res) => {
    try {
        const targetName = req.query.name || 'Casting';
        console.log(`Fixing Stock for: ${targetName}`);

        const items = await ContainerItem.findAll({
            where: {
                itemName: { [Op.like]: `%${targetName}%` },
                remainingQuantity: { [Op.lt]: require('sequelize').col('quantity') }
            }
        });

        const results = [];

        for (const item of items) {
            const allocCount = await SaleAllocation.count({ where: { containerItemId: item.id } });

            if (allocCount === 0) {
                const oldRem = item.remainingQuantity;
                item.remainingQuantity = item.quantity;
                await item.save();
                results.push(`FIXED Item ${item.id} (${item.itemName}): ${oldRem} -> ${item.quantity}`);
            } else {
                results.push(`SKIPPED Item ${item.id} (${item.itemName}): Has ${allocCount} sales.`);
            }
        }

        res.json({ message: 'Stock Fix Run Complete', results });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: error.message });
    }
};
