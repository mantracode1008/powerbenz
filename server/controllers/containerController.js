const Container = require('../models/Container');
const ContainerItem = require('../models/ContainerItem');
const Item = require('../models/Item');
const ExcelJS = require('exceljs');
const { Op } = require('sequelize');
const sequelize = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const logAction = require('../utils/logger');
const getDiff = require('../utils/diff');
const Staff = require('../models/Staff');

exports.checkActiveContainer = async (req, res) => {
    try {
        const { containerNo } = req.query;
        if (!containerNo) return res.status(400).json({ message: 'Container No is required' });

        const container = await Container.findOne({
            where: { containerNo },
            include: 'items',
            order: [['date', 'DESC']]
        });

        if (!container) {
            return res.json({ active: false, exists: false });
        }

        const now = new Date();
        const containerDate = new Date(container.date);
        const diffTime = Math.abs(now - containerDate);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        const isActive = diffDays <= 15;

        // Mask Rates if unauthorized (Checked against Role or Permission)
        const permissions = req.user?.permissions || [];
        const permList = typeof permissions === 'string' ? JSON.parse(permissions) : permissions;
        const canViewRates = !req.user || req.user.role === 'Admin' || (Array.isArray(permList) && permList.includes('/rates'));
        let items = container.items || [];

        if (!canViewRates) {
            items = items.map(item => {
                const i = item.toJSON ? item.toJSON() : item;
                return { ...i, rate: 0, amount: 0 };
            });
        }

        res.json({
            active: isActive,
            exists: true,
            containerId: container.id,
            daysOld: diffDays,
            date: container.date,
            // Return full details for auto-fill
            details: {
                date: container.date,
                firm: container.firm,
                firmId: container.firmId,
                worker: container.worker,
                vehicleNo: container.vehicleNo,
                containerWeight: container.containerWeight,
                assortmentWeight: container.assortmentWeight,
                lrNo: container.lrNo,
                blNo: container.blNo,
                lrNo: container.lrNo,
                blNo: container.blNo,
                remarks: container.remarks, // Scrap Type
                items: items // Return items (masked if needed)
            }
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.createContainer = async (req, res) => {
    try {
        const containerData = req.body;
        const items = containerData.items || [];

        // Ensure standard formatting
        if (containerData.containerNo) {
            containerData.containerNo = containerData.containerNo.trim().toUpperCase();
        }
        if (containerData.vehicleNo) {
            containerData.vehicleNo = containerData.vehicleNo.toUpperCase();
        }

        // Sanitize numeric fields
        ['containerWeight', 'assortmentWeight', 'totalAmount', 'workerCount'].forEach(field => {
            if (containerData[field] === '' || containerData[field] === undefined) {
                containerData[field] = null;
            } else {
                const val = parseFloat(containerData[field]);
                containerData[field] = isNaN(val) ? 0 : val;
            }
        });

        const unloadDateStr = containerData.unloadDate ? new Date(containerData.unloadDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
        const startOfDay = new Date(unloadDateStr); startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(unloadDateStr); endOfDay.setHours(23, 59, 59, 999);

        // 1. Check for EXISTING Container Entry for this Container No AND Date
        let container = await Container.findOne({
            where: {
                containerNo: containerData.containerNo,
                unloadDate: {
                    [Op.between]: [startOfDay, endOfDay]
                }
            }
        });

        const unloadDate = new Date(unloadDateStr);

        if (container) {
            // Update Existing Daily Entry
            await container.update({
                firm: containerData.firm,
                firmId: containerData.firmId,
                worker: containerData.worker,
                workerCount: containerData.workerCount, // Added workerCount
                vehicleNo: containerData.vehicleNo,
                containerWeight: containerData.containerWeight,
                assortmentWeight: containerData.assortmentWeight,
                lrNo: containerData.lrNo,
                blNo: containerData.blNo,
                remarks: containerData.remarks,
                unloadDate: unloadDate
            });
        } else {
            // Create New Daily Entry
            // Calculate initial total amount if items exist
            let initialTotal = 0;
            if (items && items.length > 0) {
                initialTotal = items.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);
            }

            container = await Container.create({
                ...containerData,
                unloadDate: unloadDate,
                totalAmount: initialTotal
            });
        }

        // Append Items with specific Unload Date
        if (items && items.length > 0) {
            const itemsToCreate = [];

            items.forEach(item => {
                const qty = parseFloat(item.quantity);
                const rate = parseFloat(item.rate);
                const amt = parseFloat(item.amount);

                // Add item if it has quantity or amount
                if ((qty > 0 || amt > 0) && item.itemName) {
                    itemsToCreate.push({
                        containerId: container.id,
                        itemName: item.itemName,
                        quantity: isNaN(qty) ? 0 : qty,
                        rate: isNaN(rate) ? 0 : rate,
                        amount: isNaN(amt) ? 0 : amt,
                        remainingQuantity: isNaN(qty) ? 0 : qty,
                        unloadDate: unloadDate // Critical: Tag with this entry's date
                    });
                }
            });

            if (itemsToCreate.length > 0) {
                await ContainerItem.bulkCreate(itemsToCreate);

                // Update Container Total Amount (Increment)
                // If it's a new container, we already set it.
                // If existing, we increment.
                // However, easier: just re-sum everything from DB for accuracy?
                // Or increment.
                // Let's increment safely.
                const addedAmount = itemsToCreate.reduce((sum, i) => sum + i.amount, 0);

                // If we just created, addedAmount is already in totalAmount?
                // Wait, if we created new, we set totalAmount = initialTotal.
                // If we exist, we need to increment.
                // BUT, if we created new, we shouldn't increment or we double it.

                // Let's just Re-Sum. It's safest.
                const total = await ContainerItem.sum('amount', { where: { containerId: container.id } });
                await container.update({ totalAmount: total || 0 });
            }
        }

        const resultContainer = await Container.findByPk(container.id, { include: 'items' });

        // Log the Action
        await logAction(req, 'CREATE', 'Container', container.id, {
            containerNo: container.containerNo,
            action: 'Container Entry Saved',
            itemsCount: items ? items.length : 0
        });

        res.status(201).json(resultContainer);

    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.updateContainer = async (req, res) => {
    try {
        const oldContainer = await Container.findByPk(req.params.id);
        if (!oldContainer) {
            return res.status(404).json({ message: 'Container not found' });
        }

        const { items, ...containerData } = req.body;
        const targetDateStr = containerData.unloadDate || containerData.date; // The specific day we are editing

        // Sanitize numeric fields
        if (containerData.containerWeight === '' || containerData.containerWeight === undefined || containerData.containerWeight === null) {
            containerData.containerWeight = null;
        } else {
            const weight = parseFloat(containerData.containerWeight);
            containerData.containerWeight = isNaN(weight) ? null : weight;
        }
        if (containerData.assortmentWeight === '' || containerData.assortmentWeight === undefined || containerData.assortmentWeight === null) {
            containerData.assortmentWeight = null;
        } else {
            const weight = parseFloat(containerData.assortmentWeight);
            containerData.assortmentWeight = isNaN(weight) ? null : weight;
        }
        if (containerData.workerCount === '' || containerData.workerCount === undefined || containerData.workerCount === null) {
            containerData.workerCount = null;
        } else {
            const count = parseFloat(containerData.workerCount);
            containerData.workerCount = isNaN(count) ? null : count;
        }

        // LOGIC: Check if Container Number changed
        let targetContainer = oldContainer;
        const newNo = (containerData.containerNo || '').trim().toUpperCase();
        const oldNo = (oldContainer.containerNo || '').trim().toUpperCase();

        if (newNo && newNo !== oldNo) {
            console.log(`[UPDATE] Container Rename Detected: ${oldNo} -> ${newNo} (Moving items)`);

            // Do NOT rename the old master container (preserves history for other dates)
            // Instead, Find or Create a NEW Master Container for this number
            // We try to find match to group with existing, otherwise create new
            let existingTarget = await Container.findOne({
                where: { containerNo: newNo },
                order: [['updatedAt', 'DESC']] // Pick most recent if duplicates exist
            });

            if (existingTarget) {
                targetContainer = existingTarget;
                // Update target's metadata to match the new form data? 
                // Yes, if we are adding to it, we might want to update it.
                // But this overwrites target's master data. 
                // Let's safe update it.
                await targetContainer.update(containerData);
            } else {
                // Create New
                targetContainer = await Container.create({
                    ...containerData,
                    containerNo: newNo
                });
            }
        } else {
            // Normal Update: Same Container Number
            // Update Master Data
            await oldContainer.update(containerData);
        }

        if (items) {
            // 1. CLEANUP OLD: Delete items from the *OLD* container for this date
            // (Even if we moved to new container, we must remove from old)
            if (targetDateStr) {
                // Delete items only for this specific date range
                const start = new Date(targetDateStr); start.setHours(0, 0, 0, 0);
                const end = new Date(targetDateStr); end.setHours(23, 59, 59, 999);

                // FIX: If the target date is the same as the Master Container Date,
                // we must ALSO delete items with unloadDate = NULL (Legacy items),
                const masterDate = new Date(oldContainer.date);
                const isMasterDate = start.toDateString() === masterDate.toDateString();

                const whereClause = {
                    containerId: oldContainer.id,
                    [Op.or]: [
                        { unloadDate: { [Op.between]: [start, end] } }
                    ]
                };

                if (isMasterDate) {
                    whereClause[Op.or].push({ unloadDate: null });
                }

                // PRESERVE STOCK LOGIC: Fetch existing items to calculate 'Sold' quantity
                const existingItems = await ContainerItem.findAll({ where: whereClause });
                const soldMap = {};
                existingItems.forEach(i => {
                    // Start with 0 if data is weird
                    const q = parseFloat(i.quantity) || 0;
                    const r = parseFloat(i.remainingQuantity);
                    // If remaining is NaN/Null, assume it was equal to Qty (no sale) or 0? 
                    // Safest: if null, treat as full stock.
                    const rem = isNaN(r) ? q : r;

                    const sold = q - rem;
                    // Normalize Name
                    const key = (i.itemName || '').trim().toUpperCase();
                    soldMap[key] = (soldMap[key] || 0) + Math.max(0, sold);
                });

                await ContainerItem.destroy({ where: whereClause });

                // 2. INSERT NEW: Add items to the *TARGET* container

                const validItems = [];
                const unloadDate = targetDateStr ? new Date(targetDateStr) : new Date();

                items.forEach(item => {
                    let qty = parseFloat(item.quantity);
                    let rate = parseFloat(item.rate);
                    let amt = parseFloat(item.amount);

                    if (isNaN(qty)) qty = 0;
                    if (isNaN(rate)) rate = 0;
                    if (isNaN(amt)) amt = 0;

                    if (qty > 0) {
                        const key = (item.itemName || '').trim().toUpperCase();
                        const soldPreviously = soldMap[key] || 0;
                        // Calculate New Remaining
                        // Logic: newRemaining = newQuantity - soldPreviously
                        // If we reduce quantity below what was sold, remaining becomes 0 (we ran out).
                        const newRemaining = Math.max(0, qty - soldPreviously);

                        // Debug log if we have complex stock changes?
                        // console.log(`Item: ${key}, Qty: ${qty}, SoldPrev: ${soldPreviously}, NewRem: ${newRemaining}`);

                        validItems.push({
                            containerId: targetContainer.id,
                            itemName: (item.itemName || '').trim(),
                            quantity: qty,
                            rate: rate,
                            amount: amt,
                            remainingQuantity: newRemaining, // PERSISTED STOCK
                            unloadDate: unloadDate
                        });
                    }
                });

                if (validItems.length > 0) {
                    await ContainerItem.bulkCreate(validItems);
                }

            } else {
                // Fallback: Delete ALL items (Risk of data loss, but only if date is missing)
                // We should apply similar logic here if we wanted to be 100% safe, 
                // but usually date is present for Rate Updates.
                await ContainerItem.destroy({ where: { containerId: oldContainer.id } });

                // ... (simplified recreate without stock preservation fallthrough if date missing - usually date exists)
                const validItems = [];
                const unloadDate = new Date();
                items.forEach(item => {
                    let qty = parseFloat(item.quantity);
                    let rate = parseFloat(item.rate);
                    let amt = parseFloat(item.amount);
                    if (qty > 0) {
                        validItems.push({
                            containerId: targetContainer.id,
                            itemName: (item.itemName || '').trim(),
                            quantity: qty,
                            rate: rate,
                            amount: amt,
                            remainingQuantity: qty, // RESET if no date context
                            unloadDate: unloadDate
                        });
                    }
                });
                if (validItems.length > 0) await ContainerItem.bulkCreate(validItems);
            }

            // Recalculate Totals for Target
            // (Note: Old Container total might be stale, but it's okay for now)
            const total = await ContainerItem.sum('amount', { where: { containerId: targetContainer.id } });
            await targetContainer.update({ totalAmount: total || 0 });

            // If we moved, maybe recalculate old container total too?
            if (targetContainer.id !== oldContainer.id) {
                const oldTotal = await ContainerItem.sum('amount', { where: { containerId: oldContainer.id } });
                await oldContainer.update({ totalAmount: oldTotal || 0 });
            }
        }

        // Calculate Changes for Log
        const changes = getDiff(oldContainer.toJSON(), containerData);

        // Log the Action
        await logAction(req, 'UPDATE', 'Container', targetContainer.id, {
            containerNo: targetContainer.containerNo,
            changes: changes || 'No header changes (Items updated)'
        });

        res.status(200).json(targetContainer);

    } catch (error) {
        console.error("Update Error:", error);
        res.status(500).json({ message: error.message });
    }
};

exports.deleteContainer = async (req, res) => {
    try {
        const { date } = req.query;
        console.log(`Attempting to delete container: ${req.params.id}, Date: ${date || 'ALL'}`);

        const container = await Container.findByPk(req.params.id);
        if (!container) {
            console.log('Container not found');
            return res.status(404).json({ message: 'Container not found' });
        }

        if (date) {
            // DELETE DAILY ENTRY ONLY
            const start = new Date(date); start.setHours(0, 0, 0, 0);
            const end = new Date(date); end.setHours(23, 59, 59, 999);

            // Delete items for this date
            const deletedCount = await ContainerItem.destroy({
                where: {
                    containerId: container.id,
                    unloadDate: { [Op.between]: [start, end] }
                }
            });

            console.log(`Deleted ${deletedCount} items for date ${date}`);

            // Recalculate Total
            const remainingTotal = await ContainerItem.sum('amount', { where: { containerId: container.id } });
            await container.update({ totalAmount: remainingTotal || 0 });

            // Check if any items remain. If not, delete the container too?
            // User requirement: "only date data". But if it's the LAST date, the container is empty.
            // It's cleaner to remove the empty shell.
            const remainingItemsCount = await ContainerItem.count({ where: { containerId: container.id } });
            if (remainingItemsCount === 0) {
                await container.destroy();
                console.log('Container empty, deleted master record.');
            }

            await logAction(req, 'DELETE', 'Container Entry', req.params.id, {
                containerNo: container.containerNo,
                date: date
            });

        } else {
            // DELETE ENTIRE CONTAINER (Legacy / Full Delete)
            await container.destroy();
            console.log('Container deleted successfully (ALL dates)');

            await logAction(req, 'DELETE', 'Container', req.params.id, {
                containerNo: container.containerNo
            });
        }

        res.status(200).json({ message: 'Entry deleted successfully' });
    } catch (error) {
        console.error('Error deleting container:', error);
        res.status(500).json({ message: error.message });
    }
};

exports.getContainers = async (req, res) => {
    try {
        const { startDate, endDate, firm, limit } = req.query;
        console.log('GET /containers Query:', req.query);
        console.log('Limit received:', limit);

        // General filter for Containers (Master)
        const containerWhere = {};
        if (firm) {
            containerWhere.firm = { [Op.like]: `%${firm}%` };
        }

        // ... (rest of logic)

        // Logic split:
        // If we have date range, we want items in that range, then grouped by unloadDate.
        // If we don't, we just show recent activity?
        // User wants "History", so standard view is usually recent.

        let containerInclude = [];

        if (startDate && endDate) {
            const start = new Date(startDate); start.setHours(0, 0, 0, 0);
            const end = new Date(endDate); end.setHours(23, 59, 59, 999);

            containerInclude = [{
                model: ContainerItem,
                as: 'items',
                required: true, // Only master containers that have items in this range
                where: {
                    unloadDate: { [Op.between]: [start, end] }
                }
            }];
        } else {
            // Default 15 days or recent 50?
            // If no filter, we show ALL items? That might be huge.
            // Let's limit to recent items if no filter is applied, checking items with recent unloadDate.
            // Or just return last 50 masters?
            // "Daily Entry Rule" -> User wants to see daily rows.
            // Let's just fetch everything? No, dangerous.
            // Let's fetch Masters updated recently.
            containerInclude = [{
                model: ContainerItem,
                as: 'items'
                // No where clause, but we might want to sort?
            }];
        }

        const queryLimit = startDate ? null : (limit ? parseInt(limit) : 50);

        const containers = await Container.findAll({
            where: containerWhere,
            include: containerInclude,
            order: [['updatedAt', 'DESC']],
            limit: queryLimit
        });

        // "Virtualize" the containers into Daily Entries
        const virtualContainers = [];

        containers.forEach(master => {
            if (!master.items || master.items.length === 0) {
                // If master has no items (rare, but possible), show it once as "Empty"
                // But only if we are not in strictly date-filtered mode (where required=true would have hidden it)
                if (!startDate) {
                    virtualContainers.push(master.toJSON());
                }
                return;
            }

            // Group items by unloadDate
            const dateGroups = {};
            const unknownDateItems = [];

            master.items.forEach(item => {
                if (item.unloadDate) {
                    const dateKey = new Date(item.unloadDate).toISOString().split('T')[0];
                    if (!dateGroups[dateKey]) {
                        dateGroups[dateKey] = {
                            date: new Date(dateKey),
                            items: [],
                            totalAmount: 0
                        };
                    }
                    dateGroups[dateKey].items.push(item);
                    dateGroups[dateKey].totalAmount += (item.amount || 0);
                } else {
                    // Fallback for items with no unloadDate (legacy?) -> Use Master Date?
                    // User said "Store Unload Date as a new daily record".
                    // If legacy items have no unloadDate, we group them by Master Date.
                    const masterDateKey = master.date ? new Date(master.date).toISOString().split('T')[0] : 'Unknown';
                    if (!dateGroups[masterDateKey]) {
                        dateGroups[masterDateKey] = {
                            date: new Date(master.date || new Date()),
                            items: [],
                            totalAmount: 0
                        };
                    }
                    dateGroups[masterDateKey].items.push(item);
                    dateGroups[masterDateKey].totalAmount += (item.amount || 0);
                }
            });

            // Create Virtual Containers
            Object.keys(dateGroups).forEach(key => {
                const group = dateGroups[key];

                // If date range filter is active, double check if this group's date falls in range
                // (Sequelize include where logic handles this for items, so grouped items are correct)

                virtualContainers.push({
                    id: master.id, // Keep ID for reference
                    _id: master.id, // Frontend uses _id sometimes
                    containerNo: master.containerNo,
                    firm: master.firm,
                    firmId: master.firmId,
                    worker: master.worker,
                    workerCount: master.workerCount,
                    vehicleNo: master.vehicleNo,
                    containerWeight: master.containerWeight,
                    assortmentWeight: master.assortmentWeight,
                    // Specific Daily Data
                    date: group.date, // Display Date = Unload Date
                    unloadDate: group.date,
                    items: group.items,
                    totalAmount: group.totalAmount,
                    remarks: master.remarks,
                    virtualId: `${master.id}-${key}` // Unique ID for frontend React keys
                });
            });
        });

        // Sort Virtual Containers by Date DESC
        virtualContainers.sort((a, b) => new Date(b.date) - new Date(a.date));

        // Mask Data if Unauthorized. Allow if Admin OR has /rates permission
        const permissions = req.user?.permissions || [];
        const permList = typeof permissions === 'string' ? JSON.parse(permissions) : permissions;
        const canViewRates = !req.user || req.user.role === 'Admin' || (Array.isArray(permList) && permList.includes('/rates'));
        if (!canViewRates) {
            virtualContainers.forEach(vc => {
                vc.totalAmount = 0;
                if (vc.items) {
                    vc.items = vc.items.map(item => {
                        const i = item.toJSON ? item.toJSON() : item;
                        return { ...i, rate: 0, amount: 0 };
                    });
                }
            });
        }

        res.status(200).json(virtualContainers);

    } catch (error) {
        console.error('Error fetching containers:', error);
        res.status(500).json({ message: error.message });
    }
};

exports.getContainerById = async (req, res) => {
    try {
        const { date } = req.query;
        let includeWhere = {};

        if (date) {
            // Filter items by specific date (for editing a daily entry)
            // Using DB-independent date range (Assuming Date param is YYYY-MM-DD from frontend)
            const start = new Date(date); start.setHours(0, 0, 0, 0);
            const end = new Date(date); end.setHours(23, 59, 59, 999);

            includeWhere = {
                [Op.or]: [
                    { unloadDate: { [Op.between]: [start, end] } },
                    { unloadDate: null } // Include legacy items with no specific date
                ]
            };
        }

        const container = await Container.findByPk(req.params.id, {
            include: [{
                model: ContainerItem,
                as: 'items',
                where: date ? includeWhere : undefined, // Only apply filter if date is provided
                required: false // Left Join: Return container even if no items match (e.g. empty day)
            }]
        });

        if (!container) return res.status(404).json({ message: 'Container not found' });

        const json = container.toJSON();

        // If filtering by date, we might want to override the container date in response
        // so the frontend Form displays the requested date, not the Trip Start Date.
        if (date) {
            json.activeDate = date;
            // NOTE: The frontend logic uses `queryParams.get('date')` to set the form date,
            // so this modification is purely for completeness/debugging.
        }

        // Mask Data if Unauthorized
        const permissions = req.user?.permissions || [];
        const permList = typeof permissions === 'string' ? JSON.parse(permissions) : permissions;
        const canViewRates = req.user?.role === 'Admin' || (Array.isArray(permList) && permList.includes('/rates'));
        if (!canViewRates) {
            json.totalAmount = 0;
            if (json.items) {
                json.items = json.items.map(item => ({ ...item, rate: 0, amount: 0 }));
            }
        }

        res.status(200).json({ ...json, _id: json.id });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.getItemSummary = async (req, res) => {
    try {
        const { startDate, endDate, firm, containerNo, month, groupByScrapType } = req.query;

        let start = startDate;
        let end = endDate;

        if (month) {
            const [year, m] = month.split('-');
            start = `${year}-${m}-01`;
            const lastDay = new Date(year, m, 0).getDate();
            end = `${year}-${m}-${lastDay} 23:59:59.999`;
        }

        const replacements = {};

        // Detect Dialect and Select Quote style
        const dialect = sequelize.getDialect();
        const q = dialect === 'postgres' ? '"' : '`';

        let whereClause = '';

        if (start && end) {
            // Fix: Filter by Item Unload Date (or Container Date if null) to match "Daily Entry" logic
            whereClause += ` AND COALESCE(ci.${q}unloadDate${q}, c.${q}date${q}) BETWEEN :startDate AND :endDate`;
            replacements.startDate = start;
            replacements.endDate = end;
        }
        if (firm) {
            whereClause += ` AND LOWER(c.${q}firm${q}) LIKE LOWER(:firm)`;
            replacements.firm = `%${firm}%`;
        }
        if (containerNo) {
            whereClause += ` AND LOWER(c.${q}containerNo${q}) LIKE LOWER(:containerNo)`;
            replacements.containerNo = `%${containerNo}%`;
        }

        // Fetch raw data with Date AND ContainerNo
        // Fix: Select effective date for sorting/display

        // Construct Query with safe quotes
        // MODIFICATION: If groupByScrapType is true, we need to select 'remarks' as Scrap Type
        const transactionQuery = `
            SELECT 
                TRIM(UPPER(ci.${q}itemName${q})) as ${q}normalizedName${q},
                ci.${q}quantity${q},
                ci.${q}remainingQuantity${q}, 
                ci.${q}rate${q},
                ci.${q}amount${q},
                COALESCE(ci.${q}unloadDate${q}, c.${q}date${q}) as ${q}effectiveDate${q},
                c.${q}containerNo${q},
                c.${q}remarks${q} as ${q}scrapType${q}
            FROM ${q}ContainerItems${q} ci
            JOIN ${q}Containers${q} c ON ci.${q}containerId${q} = c.${q}id${q}
            WHERE 1=1 ${whereClause}
            ORDER BY ${q}effectiveDate${q} ASC
        `;

        const transactionItems = await sequelize.query(transactionQuery, {
            replacements,
            type: sequelize.QueryTypes.SELECT
        });

        // 2. Fetch All Master Items (The Rows)
        const allItems = await Item.findAll({
            attributes: ['id', 'name'],
            raw: true
        });

        // 2.5 Fetch Global Stock (Matches Dashboard)
        // MODIFICATION: If grouping by scrap type, we need global stock PER scrap type?
        // Actually global stock is usually calculated as standard. 
        // But if user wants to see "Copper - Heavy" vs "Copper - Light", 
        // we need to group by (Item + ScrapType).
        // However, standard dashboard shows Total Copper.
        // For this Matrix View, if grouped, we want to split by Scrap Type.

        let globalStockData;

        if (groupByScrapType === 'true') {
            globalStockData = await sequelize.query(`
                SELECT 
                    TRIM(UPPER(ci.${q}itemName${q})) as ${q}normName${q},
                    COALESCE(c.${q}remarks${q}, 'Other') as ${q}scrapType${q},
                    SUM(ci.${q}remainingQuantity${q}) as ${q}totalStock${q},
                    SUM(ci.${q}remainingQuantity${q} * ci.${q}rate${q}) as ${q}totalValue${q}
                FROM ${q}ContainerItems${q} ci
                JOIN ${q}Containers${q} c ON ci.${q}containerId${q} = c.${q}id${q}
                GROUP BY TRIM(UPPER(ci.${q}itemName${q})), COALESCE(c.${q}remarks${q}, 'Other')
                HAVING SUM(ci.${q}remainingQuantity${q}) > 0.001
            `, { type: sequelize.QueryTypes.SELECT });
        } else {
            globalStockData = await ContainerItem.findAll({
                attributes: [
                    [sequelize.fn('TRIM', sequelize.fn('UPPER', sequelize.col('itemName'))), 'normName'],
                    [sequelize.fn('SUM', sequelize.col('remainingQuantity')), 'totalStock'],
                    [sequelize.literal('SUM(remainingQuantity * rate)'), 'totalValue']
                ],
                group: [sequelize.fn('TRIM', sequelize.fn('UPPER', sequelize.col('itemName')))],
                having: sequelize.where(sequelize.fn('SUM', sequelize.col('remainingQuantity')), '>', 0.001),
                raw: true
            });
        }

        const globalStockMap = {};
        const globalValueMap = {};

        globalStockData.forEach(g => {
            // Key depends on grouping
            const key = groupByScrapType === 'true'
                ? `${g.normName}|${(g.scrapType || 'Other').trim()}`
                : g.normName;

            globalStockMap[key] = parseFloat(g.totalStock) || 0;
            globalValueMap[key] = parseFloat(g.totalValue) || 0;
        });

        // 2.6 Fetch Real Sales Data (From Sales Table)
        let salesWhere = '';
        const salesReplacements = {};

        if (start && end) {
            salesWhere = `WHERE s.${q}date${q} BETWEEN :startDate AND :endDate`;
            salesReplacements.startDate = start;
            salesReplacements.endDate = end;
        }

        /* 
           MODIFICATION: Sales Grouping
           If GroupByScrapType:
           We need to JOIN SaleAllocations -> ContainerItem -> Container
           to find WHICH scrap type the sold item came from.
           This splits a single sale into multiple rows if it used mixed sources.
        */

        let salesQuery = '';
        if (groupByScrapType === 'true') {
            salesQuery = `
                SELECT 
                    TRIM(UPPER(s.${q}itemName${q})) as ${q}normName${q},
                    COALESCE(c.${q}remarks${q}, 'Other') as ${q}scrapType${q},
                    SUM(sa.${q}quantity${q}) as ${q}soldQty${q},
                    SUM(sa.${q}quantity${q} * s.${q}rate${q}) as ${q}soldAmt${q} 
                FROM ${q}Sales${q} s
                JOIN ${q}SaleAllocations${q} sa ON s.${q}id${q} = sa.${q}saleId${q}
                JOIN ${q}ContainerItems${q} ci ON sa.${q}containerItemId${q} = ci.${q}id${q}
                JOIN ${q}Containers${q} c ON ci.${q}containerId${q} = c.${q}id${q}
                ${salesWhere}
                GROUP BY TRIM(UPPER(s.${q}itemName${q})), COALESCE(c.${q}remarks${q}, 'Other')
            `;
        } else {
            salesQuery = `
                SELECT 
                    TRIM(UPPER(${q}itemName${q})) as ${q}normName${q},
                    SUM(${q}quantity${q}) as ${q}soldQty${q},
                    SUM(${q}totalAmount${q}) as ${q}soldAmt${q}
                FROM ${q}Sales${q} s
                ${salesWhere}
                GROUP BY TRIM(UPPER(${q}itemName${q}))
            `;
        }

        const salesData = await sequelize.query(salesQuery, {
            replacements: salesReplacements,
            type: sequelize.QueryTypes.SELECT
        });


        const salesMap = {};
        salesData.forEach(s => {
            const key = groupByScrapType === 'true'
                ? `${s.normName}|${(s.scrapType || 'Other').trim()}`
                : s.normName;

            salesMap[key] = {
                qty: parseFloat(s.soldQty) || 0,
                val: parseFloat(s.soldAmt) || 0
            };
        });

        // 3. Process Data for Matrix
        const itemMap = new Map();
        const uniqueContainers = new Set();

        // If Grouping, we can't pre-fill from Master Items easily because 
        // we don't know which items exist in which scrap type without data.
        // So we build from Transactions + Stock + Sales, then merge Master Names?
        // Or we iterate AllItems and just have them for "Default" or "Unknown"?
        // Better: Build map dynamically.

        if (groupByScrapType === 'true') {
            // In Group Mode, we rely on data to create entries
            // We can iterate headers (Master Items) later if we want to show 0s?
            // But usually 0s for specific scrap types (that don't exist) is noise.
            // We only show rows that have Activity OR Stock.
        } else {
            // Default Mode: Initialize Master Items
            allItems.forEach(item => {
                const normName = item.name.trim().toUpperCase();
                itemMap.set(normName, {
                    _id: item.id, // Add ID for frontend actions
                    itemName: item.name,
                    totalQty: 0,
                    activeStock: 0,
                    stockValue: 0, // NEW: Track Value of Active Stock
                    dailyQty: {}
                });
            });
        }

        // Merging Transactions
        transactionItems.forEach(t => {
            const normName = t.normalizedName;
            const scrapType = (t.scrapType || 'Other').trim();

            // Key Strategy
            const key = groupByScrapType === 'true' ? `${normName}|${scrapType}` : normName;

            // Use Container Number
            const colKey = (t.containerNo || 'Unknown').trim();
            uniqueContainers.add(colKey);

            if (!itemMap.has(key)) {
                // Initialize if missing (Orphan or Group Mode New Entry)
                itemMap.set(key, {
                    _id: groupByScrapType === 'true' ? `group-${key}` : `orphan-${normName}`,
                    itemName: normName, // Display Name
                    scrapType: scrapType, // Extra Metadata
                    totalQty: 0,
                    activeStock: 0,
                    stockValue: 0,
                    dailyQty: {}
                });
            }

            const entry = itemMap.get(key);
            const qty = parseFloat(t.quantity) || 0;
            const remaining = parseFloat(t.remainingQuantity) || 0;
            const rate = parseFloat(t.rate) || 0;

            entry.totalQty += qty;
            entry.activeStock += remaining;
            entry.stockValue += (remaining * rate); // Accumulate Value

            // Add to Bucket
            entry.dailyQty[colKey] = (entry.dailyQty[colKey] || 0) + qty;
        });

        // Merge Global Stock (for items with stock but no transactions in period)
        Object.keys(globalStockMap).forEach(key => {
            if (!itemMap.has(key)) {
                const [name, type] = groupByScrapType === 'true' ? key.split('|') : [key, null];
                itemMap.set(key, {
                    _id: `stock-${key}`,
                    itemName: name,
                    scrapType: type || 'Other',
                    totalQty: 0,
                    activeStock: 0,
                    stockValue: 0,
                    dailyQty: {}
                });
            }
            // We don't add to map here, we set property later.
            // But valid to ensure key exists.
        });

        // 4. Prepare Response
        const columns = []; // User requested ONLY Total (No breakdown columns)

        const mergedItems = Array.from(itemMap.values());

        // Calculate Percentage Denominator (Total of all items)
        const grandTotalQty = mergedItems.reduce((sum, item) => sum + item.totalQty, 0);

        const finalItems = mergedItems.map(item => {
            const pctVal = (grandTotalQty > 0) ? ((item.totalQty / grandTotalQty) * 100) : 0;

            // Map global stock
            const normName = item.itemName.trim().toUpperCase();
            const key = groupByScrapType === 'true'
                ? `${normName}|${item.scrapType}`
                : normName;

            const currentStock = globalStockMap[key] || 0;
            const currentStockValue = globalValueMap[key] || 0;
            const realSales = salesMap[key] || { qty: 0, val: 0 };

            return {
                ...item,
                // Refine Name for Group Mode if needed? Frontend can handle logic.
                // We send scrapType property.
                currentStock: currentStock, // Add global stock
                currentStockValue: currentStockValue, // Add global stock value
                soldQty: realSales.qty, // Overwrite/Add real sales qty
                soldVal: realSales.val, // Add real sales value
                percentage: pctVal.toFixed(2)
            };
        });

        // Sort: High value items first
        // If grouped, maybe sort by ScrapType then Item Name?
        if (groupByScrapType === 'true') {
            finalItems.sort((a, b) => {
                // Sort by Scrap Type
                const typeA = (a.scrapType || 'Other').toUpperCase();
                const typeB = (b.scrapType || 'Other').toUpperCase();
                if (typeA < typeB) return -1;
                if (typeA > typeB) return 1;

                // Then by Item Name
                if (a.itemName < b.itemName) return -1;
                if (a.itemName > b.itemName) return 1;
                return 0;
            });
        } else {
            finalItems.sort((a, b) => b.totalQty - a.totalQty);
        }

        // Send Object with Metadata
        res.json({
            columns: columns,
            items: finalItems,
            grandTotal: grandTotalQty
        });

    } catch (error) {
        console.error('Error fetching item summary:', error);
        res.status(500).json({ columns: [], items: [], grandTotal: 0 });
    }
};

exports.uploadExcel = async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded' });
    }

    try {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(req.file.buffer);
        const worksheet = workbook.getWorksheet(1);

        let currentContainer = null;
        let count = 0;

        // This logic is complex to port 1:1 without testing the specific Excel format again.
        // But we'll try to follow the previous logic.

        // We need to process rows and create containers.
        // Since we can't easily "push" to a list and save at once with relations in a simple loop without transaction management,
        // we'll try to build objects first then save.

        const containersToCreate = [];

        worksheet.eachRow((row, rowNumber) => {
            const rowValues = row.values;
            if (rowValues[1] && rowValues[1].toString().includes('Container No')) {
                if (currentContainer) {
                    containersToCreate.push(currentContainer);
                }
                currentContainer = {
                    containerNo: rowValues[2],
                    date: rowValues[4] || new Date(),
                    firm: 'Unknown',
                    items: [],
                    totalAmount: 0
                };
            } else if (currentContainer && rowValues[1] && rowValues[2] && rowValues[3]) {
                const qty = parseFloat(rowValues[2]);
                const rate = parseFloat(rowValues[3]);

                if (!isNaN(qty) && !isNaN(rate)) {
                    currentContainer.items.push({
                        itemName: rowValues[1],
                        quantity: qty,
                        rate: rate,
                        amount: qty * rate,
                        remainingQuantity: qty
                    });
                    currentContainer.totalAmount += (qty * rate);
                }
            }
        });

        if (currentContainer) {
            containersToCreate.push(currentContainer);
        }

        for (const c of containersToCreate) {
            const newC = await Container.create({
                containerNo: c.containerNo,
                date: c.date,
                firm: c.firm,
                totalAmount: c.totalAmount
            });

            if (c.items.length > 0) {
                const items = c.items.map(i => ({ ...i, containerId: newC.id }));
                await ContainerItem.bulkCreate(items);
            }
            count++;
        }

        res.status(201).json({ message: 'Import successful', count });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error processing Excel file' });
    }
};

exports.exportExcel = async (req, res) => {
    try {
        const { startDate, endDate, firm } = req.query;

        const containerWhere = {};
        if (firm) {
            containerWhere.firm = { [Op.like]: `%${firm}%` }; // Case insensitive search usually handled by DB collation or ILIKE if postgres
        }

        let itemInclude = {
            model: ContainerItem,
            as: 'items'
        };

        if (startDate && endDate) {
            const start = new Date(startDate); start.setHours(0, 0, 0, 0);
            const end = new Date(endDate); end.setHours(23, 59, 59, 999);

            itemInclude.where = {
                unloadDate: { [Op.between]: [start, end] }
            };
            itemInclude.required = true; // Only fetch containers with items in this range
        }

        const containers = await Container.findAll({
            where: containerWhere,
            include: [itemInclude],
            order: [['date', 'DESC']]
        });

        // Mask Data if Unauthorized
        const permissions = req.user?.permissions || [];
        const permList = typeof permissions === 'string' ? JSON.parse(permissions) : permissions;
        const canViewRates = req.user?.role === 'Admin' || (Array.isArray(permList) && permList.includes('/rates'));
        if (!canViewRates) {
            containers.forEach(c => {
                c.totalAmount = 0;
                if (c.items) {
                    c.items.forEach(i => {
                        i.rate = 0;
                        i.amount = 0;
                    });
                }
            });
        }

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Assortment Report');

        worksheet.columns = [
            { key: 'A', width: 10 },
            { key: 'B', width: 30 },
            { key: 'C', width: 15 },
            { key: 'D', width: 15 },
            { key: 'E', width: 20 },
        ];

        let currentRow = 1;

        containers.forEach(container => {
            // Container Header Info
            worksheet.mergeCells(`A${currentRow}:E${currentRow}`);
            const titleCell = worksheet.getCell(`A${currentRow}`);
            titleCell.value = `Container No: ${container.containerNo}   Date: ${new Date(container.date).toLocaleDateString('en-IN')}`;
            titleCell.font = { bold: true, size: 14 };
            titleCell.alignment = { horizontal: 'center' };
            currentRow++;

            worksheet.mergeCells(`A${currentRow}:E${currentRow}`);
            worksheet.getCell(`A${currentRow}`).value = `Firm: ${container.firm} | Worker: ${container.worker || '-'} | Weight: ${container.containerWeight || '-'}`;
            currentRow++;

            worksheet.mergeCells(`A${currentRow}:E${currentRow}`);
            worksheet.getCell(`A${currentRow}`).value = `LR No: ${container.lrNo || '-'} | Unload Date: ${container.unloadDate ? new Date(container.unloadDate).toLocaleDateString('en-IN') : '-'} | Remarks: ${container.remarks || '-'}`;
            currentRow++;

            // Item Table Header
            const headerRow = worksheet.getRow(currentRow);
            headerRow.values = ['Sr No', 'Item Name', 'Quantity', 'Rate', 'Amount'];
            headerRow.font = { bold: true };
            headerRow.eachCell((cell) => {
                cell.border = { bottom: { style: 'thin' } };
            });
            currentRow++;

            // Items
            container.items.forEach((item, index) => {
                if (item.quantity > 0 || item.amount > 0) {
                    const row = worksheet.getRow(currentRow);
                    row.values = [
                        index + 1,
                        item.itemName,
                        item.quantity,
                        item.rate,
                        item.amount
                    ];
                    currentRow++;
                }
            });

            // Total
            const totalRow = worksheet.getRow(currentRow);
            totalRow.getCell(4).value = 'Total Amount:';
            totalRow.getCell(4).font = { bold: true };
            totalRow.getCell(5).value = container.totalAmount;
            totalRow.getCell(5).font = { bold: true };
            currentRow++;

            // Spacer
            currentRow += 2;
        });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=Assortment_Report.xlsx');

        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error exporting to Excel' });
    }
};

// Rate Matrix Export (Pivot)
exports.exportRateMatrix = async (req, res) => {
    try {
        let canViewRates = req.user?.role === 'Admin';
        if (!canViewRates && req.user?.id) {
            const userRecord = await Staff.findByPk(req.user.id);
            if (userRecord) {
                const permissions = userRecord.permissions || [];
                const permList = typeof permissions === 'string' ? JSON.parse(permissions) : permissions;
                canViewRates = (Array.isArray(permList) && permList.includes('/rates'));
            }
        }

        if (!canViewRates) {
            return res.status(403).json({ message: 'Unauthorized access to Rate Matrix' });
        }

        const { startDate, endDate, containerNo, firm } = req.query;
        let where = {};
        if (startDate && endDate) {
            where.date = { [Op.between]: [startDate, endDate] };
        } else if (req.query.month) {
            const [year, month] = req.query.month.split('-');
            const start = `${year}-${month}-01`;
            const lastDay = new Date(year, month, 0).getDate();
            const end = `${year}-${month}-${lastDay}`;
            where.date = { [Op.between]: [start, end] };
        }

        if (containerNo) where.containerNo = { [Op.like]: `%${containerNo}%` };
        if (firm) where.firm = { [Op.like]: `%${firm}%` };

        const containers = await Container.findAll({
            where,
            include: [{ model: ContainerItem, as: 'items' }],
            order: [['date', 'DESC']]
        });

        const allItemNames = new Set();
        containers.forEach(c => {
            if (c.items) {
                c.items.forEach(i => allItemNames.add(i.itemName));
            }
        });
        const sortedItems = Array.from(allItemNames).sort();

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Rate Matrix');

        const headers = [
            'Date', 'Container No', 'Firm', 'Total Amount'
        ];
        sortedItems.forEach(item => {
            headers.push(`${item} Rate`);
            headers.push(`${item} Amount`);
            headers.push(`${item} Qty`);
        });

        const headerRow = worksheet.addRow(headers);
        headerRow.font = { bold: true };
        headerRow.eachCell(cell => {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };
            cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
        });

        containers.forEach(c => {
            const row = [
                c.date ? new Date(c.date).toLocaleDateString('en-GB') : '', // DD/MM/YYYY
                c.containerNo,
                c.firm,
                parseFloat(c.totalAmount) || 0
            ];

            sortedItems.forEach(item => {
                const match = c.items?.find(i => i.itemName === item);
                if (match) {
                    row.push(parseFloat(match.rate) || 0);
                    row.push(parseFloat(match.amount) || 0);
                    row.push(parseFloat(match.quantity) || 0);
                } else {
                    row.push('');
                    row.push('');
                    row.push('');
                }
            });

            worksheet.addRow(row);
        });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=RateMatrix.xlsx');

        await workbook.xlsx.write(res);
        res.end();

    } catch (error) {
        console.error('Export Matrix Error:', error);
        res.status(500).json({ message: 'Export failed' });
    }
};

// Emergency Fix: Restore debugDbCheck
exports.debugDbCheck = async (req, res) => {
    res.json({ status: 'ok', message: 'Debug endpoint restored' });
};
exports.updateContainerItem = async (req, res) => {
    try {
        const { id } = req.params;
        const { quantity, rate } = req.body; // allow rate update if needed, valid scenarios exist

        const item = await ContainerItem.findByPk(id);
        if (!item) {
            return res.status(404).json({ message: 'Item not found' });
        }

        const oldQty = parseFloat(item.quantity) || 0;
        const newQty = parseFloat(quantity);

        // If Just Updating Rate? Or Quantity?
        // Assume if quantity provided, use it. If not, keep old.
        // Actually, payload should have what changed.

        // Logic for Remaining Quantity Update:
        // Remaining = OldRemaining + (NewQty - OldQty)
        // If we increase stock, we increase remaining.
        // If we decrease stock, we decrease remaining (sales preserved).

        let updateData = {};

        if (!isNaN(newQty)) {
            const diff = newQty - oldQty;
            const oldRemaining = parseFloat(item.remainingQuantity) || 0;
            const newRemaining = oldRemaining + diff;

            updateData.quantity = newQty;
            updateData.remainingQuantity = newRemaining < 0 ? 0 : newRemaining; // Prevent negative stock
        }

        if (rate !== undefined) {
            updateData.rate = parseFloat(rate) || 0;
        }

        // Recalculate Amount
        const finalQty = updateData.quantity !== undefined ? updateData.quantity : oldQty;
        const finalRate = updateData.rate !== undefined ? updateData.rate : (parseFloat(item.rate) || 0);
        updateData.amount = finalQty * finalRate;

        await item.update(updateData);

        // Update Parent Container Total
        if (item.containerId) {
            const total = await ContainerItem.sum('amount', { where: { containerId: item.containerId } });
            await Container.update({ totalAmount: total || 0 }, { where: { id: item.containerId } });
        }

        await logAction(req, 'UPDATE', 'ContainerItem', id, {
            oldQty, newQty: updateData.quantity,
            action: 'Single Item Update'
        });

        res.status(200).json(item);

    } catch (error) {
        console.error("Update Item Error:", error);
        res.status(500).json({ message: error.message });
    }
};
