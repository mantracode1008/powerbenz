const express = require('express');
const router = express.Router();
const sequelize = require('../config/database');
const Container = require('../models/Container');
const ContainerItem = require('../models/ContainerItem');
const Sale = require('../models/Sale');
const { Op } = require('sequelize');



router.get('/stats', async (req, res) => {
    // Default response structure
    const response = {
        cards: {
            totalAmount: 0,
            totalContainers: 0,
            totalWeight: 0,
            totalSales: 0
        },
        charts: {
            monthly: [],
            daily: [],
            items: [],
            stock: [],
            salesByItem: [],
            distribution: []
        }
    };

    try {
        console.log('[Dashboard] Starting fetch stats...'); // Verify start

        // Helper for independent safe execution
        const runSafe = async (fn, fallback) => {
            try {
                return await fn();
            } catch (err) {
                console.error(`[Dashboard] Error in async task: ${err.message}`);
                return fallback;
            }
        };

        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        // Define all promises
        const pTotalAmount = Container.sum('totalAmount');
        const pTotalContainers = Container.count({
            distinct: true,
            col: 'containerNo',
            include: [{
                model: ContainerItem,
                as: 'items',
                required: true,
                attributes: []
            }]
        });
        const pTotalWeight = ContainerItem.sum('quantity');
        const pTotalSales = Sale.sum('totalAmount');

        // --- CHARTS DATA FETCHING (Robust JS Grouping) ---
        // Fetch raw data arrays instead of grouping in DB to avoid dialect issues (sqlite vs pg dates)

        const pRawPurchase = Container.findAll({
            attributes: ['date', 'totalAmount'],
            where: {
                date: { [Op.ne]: null } // Simple non-null check
            },
            order: [['date', 'ASC']],
            raw: true
        });

        const pRawSales = Sale.findAll({
            attributes: ['date', 'totalAmount'],
            where: {
                date: { [Op.ne]: null }
            },
            order: [['date', 'ASC']],
            raw: true
        });

        // Define isPostgres (FIX: Restore missing definition)
        const isPostgres = sequelize.getDialect() === 'postgres';

        // ... (Keep existing SQL queries for Items/Stock as they are) ...
        const tableName = (name) => isPostgres ? `"${name}"` : `\`${name}\``;
        const T_ContainerItems = isPostgres ? '"ContainerItems"' : 'ContainerItems';
        const T_Sales = isPostgres ? '"Sales"' : 'Sales';
        const C = (col) => isPostgres ? `"${col}"` : col;

        const pTopItems = sequelize.query(`
            SELECT TRIM(UPPER(${C('itemName')})) as "name", SUM(${C('amount')}) as "value"
            FROM ${T_ContainerItems}
            GROUP BY TRIM(UPPER(${C('itemName')}))
            ORDER BY "value" DESC
            LIMIT 5
        `, { type: sequelize.QueryTypes.SELECT });

        const pStock = sequelize.query(`
            SELECT TRIM(UPPER(${C('itemName')})) as "name", SUM(${C('remainingQuantity')}) as "stock"
            FROM ${T_ContainerItems}
            GROUP BY TRIM(UPPER(${C('itemName')}))
            HAVING SUM(${C('remainingQuantity')}) > 0.001
            ORDER BY "stock" DESC
            LIMIT 10
        `, { type: sequelize.QueryTypes.SELECT });

        const pTopSoldItems = sequelize.query(`
            SELECT TRIM(UPPER(${C('itemName')})) as "name", SUM(${C('totalAmount')}) as "value"
            FROM ${T_Sales}
            GROUP BY TRIM(UPPER(${C('itemName')}))
            ORDER BY "value" DESC
            LIMIT 5
        `, { type: sequelize.QueryTypes.SELECT });

        const pAllStock = sequelize.query(`
            SELECT TRIM(UPPER(${C('itemName')})) as "name", SUM(${C('remainingQuantity')}) as "value"
            FROM ${T_ContainerItems}
            GROUP BY TRIM(UPPER(${C('itemName')}))
            HAVING SUM(${C('remainingQuantity')}) > 0.001
            ORDER BY "value" DESC
        `, { type: sequelize.QueryTypes.SELECT });

        const pTopBuyers = Sale.findAll({
            attributes: [
                ['buyerName', 'name'],
                [sequelize.fn('SUM', sequelize.col('totalAmount')), 'value']
            ],
            where: {
                buyerName: {
                    [Op.and]: [
                        { [Op.ne]: null },
                        { [Op.ne]: '' }
                    ]
                }
            },
            group: ['buyerName'],
            order: [[sequelize.literal('value'), 'DESC']],
            limit: 5,
            raw: true
        });

        const pTopFirms = Container.findAll({
            attributes: [
                ['firm', 'name'],
                [sequelize.fn('SUM', sequelize.col('totalAmount')), 'value']
            ],
            where: {
                firm: {
                    [Op.and]: [
                        { [Op.ne]: null },
                        { [Op.ne]: '' }
                    ]
                }
            },
            group: ['firm'],
            order: [[sequelize.literal('value'), 'DESC']],
            limit: 5,
            raw: true
        });

        // Execute all in parallel
        const [
            totalAmount, totalContainers, totalWeight, totalSales,
            rawPurchaseData, rawSalesData,
            itemData,
            stockData,
            topSoldItemsData,
            allStockData,
            topBuyersData,
            topFirmsData,
            totalBuyers
        ] = await Promise.all([
            runSafe(() => pTotalAmount, 0),
            runSafe(() => pTotalContainers, 0),
            runSafe(() => pTotalWeight, 0),
            runSafe(() => pTotalSales, 0),
            runSafe(() => pRawPurchase, []), // Fetch ALL purchase history
            runSafe(() => pRawSales, []),    // Fetch ALL sales history
            runSafe(() => pTopItems, []),
            runSafe(() => pStock, []),
            runSafe(() => pTopSoldItems, []),
            runSafe(() => pAllStock, []),
            runSafe(() => pTopBuyers, []),
            runSafe(() => pTopFirms, []),
            runSafe(() => Sale.count({ distinct: true, col: 'buyerName' }), 0)
        ]);

        // Process Results for Cards (Unchanged)
        response.cards.totalAmount = totalAmount || 0;
        response.cards.totalContainers = totalContainers || 0;
        response.cards.totalWeight = totalWeight || 0;
        response.cards.totalSales = totalSales || 0;
        response.cards.totalBuyers = totalBuyers || 0;

        // --- JS PROCESSING FOR CHARTS ---

        // Helper: Grouping Function
        const groupData = (data, formatKey) => {
            const map = {};
            data.forEach(item => {
                try {
                    const dateObj = new Date(item.date);
                    if (isNaN(dateObj)) return;
                    const key = formatKey(dateObj);
                    map[key] = (map[key] || 0) + (parseFloat(item.totalAmount) || 0);
                } catch (e) { /* ignore invalid dates */ }
            });
            return map;
        };

        // 1. Monthly Data (Last 6 Months from NOW, or from Data?)
        // Let's filter data to last 6 months first to mimic the original intent, 
        // but do it in JS correctly.

        const monthlyPurchaseMap = groupData(rawPurchaseData, (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
        const monthlySalesMap = groupData(rawSalesData, (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);

        // Get unique months from both
        const allMonths = new Set([...Object.keys(monthlyPurchaseMap), ...Object.keys(monthlySalesMap)]);
        const sortedMonths = Array.from(allMonths).sort().slice(-6); // Take LAST 6 months available in data

        response.charts.monthly = sortedMonths.map(month => {
            const parts = month.split('-');
            if (parts.length < 2) return { name: month, Purchase: 0, Sales: 0 };
            const m = parseInt(parts[1], 10);
            const date = new Date(parseInt(parts[0], 10), m - 1);
            return {
                name: date.toLocaleString('default', { month: 'short' }),
                Purchase: monthlyPurchaseMap[month] || 0,
                Sales: monthlySalesMap[month] || 0
            };
        });

        // 2. Daily Data (Last 30 Days available)
        const dailyPurchaseMap = groupData(rawPurchaseData, (d) => d.toISOString().split('T')[0]);
        const dailySalesMap = groupData(rawSalesData, (d) => d.toISOString().split('T')[0]);

        const allDays = new Set([...Object.keys(dailyPurchaseMap), ...Object.keys(dailySalesMap)]);
        const sortedDays = Array.from(allDays).sort().slice(-30); // Take LAST 30 days available

        response.charts.daily = sortedDays.map(day => {
            return {
                name: new Date(day).toLocaleDateString('default', { day: 'numeric', month: 'short' }),
                Purchase: dailyPurchaseMap[day] || 0,
                Sales: dailySalesMap[day] || 0
            };
        });

        // Process Top Items
        response.charts.items = (itemData || []).map(item => ({
            name: item.name || 'Unknown',
            value: parseFloat(item.value) || 0
        }));

        // Process Stock (Direct Mapping)
        response.charts.stock = (stockData || []).map(item => ({
            name: item.name || 'Unknown',
            stock: parseFloat(item.stock) || 0
        }));

        // Process Top Sold Items
        response.charts.salesByItem = (topSoldItemsData || []).map(item => ({
            name: item.name || 'Unknown',
            value: parseFloat(item.value) || 0
        }));

        // Process Distribution (Top 5 + Others Pie Chart)
        let distributionData = (allStockData || []).map(i => ({ name: i.name || 'Unknown', value: parseFloat(i.value) || 0 }));
        const totalStockVal = distributionData.reduce((acc, curr) => acc + curr.value, 0);

        if (distributionData.length > 5) {
            const top5 = distributionData.slice(0, 5);
            const others = distributionData.slice(5).reduce((acc, curr) => acc + curr.value, 0);
            if (others > 0) {
                top5.push({ name: 'Others', value: others });
            }
            distributionData = top5;
        }

        response.charts.distribution = distributionData.map(d => ({
            ...d,
            sharePercent: totalStockVal > 0 ? parseFloat(((d.value / totalStockVal) * 100).toFixed(1)) : 0
        }));

        // MASK FINANCIAL DATA IF NOT ADMIN OR NO RATE PERMISSION
        const isAdmin = !req.user || req.user?.role === 'Admin';
        let userPermissions = req.user?.permissions || [];

        // Safety check for permissions format
        if (typeof userPermissions === 'string') {
            try {
                userPermissions = JSON.parse(userPermissions);
            } catch (e) {
                userPermissions = [];
            }
        }

        const canViewRates = isAdmin || (Array.isArray(userPermissions) && userPermissions.includes('/rates'));

        if (!canViewRates) {
            response.cards.totalAmount = 0;
            response.cards.totalSales = 0;

            response.charts.monthly = response.charts.monthly.map(m => ({ ...m, Purchase: 0, Sales: 0 }));
            response.charts.daily = response.charts.daily.map(d => ({ ...d, Purchase: 0, Sales: 0 }));

            response.charts.items = response.charts.items.map(i => ({ ...i, value: 0 }));
            response.charts.salesByItem = response.charts.salesByItem.map(i => ({ ...i, value: 0 }));
            response.charts.topBuyers = (response.charts.topBuyers || []).map(i => ({ ...i, value: 0 }));
            response.charts.topFirms = (response.charts.topFirms || []).map(i => ({ ...i, value: 0 }));
        }

        console.log(`[Dashboard] Sending success response. Dist Length: ${response.charts.distribution?.length}`);
        res.json(response);

    } catch (error) {
        console.error('[Dashboard] CRITICAL ERROR:', error);
        res.status(200).json({
            cards: { totalAmount: 0, totalContainers: 0, totalWeight: 0, totalSales: 0 },
            charts: { monthly: [], daily: [], items: [], stock: [], salesByItem: [], distribution: [] }
        });
    }
});

module.exports = router;
