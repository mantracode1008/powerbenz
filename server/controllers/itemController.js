const Item = require('../models/Item');
const ContainerItem = require('../models/ContainerItem');
const Container = require('../models/Container');
const ItemRateHistory = require('../models/ItemRateHistory');
const sequelize = require('../config/database');
const { Op } = require('sequelize');

exports.getItems = async (req, res) => {
    try {
        const items = await Item.findAll({
            order: [['order', 'ASC'], ['name', 'ASC']]
        });

        // Get stock for all items
        const stocks = await ContainerItem.findAll({
            attributes: [
                'itemName',
                [sequelize.fn('SUM', sequelize.col('remainingQuantity')), 'totalStock']
            ],
            where: {
                remainingQuantity: { [Op.gt]: 0.001 }
            },
            group: ['itemName'],
            raw: true
        });

        // Robust Normalization Map
        const stockMap = {};
        stocks.forEach(s => {
            if (s.itemName) {
                const cleanKey = s.itemName.trim().toLowerCase();
                if (!stockMap[cleanKey]) {
                    stockMap[cleanKey] = {
                        originalName: s.itemName,
                        total: 0
                    };
                }
                stockMap[cleanKey].total += parseFloat(s.totalStock || 0);
            }
        });

        // Map to match frontend expectation of _id
        const formattedItems = items.map(item => {
            const cleanKey = item.name.trim().toLowerCase();
            let stock = 0;
            if (stockMap[cleanKey]) {
                stock = stockMap[cleanKey].total;
                delete stockMap[cleanKey]; // Remove matched items to find orphans
            }
            return {
                _id: item.id,
                itemId: item.id,
                name: item.name,
                defaultRate: item.defaultRate,
                category: item.category,
                hsnCode: item.hsnCode,
                order: item.order,
                currentStock: stock,
                updatedAt: item.updatedAt
            };
        });

        // Add Orphaned Items (Items with stock but no Master record)
        Object.values(stockMap).forEach(orphan => {
            // Show ALL items found in history, regardless of stock level, to match user expectation
            formattedItems.push({
                _id: `orphan-${orphan.originalName}`, // Temp ID
                itemId: `orphan-${orphan.originalName}`,
                name: orphan.originalName,
                defaultRate: 0,
                category: 'Uncategorized',
                hsnCode: '7204',
                order: 9999,
                currentStock: orphan.total
            });
        });

        // Sort again to mix orphans in alphabetically
        formattedItems.sort((a, b) => a.name.localeCompare(b.name));

        res.status(200).json(formattedItems);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.createItem = async (req, res) => {
    try {
        const { name, defaultRate, category, hsnCode } = req.body;

        // Check for duplicate name (case-insensitive)
        const existingItem = await Item.findOne({
            where: sequelize.where(
                sequelize.fn('lower', sequelize.col('name')),
                sequelize.fn('lower', name)
            )
        });

        if (existingItem) {
            return res.status(400).json({ message: 'Item with this name already exists' });
        }

        // Sanitize numeric input: Convert "" to null (if allowable) or 0
        let rate = defaultRate;
        if (rate === '' || rate === null || rate === undefined) {
            rate = 0;
        }

        const count = await Item.count();
        const newItem = await Item.create({
            name: name,
            defaultRate: rate,
            category: category || 'General',
            hsnCode: hsnCode,
            order: count + 1
        });
        res.status(201).json({ _id: newItem.id, ...newItem.toJSON() });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.updateItem = async (req, res) => {
    const t = await sequelize.transaction();
    try {
        const { id } = req.params;
        const { name } = req.body;

        // SCENARIO 1: Handle "Orphan" Items (Items existing in transactions but not in Master List)
        // ID format from ItemSummary: "orphan-ITEMNAME" (where ITEMNAME is usually UPPERCASE)
        if (id.toString().startsWith('orphan-')) {
            const oldNameNormalized = id.replace('orphan-', ''); // This is the UPPERCASE name

            if (!name) {
                await t.rollback();
                return res.status(400).json({ message: 'Name is required for renaming' });
            }

            console.log(`[UPDATE] Renaming Orphan Item: ${oldNameNormalized} -> ${name}`);

            // Update all occurrences in ContainerItems to the new name
            // We match against the Normalized (UPPER) name to catch all case-variations
            const [updatedCount] = await ContainerItem.update({ itemName: name }, {
                where: sequelize.where(
                    sequelize.fn('upper', sequelize.fn('trim', sequelize.col('itemName'))),
                    oldNameNormalized
                ),
                transaction: t
            });

            await t.commit();
            return res.status(200).json({
                message: 'Item renamed successfully',
                rowsUpdated: updatedCount,
                _id: `orphan-${name.trim().toUpperCase()}`, // Return new "ID" approximation
                name: name
            });
        }

        // SCENARIO 2: Master Item Update
        const item = await Item.findByPk(id, { transaction: t });
        if (!item) {
            await t.rollback();
            return res.status(404).json({ message: 'Item not found' });
        }

        // Sanitize defaultRate if present in body
        if (req.body.defaultRate !== undefined) {
            if (req.body.defaultRate === '') {
                req.body.defaultRate = 0;
            }
        }

        // Check if rate changed to record history
        if (req.body.defaultRate !== undefined && parseFloat(req.body.defaultRate) !== item.defaultRate) {
            await ItemRateHistory.create({
                itemId: item.id,
                itemName: item.name,
                oldRate: item.defaultRate,
                newRate: req.body.defaultRate,
                changedBy: req.user ? req.user.name : 'System'
            }, { transaction: t });
        }

        const oldName = item.name;

        // Update Master Record
        await item.update(req.body, { transaction: t });

        // Propagate Name Change to Transaction History (ContainerItems)
        // If the name changed, we MUST update the history so reports stay consistent
        if (name && name.trim().toLowerCase() !== oldName.trim().toLowerCase()) {
            console.log(`[UPDATE] Propagating Item Name Change: ${oldName} -> ${name}`);
            await ContainerItem.update({ itemName: name }, {
                where: sequelize.where(
                    sequelize.fn('lower', sequelize.fn('trim', sequelize.col('itemName'))),
                    oldName.trim().toLowerCase()
                ),
                transaction: t
            });
        }

        await t.commit();
        res.status(200).json({ _id: item.id, ...item.toJSON() });

    } catch (error) {
        await t.rollback();
        console.error("Update Item Error:", error);
        res.status(500).json({ message: error.message });
    }
};

exports.deleteItem = async (req, res) => {
    try {
        const item = await Item.findByPk(req.params.id);
        if (!item) {
            return res.status(404).json({ message: 'Item not found' });
        }
        await item.destroy();
        res.status(200).json({ message: 'Item deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.getAvailableContainers = async (req, res) => {
    try {
        const { id } = req.params;
        let searchName = '';

        if (id && id.toString().startsWith('orphan-')) {
            // Extract identifier part of orphan-Identifier
            searchName = id.toString().replace('orphan-', '');
        } else {
            const item = await Item.findByPk(id);

            if (!item) {
                return res.status(404).json({ message: 'Item not found' });
            }
            searchName = item.name;
        }

        // Clean the search name
        const cleanSearchName = searchName.trim().toLowerCase();

        // Parse includeIds (for Edit Sale: include items even if 0 stock)
        const { includeIds, mode, startDate, endDate, month, date } = req.query;
        let includeIdList = [];
        if (includeIds) {
            includeIdList = Array.isArray(includeIds) ? includeIds : includeIds.split(',');
        }

        // Date Filtering Logic
        let dateWhere = {};
        if (mode === 'history') {
            let start, end;

            if (month) {
                const [year, m] = month.split('-');
                start = new Date(year, m - 1, 1);
                end = new Date(year, m, 0, 23, 59, 59, 999);
            } else if (date) {
                start = new Date(date); start.setHours(0, 0, 0, 0);
                end = new Date(date); end.setHours(23, 59, 59, 999);
            } else if (startDate && endDate) {
                start = new Date(startDate); start.setHours(0, 0, 0, 0);
                end = new Date(endDate); end.setHours(23, 59, 59, 999);
            }

            if (start && end) {
                dateWhere = {
                    [Op.or]: [
                        { unloadDate: { [Op.between]: [start, end] } },
                        {
                            unloadDate: null,
                            '$Container.date$': { [Op.between]: [start, end] }
                        }
                    ]
                };
            }
        }

        const quantityFilter = mode === 'history'
            ? {} // Show ALL items in history mode
            : {
                [Op.or]: [
                    { remainingQuantity: { [Op.gt]: 0.001 } },
                    ...(includeIdList.length > 0 ? [{ id: { [Op.in]: includeIdList } }] : [])
                ]
            };

        console.log('getAvailableContainers Query:', req.query);
        console.log('Search Name:', cleanSearchName);
        console.log('Date Where:', JSON.stringify(dateWhere));
        console.log('Quantity Filter:', JSON.stringify(quantityFilter));

        const containerItems = await ContainerItem.findAll({
            where: {
                // Fuzzy match: TRIM(LOWER(itemName)) == cleanSearchName
                [Op.and]: [
                    sequelize.where(
                        sequelize.fn('trim', sequelize.fn('lower', sequelize.col('itemName'))),
                        cleanSearchName
                    ),
                    quantityFilter,
                    dateWhere
                ]
            },
            include: [{
                model: Container,
                as: 'Container', // Aliased for explicit reference in where clause
                attributes: ['containerNo', 'date', 'firmId', 'firm', 'containerWeight', 'assortmentWeight']
            }],
            order: [
                ['unloadDate', 'DESC'], // Sort by Item Date most recent first
                [{ model: Container, as: 'Container' }, 'date', 'DESC']
            ]
        });
        console.log('Found Items:', containerItems.length);

        res.json(containerItems);
    } catch (error) {
        // Handle invalid UUID syntax (e.g. if orphan ID passed to findByPk by mistake)
        if (error.name === 'SequelizeDatabaseError' && error.parent && error.parent.code === '22P02') {
            return res.status(404).json({ message: 'Item not found (Invalid ID)' });
        }
        res.status(500).json({ message: error.message });
    }
};

exports.bulkUpdateRate = async (req, res) => {
    const t = await sequelize.transaction();
    try {
        const { id } = req.params;
        const { rate } = req.body;

        const item = await Item.findByPk(id);
        if (!item) {
            await t.rollback();
            return res.status(404).json({ message: 'Item not found' });
        }

        const newRate = parseFloat(rate) || 0;
        const itemName = item.name.trim();

        // 1. Find all matching ContainerItems (Case Insensitive & Trimmed)
        const containerItems = await ContainerItem.findAll({
            where: sequelize.where(
                sequelize.fn('lower', sequelize.col('itemName')),
                itemName.toLowerCase()
            ),
            transaction: t
        });

        // 2. Update each item's rate and amount
        const touchedContainerIds = new Set();

        for (const ci of containerItems) {
            const qty = parseFloat(ci.quantity) || 0;
            const newAmount = qty * newRate;

            ci.rate = newRate;
            ci.amount = newAmount;
            await ci.save({ transaction: t });

            if (ci.containerId) {
                touchedContainerIds.add(ci.containerId);
            }
        }

        // 3. Recalculate totals for all affected Containers
        for (const containerId of touchedContainerIds) {
            // Calculate sum of all items in this container
            const total = await ContainerItem.sum('amount', {
                where: { containerId: containerId },
                transaction: t
            });

            await Container.update({ totalAmount: total || 0 }, {
                where: { id: containerId },
                transaction: t
            });
        }

        // 4. Record History
        const oldRate = item.defaultRate || 0;
        await ItemRateHistory.create({
            itemId: item.id,
            itemName: item.name,
            oldRate: oldRate,
            newRate: newRate,
            effectiveDate: new Date(),
            changedBy: req.user ? req.user.name : 'Admin (Bulk)'
        }, { transaction: t });

        // Update item master rate as well if not already done
        await item.update({ defaultRate: newRate }, { transaction: t });

        await t.commit();
        res.status(200).json({
            message: `Updated rate for ${containerItems.length} entries and recalculated ${touchedContainerIds.size} containers.`
        });

    } catch (error) {
        await t.rollback();
        console.error("Bulk Update Error:", error);
        res.status(500).json({ message: error.message });
    }
};

exports.getRateHistory = async (req, res) => {
    try {
        const history = await ItemRateHistory.findAll({
            order: [['createdAt', 'DESC']],
            limit: 500
        });
        res.json(history);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.batchUpdateItems = async (req, res) => {
    const t = await sequelize.transaction();
    try {
        const { items } = req.body; // Expects [{ _id/id, defaultRate, hsnCode, category }]

        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ message: 'No items provided for update' });
        }

        let updatedCount = 0;

        for (const itemData of items) {
            const id = itemData._id || itemData.id;

            // Skip orphans (temporary IDs)
            if (String(id).startsWith('orphan-')) continue;

            // 1. Fetch current item to compare rates
            const currentItem = await Item.findByPk(id, { transaction: t });

            if (!currentItem) continue;

            const oldRate = parseFloat(currentItem.defaultRate) || 0;
            const newRate = parseFloat(itemData.defaultRate) || 0;

            // 2. Log History if Rate Changed
            if (Math.abs(newRate - oldRate) > 0.001) {
                await ItemRateHistory.create({
                    itemId: currentItem.id,
                    itemName: currentItem.name,
                    oldRate: oldRate,
                    newRate: newRate,
                    effectiveDate: new Date(),
                    changedBy: req.user ? req.user.name : 'Batch Update'
                }, { transaction: t });
            }

            // 3. Update Item
            await currentItem.update({
                defaultRate: newRate,
                hsnCode: itemData.hsnCode,
                category: itemData.category
            }, { transaction: t });

            updatedCount++;
        }

        await t.commit();
        res.status(200).json({ message: `Successfully updated ${updatedCount} items` });
    } catch (error) {
        await t.rollback();
        console.error("Batch Update Error:", error);
        res.status(500).json({ message: error.message });
    }
};

