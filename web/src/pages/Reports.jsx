import React, { useState, useEffect, useMemo } from 'react';
import { getContainers, getSales, updateContainer } from '../services/api';
import { formatDate } from '../utils/dateUtils';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend, BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid } from 'recharts';
import { IndianRupee, Package, FileText, Calendar, Filter, Download, ArrowUpRight, ArrowDownRight, Box, FileSpreadsheet, X } from 'lucide-react';
import XLSX from 'xlsx-js-style';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import CustomDatePicker from '../components/CustomDatePicker';
import CountUp from '../components/CountUp';

const Reports = () => {
    // Helper: Local YYYY-MM-DD (Fixes Timezone Issue)
    const toLocalISO = (dateInput) => {
        const date = new Date(dateInput);
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    };

    // Default to Current Month
    const getFirstDayOfMonth = () => {
        const date = new Date();
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
    };
    const getToday = () => {
        return toLocalISO(new Date());
    };

    const [fromDate, setFromDate] = useState('');
    const [toDate, setToDate] = useState('');
    const [activeTab, setActiveTab] = useState('overview'); // overview, purchases, sales

    const [containers, setContainers] = useState([]);
    const [sales, setSales] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showExportMenu, setShowExportMenu] = useState(false);
    const [showStockExportMenu, setShowStockExportMenu] = useState(false);
    const [kpiModal, setKpiModal] = useState(null); // { type: 'purchase'|'sales'|'stock', title: '', data: [] }

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [contRes, saleRes] = await Promise.all([
                    // Fetch ALL history (bypass default 50 limit and include null-date items)
                    getContainers({ limit: 1000000 }),
                    getSales({ limit: 1000000 })
                ]);
                setContainers(contRes.data);
                setSales(saleRes.data);
            } catch (error) {
                console.error('Error fetching report data:', error);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    // Filter Logic
    const filterData = (data, dateField) => {
        return data.filter(item => {
            if (!item[dateField]) return false;
            // Use Local Time for comparison to prevent "Yesterday" bug due to UTC conversion
            const itemDate = toLocalISO(item[dateField]);

            const isAfterStart = !fromDate || itemDate >= fromDate;
            const isBeforeEnd = !toDate || itemDate <= toDate;

            return isAfterStart && isBeforeEnd;
        });
    };

    const filteredContainers = useMemo(() => filterData(containers, 'date'), [containers, fromDate, toDate]);
    const filteredSales = useMemo(() => filterData(sales, 'date'), [sales, fromDate, toDate]);

    // Flatten Purchases for Display (Item-wise)
    const flattenedPurchases = useMemo(() => {
        const flat = [];
        filteredContainers.forEach(c => {
            if (c.items && c.items.length > 0) {
                c.items.forEach(i => {
                    flat.push({
                        ...c, // Container Details
                        itemId: i.id,
                        itemName: i.itemName,
                        itemQuantity: parseFloat(i.quantity) || 0,
                        itemAmount: parseFloat(i.amount) || 0,
                        isItem: true
                    });
                });
            } else {
                // Keep container even if empty (though rare)
                flat.push({
                    ...c,
                    itemId: 'empty',
                    itemName: '-',
                    itemQuantity: 0,
                    itemAmount: 0,
                    isItem: false
                });
            }
        });
        return flat;
    }, [filteredContainers]);

    // Metrics
    const metrics = useMemo(() => {
        const purchaseWeight = filteredContainers.reduce((sum, c) => {
            // User wants Item Weight (Net Weight of scrap), not Container Weight
            const itemWeight = c.items ? c.items.reduce((s, i) => s + (parseFloat(i.quantity) || 0), 0) : 0;
            return sum + itemWeight;
        }, 0);
        const purchaseAmount = filteredContainers.reduce((sum, c) => sum + (parseFloat(c.totalAmount) || 0), 0);

        const saleWeight = filteredSales.reduce((sum, s) => sum + (parseFloat(s.quantity) || 0), 0);
        const saleAmount = filteredSales.reduce((sum, s) => sum + (parseFloat(s.totalAmount) || 0), 0);

        return { purchaseWeight, purchaseAmount, saleWeight, saleAmount };
    }, [filteredContainers, filteredSales]);

    // Charts Data
    const barData = [
        { name: 'Purchase', weight: metrics.purchaseWeight, amount: metrics.purchaseAmount },
        { name: 'Sales', weight: metrics.saleWeight, amount: metrics.saleAmount }
    ];

    const pieData = useMemo(() => {
        const itemMap = {};
        filteredContainers.forEach(c => {
            if (c.items) {
                c.items.forEach(i => {
                    const name = (i.itemName || 'Unknown').trim();
                    const qty = parseFloat(i.quantity) || 0;
                    if (qty > 0) {
                        itemMap[name] = (itemMap[name] || 0) + qty;
                    }
                });
            }
        });

        // Top 5 + Others
        let data = Object.entries(itemMap)
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value);

        const totalVal = data.reduce((acc, curr) => acc + curr.value, 0);

        if (data.length > 5) {
            const top5 = data.slice(0, 5);
            const others = data.slice(5).reduce((acc, curr) => acc + curr.value, 0);
            if (others > 0) {
                top5.push({ name: 'Others', value: others });
            }
            data = top5;
        }
        return data.map(d => ({
            ...d,
            percent: totalVal > 0 ? ((d.value / totalVal) * 100).toFixed(1) : 0
        }));

    }, [filteredContainers]);

    const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#64748b'];

    // Trend Data for Area Chart (Purchase vs Sales)
    const trendData = useMemo(() => {
        const dateMap = {};

        // 1. Purchases
        filteredContainers.forEach(c => {
            const isoDate = new Date(c.date).toISOString().split('T')[0];
            const wgt = c.items ? c.items.reduce((s, i) => s + (parseFloat(i.quantity) || 0), 0) : 0;

            if (!dateMap[isoDate]) dateMap[isoDate] = { purchase: 0, sale: 0 };
            dateMap[isoDate].purchase += wgt;
        });

        // 2. Sales
        filteredSales.forEach(s => {
            const isoDate = new Date(s.date).toISOString().split('T')[0];
            const wgt = parseFloat(s.quantity) || 0;

            if (!dateMap[isoDate]) dateMap[isoDate] = { purchase: 0, sale: 0 };
            dateMap[isoDate].sale += wgt;
        });

        // 3. Convert to Array & Sort
        return Object.entries(dateMap)
            .map(([isoDate, values]) => ({
                isoDate,
                purchase: parseFloat(values.purchase.toFixed(2)),
                sale: parseFloat(values.sale.toFixed(2)),
                date: new Date(isoDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
            }))
            .sort((a, b) => a.isoDate.localeCompare(b.isoDate));
    }, [filteredContainers, filteredSales]);

    // Stock Data Structure (Memoized: Respects Date Filters)
    const stockData = useMemo(() => {
        const itemMap = {};

        // 1. Map Sales (Filtered)
        const salesMap = {};
        filteredSales.forEach(s => {
            const name = (s.itemName || 'Unknown').trim().toUpperCase();
            salesMap[name] = (salesMap[name] || 0) + (parseFloat(s.quantity) || 0);
        });

        // 2. Map Purchase & Stock (Filtered)
        filteredContainers.forEach(c => {
            if (c.items) {
                c.items.forEach(i => {
                    const name = (i.itemName || 'Unknown').trim().toUpperCase();
                    if (!itemMap[name]) itemMap[name] = { purchase: 0, stock: 0 };
                    itemMap[name].purchase += (parseFloat(i.quantity) || 0);
                    itemMap[name].stock += (parseFloat(i.remainingQuantity) || 0);
                });
            }
        });

        // 3. Merge
        Object.keys(salesMap).forEach(name => {
            if (!itemMap[name]) itemMap[name] = { purchase: 0, stock: 0 };
        });

        return Object.entries(itemMap)
            .map(([name, data]) => {
                const soldQty = salesMap[name] || 0;
                // Fix: Calculate Active Stock based on Flow (Purchase - Sold) for Report Consistency
                // This ensures "Total Purchase - Total Sold = Active Stock" always holds true in this view
                const calculatedStock = data.purchase - soldQty;

                return {
                    name,
                    purchase: data.purchase,
                    stock: calculatedStock,
                    sold: soldQty,
                    dbStock: data.stock // Keep actual DB stock ref if needed
                };
            })
            .sort((a, b) => b.stock - a.stock);
    }, [filteredContainers, filteredSales]);

    const exportToExcel = () => {
        const wb = XLSX.utils.book_new();

        // Summary Sheet Data Preparation (Sheet creation moved to end to avoid duplicates)
        const summaryData = [
            ["Report", `From ${formatDate(fromDate)} To ${formatDate(toDate)}`],
            [],
            ["Metric", "Weight (kg)", "Amount (₹)"],
            ["Total Purchase", metrics.purchaseWeight, metrics.purchaseAmount],
            ["Total Sales", metrics.saleWeight, metrics.saleAmount],
            ["Net Balance", metrics.purchaseWeight - metrics.saleWeight, metrics.saleAmount - metrics.purchaseAmount]
        ];

        // Purchase Sheet (Detailed Grouped)
        const pData = [];
        let lastContainerId = null;

        flattenedPurchases.forEach(p => {
            const isSame = lastContainerId === p.id;
            pData.push({
                Date: isSame ? '' : formatDate(p.date),
                ContainerNo: isSame ? '' : p.containerNo,
                Firm: isSame ? '' : p.firm,
                ItemName: p.itemName,
                NetWeight: p.itemQuantity,
                Amount: p.itemAmount,
                AssortmentWeight: (isSame || !p.assortmentWeight) ? '' : parseFloat(p.assortmentWeight).toFixed(2)
            });
            if (!isSame) lastContainerId = p.id;
        });

        // Add Total Row for Purchases (Using metrics)
        pData.push({
            Date: 'TOTAL',
            ContainerNo: '',
            Firm: '',
            ItemName: '',
            NetWeight: metrics.purchaseWeight,
            Amount: metrics.purchaseAmount,
            AssortmentWeight: ''
        });

        // Item Details Sheet (All single items)
        const itemRows = [];
        const itemMap = {}; // For Aggregation

        filteredContainers.forEach(c => {
            if (c.items) {
                c.items.forEach(i => {
                    const qty = parseFloat(i.quantity) || 0;
                    const amt = parseFloat(i.amount) || 0;
                    const name = (i.itemName || 'Unknown').trim();

                    // Add to detailed list
                    itemRows.push({
                        Date: formatDate(c.date),
                        ContainerNo: c.containerNo,
                        Firm: c.firm,
                        ItemName: name,
                        Quantity: qty,
                        Rate: parseFloat(i.rate) || 0,
                        Amount: amt
                    });

                    // Add to aggregate map
                    if (!itemMap[name]) itemMap[name] = { weight: 0, amount: 0, stock: 0 };
                    itemMap[name].weight += qty;
                    itemMap[name].amount += amt;
                    itemMap[name].stock += (parseFloat(i.remainingQuantity) || 0);
                });
            }
        });

        // Add Total Row for Item Details
        const totalDetailsWeight = itemRows.reduce((sum, r) => sum + r.Quantity, 0);
        const totalDetailsAmount = itemRows.reduce((sum, r) => sum + r.Amount, 0);
        itemRows.push({
            Date: 'TOTAL',
            ContainerNo: '',
            Firm: '',
            ItemName: '',
            Quantity: totalDetailsWeight,
            Rate: '',
            Amount: totalDetailsAmount
        });

        // Item Summary Sheet (Aggregated)
        const itemSummaryRows = Object.entries(itemMap)
            .filter(([_, data]) => data.weight > 0) // Filter out items with 0 weight
            .map(([name, data]) => ({
                ItemName: name,
                TotalPurchase: data.weight,
                TotalSold: data.weight - data.stock,
                ActiveStock: data.stock,
                AverageRate: data.weight > 0 ? (data.amount / data.weight) : 0,
                TotalAmount: data.amount
            }))
            .sort((a, b) => b.TotalWeight - a.TotalWeight);

        // Add Total Row for Item Summary
        const totalSumWeight = itemSummaryRows.reduce((sum, r) => sum + r.TotalPurchase, 0);
        const totalSumStock = itemSummaryRows.reduce((sum, r) => sum + r.ActiveStock, 0);
        const totalSumAmount = itemSummaryRows.reduce((sum, r) => sum + r.TotalAmount, 0);
        itemSummaryRows.push({
            ItemName: 'TOTAL',
            TotalPurchase: totalSumWeight,
            TotalSold: totalSumWeight - totalSumStock,
            ActiveStock: totalSumStock,
            AverageRate: '',
            TotalAmount: totalSumAmount
        });

        // Sales Sheet
        const sData = [];
        let lastInvoice = null;

        filteredSales.forEach(s => {
            const isSame = lastInvoice === s.invoiceNo;
            sData.push({
                Date: isSame ? '' : formatDate(s.date),
                InvoiceNo: isSame ? '' : s.invoiceNo,
                Buyer: isSame ? '' : s.buyerName,
                ItemName: s.itemName || 'Unknown',
                Weight: s.quantity,
                Amount: s.totalAmount
            });
            if (!isSame) lastInvoice = s.invoiceNo;
        });

        // Add Total Row for Sales
        sData.push({
            Date: 'TOTAL',
            InvoiceNo: '',
            Buyer: '',
            ItemName: '', // Added empty for total row
            Weight: metrics.saleWeight,
            Amount: metrics.saleAmount
        });

        // --- NEW: FULL REPORT SHEET (Combined) ---
        // Create a single sheet with all tables stacked
        const fullReportData = [];

        // 1. Title
        fullReportData.push(["BUSINESS REPORT", `From ${formatDate(fromDate)} To ${formatDate(toDate)}`]);
        fullReportData.push([]); // Spacer

        // 2. Metrics
        fullReportData.push(["METRICS SUMMARY"]);
        fullReportData.push(["Metric", "Weight (kg)", "Amount (Rs)"]);
        fullReportData.push(["Total Purchase", metrics.purchaseWeight, metrics.purchaseAmount]);
        fullReportData.push(["Total Sales", metrics.saleWeight, metrics.saleAmount]);
        fullReportData.push([]); // Spacer

        // 3. Purchase History
        fullReportData.push(["PURCHASE HISTORY"]);
        fullReportData.push(["Date", "Container No", "Firm", "Item Name", "Net Weight", "Amount"]);
        pData.forEach(p => {
            fullReportData.push([p.Date, p.ContainerNo, p.Firm, p.ItemName, p.NetWeight, p.Amount]);
        });
        fullReportData.push([]); // Spacer

        // 4. Sales History
        fullReportData.push(["SALES HISTORY"]);
        fullReportData.push(["Date", "Invoice No", "Buyer", "Item Name", "Weight", "Amount"]); // Added Header
        sData.forEach(s => {
            fullReportData.push([s.Date, s.InvoiceNo, s.Buyer, s.ItemName, s.Weight, s.Amount]); // Added Data
        });
        fullReportData.push([]); // Spacer

        // 5. Item Wise Summary
        fullReportData.push(["ITEM WISE SUMMARY"]);
        fullReportData.push(["Item Name", "Total Purchase", "Total Sold", "Active Stock", "Avg Rate", "Total Amount"]);
        itemSummaryRows.forEach(i => {
            if (i.ItemName !== 'TOTAL') { // Avoid duplicating TOTAL row if already in array
                fullReportData.push([i.ItemName, i.TotalPurchase, i.TotalSold, i.ActiveStock, i.AverageRate, i.TotalAmount]);
            }
        });
        // Add TOTAL manually or use the one from itemSummaryRows if preferred.
        // itemSummaryRows already has TOTAL.
        fullReportData.push(["TOTAL", totalSumWeight, (totalSumWeight - totalSumStock), totalSumStock, "-", totalSumAmount]);


        // Helper to Style Sheet
        const applySheetStyles = (ws, colWidths = []) => {
            // Column Widths
            if (colWidths.length > 0) ws['!cols'] = colWidths;

            // Styles
            const range = XLSX.utils.decode_range(ws['!ref']);
            for (let R = range.s.r; R <= range.e.r; ++R) {
                for (let C = range.s.c; C <= range.e.c; ++C) {
                    const cell_address = { c: C, r: R };
                    const cell_ref = XLSX.utils.encode_cell(cell_address);
                    if (!ws[cell_ref]) continue;

                    // Defaults
                    ws[cell_ref].s = {
                        font: { sz: 10 },
                        alignment: { vertical: "center", horizontal: "left" },
                        border: { top: { style: "thin", color: { rgb: "E2E8F0" } }, bottom: { style: "thin", color: { rgb: "E2E8F0" } } }
                    };

                    // Headers
                    if (R === 0 && ws[cell_ref].v !== 'Report') { // Skip Title
                        ws[cell_ref].s = {
                            font: { bold: true, color: { rgb: "FFFFFF" } },
                            fill: { fgColor: { rgb: "475569" } }, // Slate 600
                            alignment: { horizontal: "center", vertical: "center" },
                            border: { bottom: { style: "medium", color: { rgb: "FFFFFF" } } }
                        };
                    }

                    // Numeric Alignment
                    if (typeof ws[cell_ref].v === 'number') {
                        ws[cell_ref].s.alignment.horizontal = "right";
                    }

                    // Total Rows (Check if first cell is TOTAL)
                    const firstCellInRow = ws[XLSX.utils.encode_cell({ c: 0, r: R })];
                    if (firstCellInRow && firstCellInRow.v === 'TOTAL') {
                        ws[cell_ref].s.font = { bold: true };
                        ws[cell_ref].s.fill = { fgColor: { rgb: "F1F5F9" } }; // Slate 100
                        ws[cell_ref].s.border.top = { style: "medium" };
                    }
                }
            }
        };

        // --- 2. Create Sheets with Styles ---

        // A. Summary Sheet
        const summaryWs = XLSX.utils.aoa_to_sheet(summaryData);
        // Custom Style for Summary
        XLSX.utils.book_append_sheet(wb, summaryWs, "Summary");


        // B. Purchase Sheet
        const wsP = XLSX.utils.json_to_sheet(pData);
        applySheetStyles(wsP, [{ wch: 12 }, { wch: 15 }, { wch: 20 }, { wch: 10 }]);
        XLSX.utils.book_append_sheet(wb, wsP, "Purchases");

        // C. Item Details Sheet
        const wsItems = XLSX.utils.json_to_sheet(itemRows);
        applySheetStyles(wsItems, [{ wch: 12 }, { wch: 15 }, { wch: 20 }]);
        XLSX.utils.book_append_sheet(wb, wsItems, "Item Details");

        // D. Item Summary Sheet
        const wsItemSum = XLSX.utils.json_to_sheet(itemSummaryRows);
        applySheetStyles(wsItemSum, [{ wch: 20 }, { wch: 15 }, { wch: 15 }]);
        XLSX.utils.book_append_sheet(wb, wsItemSum, "Item Summary");

        // E. Sales Sheet
        const wsS = XLSX.utils.json_to_sheet(sData);
        applySheetStyles(wsS, [{ wch: 12 }, { wch: 15 }, { wch: 20 }, { wch: 20 }]); // Added width for Item Name
        XLSX.utils.book_append_sheet(wb, wsS, "Sales");

        XLSX.writeFile(wb, `Report_${fromDate || 'All'}_to_${toDate || 'Present'}.xlsx`);
    };

    const exportToPDF = () => {
        const doc = new jsPDF();

        // Title & Date
        doc.setFontSize(18);
        doc.text("Business Report", 14, 20);
        doc.setFontSize(10);
        doc.text(`Period: ${formatDate(fromDate)} to ${formatDate(toDate)}`, 14, 28);

        // Metrics Summary
        autoTable(doc, {
            startY: 35,
            head: [['Metric', 'Weight (kg)', 'Amount (Rs)']],
            body: [
                ['Total Purchase', metrics.purchaseWeight.toFixed(2), metrics.purchaseAmount.toLocaleString('en-IN')],
                ['Total Sales', metrics.saleWeight.toFixed(2), metrics.saleAmount.toLocaleString('en-IN')],
            ],
            theme: 'grid',
            headStyles: { fillColor: [41, 128, 185] }
        });

        // Purchase Table (Detailed Grouped)
        doc.text("Purchase History", 14, (doc.lastAutoTable?.finalY || 35) + 10);
        autoTable(doc, {
            startY: (doc.lastAutoTable?.finalY || 35) + 15,
            head: [['Date', 'Container', 'Firm', 'Item Name', 'Weight', 'Amount']],
            body: flattenedPurchases.map((p, i) => {
                const isSame = i > 0 && flattenedPurchases[i - 1].id === p.id;
                return [
                    isSame ? '' : formatDate(p.date),
                    isSame ? '' : p.containerNo,
                    isSame ? '' : p.firm,
                    p.itemName,
                    p.itemQuantity.toFixed(2),
                    p.itemAmount.toLocaleString('en-IN')
                ];
            }),
            foot: [['TOTAL', '', '', '', metrics.purchaseWeight.toFixed(2), metrics.purchaseAmount.toLocaleString('en-IN')]],
            theme: 'striped',
            styles: { fontSize: 8 },
            headStyles: { fillColor: [52, 73, 94] },
            footStyles: { fillColor: [52, 73, 94], fontStyle: 'bold' }
        });

        // Sales Table
        let finalY = (doc.lastAutoTable?.finalY || 20) + 10;
        // Check if page break needed
        if (finalY > 250) {
            doc.addPage();
            finalY = 20;
        }

        doc.text("Sales History", 14, finalY);
        autoTable(doc, {
            startY: finalY + 5,
            head: [['Date', 'Invoice', 'Buyer', 'Item Name', 'Weight', 'Amount']], // Added Header
            body: filteredSales.map(s => [
                formatDate(s.date),
                s.invoiceNo,
                s.buyerName,
                s.itemName || 'Unknown', // Added Data
                parseFloat(s.quantity).toFixed(2),
                parseFloat(s.totalAmount).toLocaleString('en-IN')
            ]),
            foot: [['TOTAL', '', '', '', metrics.saleWeight.toFixed(2), metrics.saleAmount.toLocaleString('en-IN')]], // Adjusted footer colspan implicit
            theme: 'striped',
            headStyles: { fillColor: [39, 174, 96] },
            footStyles: { fillColor: [39, 174, 96], fontStyle: 'bold' }
        });

        // Item Summary Table (Aggregated)
        let itemSumY = (doc.lastAutoTable?.finalY || 20) + 10;
        if (itemSumY > 250) {
            doc.addPage();
            itemSumY = 20;
        }

        // Calculate Aggregation for PDF
        const pdfItemMap = {};
        filteredContainers.forEach(c => {
            if (c.items) {
                c.items.forEach(i => {
                    const name = (i.itemName || 'Unknown').trim();
                    if (!pdfItemMap[name]) pdfItemMap[name] = { weight: 0, amount: 0, stock: 0 };
                    pdfItemMap[name].weight += (parseFloat(i.quantity) || 0);
                    pdfItemMap[name].amount += (parseFloat(i.amount) || 0);
                    pdfItemMap[name].stock += (parseFloat(i.remainingQuantity) || 0);
                });
            }
        });
        const pdfItemRows = Object.entries(pdfItemMap)
            .filter(([_, data]) => data.weight > 0) // Filter items with 0 weight
            .map(([name, data]) => [
                name,
                data.weight.toFixed(2),
                (data.weight - data.stock).toFixed(2), // Sold
                data.stock.toFixed(2),
                (data.weight > 0 ? (data.amount / data.weight).toFixed(2) : '0.00'),
                data.amount.toLocaleString('en-IN')
            ])
            .sort((a, b) => parseFloat(b[1]) - parseFloat(a[1]));

        const totalItemWeight = Object.values(pdfItemMap)
            .filter(item => item.weight > 0)
            .reduce((sum, item) => sum + item.weight, 0);
        const totalItemStock = Object.values(pdfItemMap)
            .filter(item => item.weight > 0)
            .reduce((sum, item) => sum + item.stock, 0);
        const totalItemSold = totalItemWeight - totalItemStock;
        const totalItemAmount = Object.values(pdfItemMap)
            .filter(item => item.weight > 0)
            .reduce((sum, item) => sum + item.amount, 0);

        doc.text("Item Wise Summary", 14, itemSumY);
        autoTable(doc, {
            startY: itemSumY + 5,
            head: [['Item Name', 'Total Purchase', 'Total Sold', 'Active Stock', 'Avg Rate', 'Total Amount']],
            body: pdfItemRows,
            foot: [['TOTAL', totalItemWeight.toFixed(2), totalItemSold.toFixed(2), totalItemStock.toFixed(2), '-', totalItemAmount.toLocaleString('en-IN')]],
            theme: 'striped',
            styles: { fontSize: 8 },
            headStyles: { fillColor: [243, 156, 18] },
            footStyles: { fillColor: [243, 156, 18], fontStyle: 'bold' }
        });


        doc.save(`Report_${fromDate}_to_${toDate}.pdf`);
    };

    const exportStockToExcel = () => {
        const wb = XLSX.utils.book_new();
        const exportData = stockData.map(item => ({
            "Item Name": item.name,
            "Total Purchase": item.purchase,
            "Total Sold": item.sold,
            "Active Stock": item.stock,
            "Status": item.stock > 0 ? "Available" : "Sold Out"
        }));

        // Add Summary Row
        const totalPurchase = exportData.reduce((s, i) => s + i["Total Purchase"], 0);
        const totalSold = exportData.reduce((s, i) => s + i["Total Sold"], 0);
        const totalStock = exportData.reduce((s, i) => s + i["Active Stock"], 0);

        exportData.push({
            "Item Name": "TOTAL",
            "Total Purchase": totalPurchase,
            "Total Sold": totalSold,
            "Active Stock": totalStock,
            "Status": "-"
        });

        const ws = XLSX.utils.json_to_sheet(exportData);
        XLSX.utils.book_append_sheet(wb, ws, "Stock Summary");
        XLSX.writeFile(wb, `Stock_Summary_${fromDate}_to_${toDate}.xlsx`);
    };

    const exportStockToPDF = () => {
        const doc = new jsPDF();
        doc.setFontSize(18);
        doc.text("Stock Summary Report", 14, 20);
        doc.setFontSize(10);
        doc.text(`Period: ${formatDate(fromDate)} to ${formatDate(toDate)}`, 14, 28);

        const totalPurchase = stockData.reduce((s, i) => s + i.purchase, 0);
        const totalSold = stockData.reduce((s, i) => s + i.sold, 0);
        const totalStock = stockData.reduce((s, i) => s + i.stock, 0);

        autoTable(doc, {
            startY: 35,
            head: [['Item Name', 'Total Purchase', 'Total Sold', 'Active Stock', 'Status']],
            body: stockData.map(item => [
                item.name,
                item.purchase.toFixed(2),
                item.sold.toFixed(2),
                item.stock.toFixed(2),
                item.stock > 0 ? "Available" : "Sold Out"
            ]),
            foot: [['TOTAL', totalPurchase.toFixed(2), totalSold.toFixed(2), totalStock.toFixed(2), '-']],
            theme: 'striped',
            headStyles: { fillColor: [41, 128, 185] },
            footStyles: { fillColor: [41, 128, 185], fontStyle: 'bold' }
        });

        doc.save(`Stock_Summary_${fromDate}_to_${toDate}.pdf`);
    };

    if (loading) {
        return (
            <div className="flex justify-center items-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    const TabButton = ({ id, label, icon: Icon }) => (
        <button
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-2 px-6 py-2 rounded-full text-sm font-bold transition-all duration-200 ${activeTab === id
                ? 'bg-white text-blue-600 shadow-sm ring-1 ring-black/5'
                : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
                }`}
        >
            <Icon size={18} className={activeTab === id ? 'text-blue-600' : 'text-slate-400'} strokeWidth={activeTab === id ? 2.5 : 2} />
            {label}
        </button>
    );

    return (
        <div className="space-y-6 font-inter">
            {/* Header & Controls */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col xl:flex-row justify-between items-center gap-4 animate-in slide-in-from-top-2">

                {/* Title Section */}
                <div className="flex items-center gap-4 w-full xl:w-auto">
                    <div className="p-3 bg-blue-50 text-blue-600 rounded-xl hidden md:block">
                        <FileSpreadsheet size={24} />
                    </div>
                    <div>
                        <h1 className="text-xl font-black text-slate-800 tracking-tight">Business Reports</h1>
                        <div className="flex items-center gap-2 text-slate-500 text-xs font-medium mt-0.5">
                            <span className="bg-slate-100 px-2 py-0.5 rounded text-slate-600 border border-slate-200">Financial Overview</span>
                            <span>•</span>
                            <div className="flex items-center gap-1">
                                <span>{formatDate(fromDate)}</span>
                                <span className="text-slate-300">→</span>
                                <span>{formatDate(toDate)}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right Side Controls */}
                <div className="flex flex-col md:flex-row items-center gap-3 w-full xl:w-auto">

                    {/* Date Selection */}
                    <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-2 py-1.5 shadow-sm hover:border-blue-300 transition-colors w-full md:w-auto">
                        <CustomDatePicker
                            value={fromDate}
                            onChange={(e) => setFromDate(e.target.value)}
                            placeholder="Start"
                            className="w-24 text-xs font-semibold text-slate-700 border-none outline-none bg-transparent text-center"
                            isClearable={false}
                        />
                        <span className="text-slate-300">→</span>
                        <CustomDatePicker
                            value={toDate}
                            onChange={(e) => setToDate(e.target.value)}
                            placeholder="End"
                            className="w-24 text-xs font-semibold text-slate-700 border-none outline-none bg-transparent text-center"
                            isClearable={false}
                        />
                        {(fromDate || toDate) && (
                            <button
                                onClick={() => { setFromDate(''); setToDate(''); }}
                                className="p-1 hover:bg-red-50 text-slate-400 hover:text-red-500 rounded-full transition-colors ml-1"
                                title="Clear Dates"
                            >
                                <X size={14} />
                            </button>
                        )}
                    </div>

                    <div className="hidden md:block w-px h-8 bg-slate-200 mx-1"></div>

                    {/* Export Button */}
                    <div className="relative w-full md:w-auto">
                        <button
                            onClick={() => setShowExportMenu(!showExportMenu)}
                            className={`w-full md:w-auto flex items-center justify-center gap-2 px-4 py-2 border border-slate-200 rounded-lg text-sm font-bold shadow-sm transition-all whitespace-nowrap ${showExportMenu ? 'bg-slate-100 text-slate-800' : 'bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-800'}`}
                        >
                            <Download size={16} />
                            <span className="hidden sm:inline">Export Report</span>
                            <ArrowDownRight size={14} className={`transition-transform duration-200 ${showExportMenu ? 'rotate-180' : ''}`} />
                        </button>

                        {showExportMenu && (
                            <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-xl border border-slate-100 overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-200 origin-top-right">
                                <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                                    Download As
                                </div>
                                <button
                                    onClick={() => { exportToExcel(); setShowExportMenu(false); }}
                                    className="w-full text-left px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:text-green-700 flex items-center gap-3 transition-colors"
                                >
                                    <FileText size={16} className="text-green-600" /> Excel Report
                                </button>
                                <button
                                    onClick={() => { exportToPDF(); setShowExportMenu(false); }}
                                    className="w-full text-left px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:text-red-700 flex items-center gap-3 transition-colors border-t border-slate-50"
                                >
                                    <FileText size={16} className="text-red-500" /> PDF Document
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex justify-center w-full py-2">
                <div className="bg-slate-100 p-1.5 rounded-full inline-flex items-center justify-center border border-slate-200">
                    <TabButton id="overview" label="Overview" icon={PieChartIcon} />
                    <TabButton id="purchases" label="Purchases" icon={Package} />
                    <TabButton id="sales" label="Sales" icon={FileText} />
                    <TabButton id="stock" label="Stock" icon={Box} />
                </div>
            </div>

            {/* Content Area */}
            {activeTab === 'overview' && (
                <div className="space-y-6">
                    {/* KPI Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
                        <KPICard
                            title="Total Purchase"
                            value={metrics.purchaseWeight}
                            unit="kg"
                            icon={Package}
                            color="blue"
                            onClick={() => setKpiModal({ type: 'purchase', title: 'Detailed Purchase History', data: filteredContainers })}
                        />
                        <KPICard
                            title="Total Sales"
                            value={metrics.saleWeight}
                            unit="kg"
                            icon={Package}
                            color="green"
                            onClick={() => setKpiModal({ type: 'sales', title: 'Detailed Sales History', data: filteredSales })}
                        />
                        <KPICard
                            title="Stock (Balance)"
                            value={metrics.purchaseWeight - metrics.saleWeight}
                            unit="kg"
                            icon={Box}
                            color="orange"
                            onClick={() => setKpiModal({ type: 'stock', title: 'Current Stock Breakdown', data: stockData })}
                        />
                        <KPICard
                            title="Purchase Value"
                            value={metrics.purchaseAmount}
                            icon={IndianRupee}
                            color="indigo"
                            onClick={() => setKpiModal({ type: 'purchase', title: 'Detailed Purchase History', data: filteredContainers })}
                        />
                        <KPICard
                            title="Sales Value"
                            value={metrics.saleAmount}
                            icon={IndianRupee}
                            color="emerald"
                            onClick={() => setKpiModal({ type: 'sales', title: 'Detailed Sales History', data: filteredSales })}
                        />
                    </div>

                    {/* Charts Grid */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Bar Chart */}
                        <div className="glass-card p-6 bg-white border border-slate-200 rounded-xl h-80">
                            <h3 className="text-sm font-bold text-slate-700 mb-4">Weight Comparison (Purchase vs Sales)</h3>
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={barData} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                                    <XAxis type="number" />
                                    <YAxis dataKey="name" type="category" width={80} />
                                    <Tooltip formatter={(value) => value.toLocaleString('en-IN') + ' kg'} />
                                    <Bar dataKey="weight" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={40} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>

                        {/* Pie Chart */}
                        <div className="glass-card p-6 bg-white border border-slate-200 rounded-xl h-80">
                            <h3 className="text-sm font-bold text-slate-700 mb-4">Item Composition (By Weight)</h3>
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={pieData}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={60}
                                        outerRadius={80}
                                        paddingAngle={5}
                                        dataKey="value"
                                    >
                                        {pieData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip formatter={(value, name, props) => [`${value.toLocaleString('en-IN')} kg`, `${name} (${props.payload.percent}%)`]} />
                                    <Legend layout="vertical" verticalAlign="middle" align="right" wrapperStyle={{ fontSize: '11px' }} />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Daily Trend Chart (Area) - Dual Axis */}
                    <div className="glass-card p-6 bg-white border border-slate-200 rounded-xl h-80">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-sm font-bold text-slate-700">Daily Trend (Purchase vs Sales)</h3>
                            <div className="flex items-center gap-3 text-xs font-semibold">
                                <div className="flex items-center gap-1.5">
                                    <span className="w-2.5 h-2.5 rounded-full bg-violet-500"></span> Purchase
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> Sales
                                </div>
                            </div>
                        </div>
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={trendData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="colorPurchase" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                                    </linearGradient>
                                    <linearGradient id="colorSale" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b' }} dy={10} />
                                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                                <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#f1f5f9" />
                                <Tooltip
                                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', padding: '12px' }}
                                    formatter={(value, name) => [
                                        <span className="font-mono font-bold">{value} kg</span>,
                                        <span className={name === 'purchase' ? "text-violet-600 capitalize" : "text-emerald-600 capitalize"}>{name}</span>
                                    ]}
                                    labelStyle={{ color: '#475569', marginBottom: '8px', fontSize: '12px', fontWeight: 'bold' }}
                                />
                                <Area
                                    type="monotone"
                                    dataKey="purchase"
                                    stroke="#8b5cf6"
                                    strokeWidth={3}
                                    fillOpacity={1}
                                    fill="url(#colorPurchase)"
                                    activeDot={{ r: 6, strokeWidth: 0, fill: '#8b5cf6' }}
                                />
                                <Area
                                    type="monotone"
                                    dataKey="sale"
                                    stroke="#10b981"
                                    strokeWidth={3}
                                    fillOpacity={1}
                                    fill="url(#colorSale)"
                                    activeDot={{ r: 6, strokeWidth: 0, fill: '#10b981' }}
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            )}

            {activeTab === 'purchases' && (
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="p-4 border-b border-slate-100 flex justify-between items-center">
                        <h3 className="font-bold text-slate-800">Purchase History</h3>
                        <span className="text-xs font-mono bg-slate-100 px-2 py-1 rounded text-slate-600">{flattenedPurchases.length} Items</span>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-200">
                                <tr>
                                    <th className="px-4 py-3">Date</th>
                                    <th className="px-4 py-3">Container No</th>
                                    <th className="px-4 py-3">Firm</th>
                                    <th className="px-4 py-3">Item Name</th>
                                    <th className="px-4 py-3 text-right">Assortment Wgt</th>
                                    <th className="px-4 py-3 text-right">Net Weight (kg)</th>
                                    <th className="px-4 py-3 text-right">Amount (₹)</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {flattenedPurchases.map((p, i) => {
                                    const isSameContainer = i > 0 && flattenedPurchases[i - 1].id === p.id;
                                    return (
                                        <tr key={i} className={`hover:bg-slate-50 transition-colors ${!isSameContainer ? 'border-t-2 border-slate-200' : 'border-none'}`}>
                                            <td className="px-4 py-3 align-top whitespace-nowrap">
                                                {!isSameContainer && <span className="font-medium text-slate-800">{formatDate(p.date)}</span>}
                                            </td>
                                            <td className="px-4 py-3 align-top font-bold text-slate-700">
                                                {!isSameContainer && p.containerNo}
                                            </td>
                                            <td className="px-4 py-3 align-top">
                                                {!isSameContainer && p.firm}
                                            </td>
                                            <td className="px-4 py-3 text-slate-600 border-l border-slate-100 pl-4">
                                                {p.itemName}
                                            </td>
                                            <td className="px-4 py-3 text-right font-mono text-slate-400">
                                                {/* Show Assortment only once per container */}
                                                {!isSameContainer && p.assortmentWeight ? parseFloat(p.assortmentWeight).toFixed(2) : ''}
                                            </td>
                                            <td className="px-4 py-3 text-right font-mono font-bold text-slate-700">
                                                {p.itemQuantity.toFixed(2)}
                                            </td>
                                            <td className="px-4 py-3 text-right font-mono">
                                                {p.itemAmount.toLocaleString('en-IN')}
                                            </td>
                                        </tr>
                                    );
                                })}
                                {flattenedPurchases.length === 0 && (
                                    <tr>
                                        <td colSpan="7" className="px-4 py-8 text-center text-slate-400">No purchases found in this range</td>
                                    </tr>
                                )}
                            </tbody>
                            <tfoot className="bg-slate-100 border-t-2 border-slate-200 font-bold text-slate-700 sticky bottom-0">
                                <tr>
                                    <td colSpan={5} className="px-4 py-4 text-right uppercase text-xs tracking-wider">Total</td>
                                    <td className="px-4 py-4 text-right font-mono text-blue-700 text-base">
                                        {metrics.purchaseWeight.toFixed(2)} <span className="text-[10px] text-slate-500 font-sans">kg</span>
                                    </td>
                                    <td className="px-4 py-4 text-right font-mono text-emerald-700 text-base">
                                        {metrics.purchaseAmount.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })}
                                    </td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>
            )}

            {activeTab === 'sales' && (
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="p-4 border-b border-slate-100 flex justify-between items-center">
                        <h3 className="font-bold text-slate-800">Sales History</h3>
                        <span className="text-xs font-mono bg-slate-100 px-2 py-1 rounded text-slate-600">{filteredSales.length} Records</span>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-200">
                                <tr>
                                    <th className="px-4 py-3">Date</th>
                                    <th className="px-4 py-3">Invoice No</th>
                                    <th className="px-4 py-3">Buyer Name</th>
                                    <th className="px-4 py-3">Item Name</th> {/* Added Header */}
                                    <th className="px-4 py-3 text-right">Weight (kg)</th>
                                    <th className="px-4 py-3 text-right">Amount (₹)</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filteredSales.map((s, i) => {
                                    // Check if Previous Item belongs to same Invoice
                                    const isSameInvoice = i > 0 && filteredSales[i - 1].invoiceNo === s.invoiceNo;

                                    return (
                                        <tr key={i} className={`hover:bg-slate-50 transition-colors ${!isSameInvoice ? 'border-t-2 border-slate-200' : 'border-none'}`}>
                                            <td className="px-4 py-3 align-top whitespace-nowrap">
                                                {!isSameInvoice && <span className="font-medium text-slate-800">{formatDate(s.date)}</span>}
                                            </td>
                                            <td className="px-4 py-3 align-top font-bold text-slate-700">
                                                {!isSameInvoice && s.invoiceNo}
                                            </td>
                                            <td className="px-4 py-3 align-top font-medium text-slate-700">
                                                {!isSameInvoice && s.buyerName}
                                            </td>
                                            <td className="px-4 py-3 text-slate-600 border-l border-slate-100 pl-4">{s.itemName || 'Unknown'}</td>
                                            <td className="px-4 py-3 text-right font-mono">{parseFloat(s.quantity).toFixed(2)}</td>
                                            <td className="px-4 py-3 text-right font-mono">{parseFloat(s.totalAmount).toLocaleString('en-IN')}</td>
                                        </tr>
                                    );
                                })}
                                {filteredSales.length === 0 && (
                                    <tr>
                                        <td colSpan="6" className="px-4 py-8 text-center text-slate-400">No sales found in this range</td> {/* Increased ColSpan */}
                                    </tr>
                                )}
                            </tbody>
                            {filteredSales.length > 0 && (
                                <tfoot className="bg-slate-100 border-t-2 border-slate-200 font-bold text-slate-700 sticky bottom-0">
                                    <tr>
                                        <td colSpan={4} className="px-4 py-4 text-right uppercase text-xs tracking-wider">Total</td> {/* Increased ColSpan */}
                                        <td className="px-4 py-4 text-right font-mono text-blue-700 text-base">
                                            {metrics.saleWeight.toFixed(2)} <span className="text-[10px] text-slate-500 font-sans">kg</span>
                                        </td>
                                        <td className="px-4 py-4 text-right font-mono text-emerald-700 text-base">
                                            {metrics.saleAmount.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })}
                                        </td>
                                    </tr>
                                </tfoot>
                            )}
                        </table>
                    </div>
                </div>
            )}

            {activeTab === 'stock' && (
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="p-4 border-b border-slate-100 flex justify-between items-center">
                        <div className="flex items-center gap-4">
                            <h3 className="font-bold text-slate-800">Stock Summary</h3>
                            <div className="relative">
                                <button
                                    onClick={() => setShowStockExportMenu(!showStockExportMenu)}
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-xs font-bold transition-colors"
                                >
                                    <Download size={14} /> Export
                                </button>
                                {showStockExportMenu && (
                                    <div className="absolute left-0 mt-2 w-40 bg-white border border-slate-100 rounded-xl shadow-xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 ring-1 ring-slate-100">
                                        <button
                                            onClick={() => { exportStockToExcel(); setShowStockExportMenu(false); }}
                                            className="flex items-center gap-2 w-full px-4 py-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors border-b border-slate-50"
                                        >
                                            <FileText size={14} className="text-green-600" /> Excel
                                        </button>
                                        <button
                                            onClick={() => { exportStockToPDF(); setShowStockExportMenu(false); }}
                                            className="flex items-center gap-2 w-full px-4 py-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                                        >
                                            <Download size={14} className="text-red-600" /> PDF
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                        <span className="text-xs font-mono bg-slate-100 px-2 py-1 rounded text-slate-600">
                            {stockData.length} Items
                        </span>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-200">
                                <tr>
                                    <th className="px-6 py-4">Item Name</th>
                                    <th className="px-6 py-4 text-center">Total Purchase</th>
                                    <th className="px-6 py-4 text-center">Total Sold</th>
                                    <th className="px-6 py-4 text-center">Active Stock</th>
                                    <th className="px-6 py-4 text-center">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {stockData.length === 0 ? (
                                    <tr>
                                        <td colSpan="5" className="px-6 py-8 text-center text-slate-400">No data found in this range</td>
                                    </tr>
                                ) : (
                                    stockData.map((item, i) => (
                                        <tr key={i} className="hover:bg-slate-50 transition-colors">
                                            <td className="px-6 py-4 font-bold text-slate-700">{item.name}</td>
                                            <td className="px-6 py-4 text-center font-mono font-medium text-slate-600">
                                                {item.purchase.toFixed(2)} <span className="text-xs text-slate-400">kg</span>
                                            </td>
                                            <td className="px-6 py-4 text-center font-mono font-medium text-orange-600">
                                                {item.sold > 0 ? (
                                                    <>
                                                        {item.sold.toFixed(2)} <span className="text-xs text-orange-400">kg</span>
                                                    </>
                                                ) : '-'}
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <span className={`inline-flex items-center gap-1 font-mono font-bold px-2.5 py-1 rounded-md ${item.stock > 0 ? 'bg-green-50 text-green-700 ring-1 ring-green-200' : 'bg-slate-100 text-slate-400'
                                                    }`}>
                                                    {item.stock.toFixed(2)} kg
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <div className="w-full bg-slate-100 rounded-full h-2 max-w-[100px] mx-auto overflow-hidden">
                                                    <div
                                                        className={`h-full rounded-full ${item.stock > 0 ? 'bg-green-500' : 'bg-slate-300'}`}
                                                        style={{ width: `${item.purchase > 0 ? (item.stock / item.purchase) * 100 : 0}%` }}
                                                    ></div>
                                                </div>
                                                <span className="text-[10px] text-slate-400 font-medium mt-1 block">
                                                    {item.purchase > 0 ? ((item.stock / item.purchase) * 100).toFixed(0) : 0}% Available
                                                </span>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                            {stockData.length > 0 && (
                                <tfoot className="bg-slate-100 border-t-2 border-slate-200 font-bold text-slate-700 sticky bottom-0">
                                    <tr>
                                        <td className="px-6 py-4 text-right uppercase text-xs tracking-wider">Total</td>
                                        <td className="px-6 py-4 text-center font-mono text-blue-700 text-base">
                                            {stockData.reduce((sum, item) => sum + item.purchase, 0).toFixed(2)} <span className="text-[10px] text-slate-500 font-sans">kg</span>
                                        </td>
                                        <td className="px-6 py-4 text-center font-mono text-orange-600 text-base">
                                            {stockData.reduce((sum, item) => sum + item.sold, 0).toFixed(2)} <span className="text-[10px] text-orange-400 font-sans">kg</span>
                                        </td>
                                        <td className="px-6 py-4 text-center font-mono text-green-700 text-base">
                                            {stockData.reduce((sum, item) => sum + item.stock, 0).toFixed(2)} <span className="text-[10px] text-green-500 font-sans">kg</span>
                                        </td>
                                        <td></td>
                                    </tr>
                                </tfoot>
                            )}
                        </table>
                    </div>
                </div>
            )}

            {/* Detailed KPI Modal */}
            {kpiModal && (
                <DetailModal
                    isOpen={!!kpiModal}
                    onClose={() => setKpiModal(null)}
                    title={kpiModal.title}
                    data={kpiModal.data}
                    type={kpiModal.type}
                />
            )}
        </div>
    );
};

const KPICard = ({ title, value, unit, icon: Icon, color, trend, onClick, className = '' }) => {
    // Color maps for gradients
    const colorStyles = {
        blue: 'from-blue-50 to-white text-blue-600 border-blue-100',
        indigo: 'from-indigo-50 to-white text-indigo-600 border-indigo-100',
        green: 'from-emerald-50 to-white text-emerald-600 border-emerald-100',
        emerald: 'from-teal-50 to-white text-teal-600 border-teal-100',
        orange: 'from-orange-50 to-white text-orange-600 border-orange-100' // Added orange explicitly if missing
    };

    const iconStyles = {
        blue: 'bg-blue-100 text-blue-600',
        indigo: 'bg-indigo-100 text-indigo-600',
        green: 'bg-emerald-100 text-emerald-600',
        emerald: 'bg-teal-100 text-teal-600',
        orange: 'bg-orange-100 text-orange-600'
    };

    return (
        <div
            onClick={onClick}
            className={`p-5 rounded-2xl border bg-gradient-to-br transition-all duration-300 hover:-translate-y-1 hover:shadow-xl ${colorStyles[color] || colorStyles.blue} shadow-sm relative overflow-hidden group ${onClick ? 'cursor-pointer active:scale-95' : ''} ${className}`}
        >
            {/* Background Decoration */}
            <div className="absolute right-0 top-0 w-24 h-24 bg-white opacity-40 rounded-full blur-2xl -mr-6 -mt-6 pointer-events-none"></div>

            <div className="flex justify-between items-start mb-4 relative z-10">
                <div className={`p-3 rounded-xl ${iconStyles[color] || iconStyles.blue} shadow-sm`}>
                    <Icon size={22} strokeWidth={2.5} />
                </div>
                {trend && (
                    <span className="flex items-center gap-1 text-xs font-bold text-green-600 bg-green-50 px-2 py-1 rounded-full border border-green-100">
                        <ArrowUpRight size={12} /> {trend}%
                    </span>
                )}
            </div>

            <div className="relative z-10">
                <p className="text-slate-500 text-[11px] font-bold uppercase tracking-wider mb-1 opacity-80">{title}</p>
                <h3 className="text-2xl font-black text-slate-800 tracking-tight">
                    {unit !== 'kg' && <span className="text-lg text-slate-400 mr-1 font-medium">₹</span>}
                    <CountUp end={value} duration={1500} decimals={0} />
                    {unit === 'kg' && <span className="text-sm text-slate-500 ml-1 font-medium">kg</span>}
                </h3>
            </div>
        </div>
    );
};

const DetailModal = ({ isOpen, onClose, title, data, type }) => {
    if (!isOpen) return null;

    const [showExport, setShowExport] = useState(false);

    const handleExportExcel = () => {
        let ws;
        let filename = 'Report_Data.xlsx';

        if (type === 'purchase') {
            const excelData = data.map(c => ({
                Date: formatDate(c.date),
                ContainerNo: c.containerNo,
                Firm: c.firm,
                AssortmentWgt: c.assortmentWeight || '',
                NetWeight: (c.items ? c.items.reduce((s, item) => s + (parseFloat(item.quantity) || 0), 0) : 0),
                Amount: parseFloat(c.totalAmount || 0)
            }));

            // Add Total Row
            const totalWeight = excelData.reduce((sum, row) => sum + row.NetWeight, 0);
            const totalAmount = excelData.reduce((sum, row) => sum + row.Amount, 0);
            excelData.push({
                Date: 'TOTAL',
                ContainerNo: '',
                Firm: '',
                AssortmentWgt: '',
                NetWeight: totalWeight,
                Amount: totalAmount
            });

            ws = XLSX.utils.json_to_sheet(excelData);
        } else if (type === 'sales') {
            const excelData = data.map(s => ({
                Date: formatDate(s.date),
                InvoiceNo: s.invoiceNo,
                Buyer: s.buyerName,
                Weight: parseFloat(s.quantity || 0),
                Amount: parseFloat(s.totalAmount || 0)
            }));

            // Add Total Row
            const totalWeight = excelData.reduce((sum, row) => sum + row.Weight, 0);
            const totalAmount = excelData.reduce((sum, row) => sum + row.Amount, 0);
            excelData.push({
                Date: 'TOTAL',
                InvoiceNo: '',
                Buyer: '',
                Weight: totalWeight,
                Amount: totalAmount
            });

            ws = XLSX.utils.json_to_sheet(excelData);
        } else if (type === 'stock') {
            const excelData = data.map(i => ({
                Item: i.name,
                Purchase: i.purchase,
                Sold: i.sold,
                Stock: i.stock,
                Availability: `${i.purchase > 0 ? ((i.stock / i.purchase) * 100).toFixed(0) : 0}%`
            }));

            // Add Total Row
            const totalPurchase = excelData.reduce((sum, row) => sum + row.Purchase, 0);
            const totalSold = excelData.reduce((sum, row) => sum + row.Sold, 0);
            const totalStock = excelData.reduce((sum, row) => sum + row.Stock, 0);
            excelData.push({
                Item: 'TOTAL',
                Purchase: totalPurchase,
                Sold: totalSold,
                Stock: totalStock,
                Availability: ''
            });

            ws = XLSX.utils.json_to_sheet(excelData);
        }

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Data");
        XLSX.writeFile(wb, `${title.replace(/\s+/g, '_')}.xlsx`);
    };

    const handleExportPDF = () => {
        const doc = new jsPDF();
        doc.setFontSize(14);
        doc.text(title, 14, 15);
        doc.setFontSize(10);
        doc.text(`Generated on: ${formatDate(new Date())}`, 14, 22);

        let headers = [];
        let body = [];

        if (type === 'purchase') {
            headers = [['Date', 'Container', 'Firm', 'Weight', 'Amount']];
            body = data.map(c => [
                formatDate(c.date),
                c.containerNo,
                c.firm,
                (c.items ? c.items.reduce((s, item) => s + (parseFloat(item.quantity) || 0), 0) : 0).toFixed(2),
                parseFloat(c.totalAmount || 0).toLocaleString('en-IN')
            ]);

            // Total Row
            const totalWeight = data.reduce((sum, row) => sum + (row.items ? row.items.reduce((s, item) => s + (parseFloat(item.quantity) || 0), 0) : 0), 0);
            const totalAmount = data.reduce((sum, row) => sum + parseFloat(row.totalAmount || 0), 0);
            body.push(['TOTAL', '', '', totalWeight.toFixed(2), totalAmount.toLocaleString('en-IN')]);

        } else if (type === 'sales') {
            headers = [['Date', 'Invoice', 'Buyer', 'Weight', 'Amount']];
            body = data.map(s => [
                formatDate(s.date),
                s.invoiceNo,
                s.buyerName,
                parseFloat(s.quantity || 0).toFixed(2),
                parseFloat(s.totalAmount || 0).toLocaleString('en-IN')
            ]);

            // Total Row
            const totalWeight = data.reduce((sum, row) => sum + parseFloat(row.quantity || 0), 0);
            const totalAmount = data.reduce((sum, row) => sum + parseFloat(row.totalAmount || 0), 0);
            body.push(['TOTAL', '', '', totalWeight.toFixed(2), totalAmount.toLocaleString('en-IN')]);

        } else if (type === 'stock') {
            headers = [['Item', 'Purchase', 'Sold', 'Stock', '%']];
            body = data.map(i => [
                i.name,
                i.purchase.toFixed(2),
                i.sold.toFixed(2),
                i.stock.toFixed(2),
                `${i.purchase > 0 ? ((i.stock / i.purchase) * 100).toFixed(0) : 0}%`
            ]);

            // Total Row
            const totalPurchase = data.reduce((sum, row) => sum + row.purchase, 0);
            const totalSold = data.reduce((sum, row) => sum + row.sold, 0);
            const totalStock = data.reduce((sum, row) => sum + row.stock, 0);
            body.push(['TOTAL', totalPurchase.toFixed(2), totalSold.toFixed(2), totalStock.toFixed(2), '']);
        }

        autoTable(doc, {
            head: headers,
            body: body,
            startY: 25,
            theme: 'grid',
            headStyles: { fillColor: [66, 133, 244] }
        });

        doc.save(`${title.replace(/\s+/g, '_')}.pdf`);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                    <div>
                        <h2 className="text-lg font-black text-slate-800 tracking-tight">{title}</h2>
                        <p className="text-xs text-slate-500 font-medium">{data.length} Records found</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="relative">
                            <button
                                onClick={() => setShowExport(!showExport)}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 text-slate-600 rounded-lg text-xs font-bold hover:bg-slate-50 transition-colors shadow-sm"
                            >
                                <Download size={14} /> Export
                            </button>
                            {showExport && (
                                <div className="absolute right-0 mt-2 w-32 bg-white border border-slate-100 rounded-xl shadow-xl z-50 overflow-hidden ring-1 ring-slate-100 animate-in fade-in slide-in-from-top-1">
                                    <button onClick={() => { handleExportExcel(); setShowExport(false); }} className="w-full text-left px-4 py-2 text-xs hover:bg-slate-50">Excel</button>
                                    <button onClick={() => { handleExportPDF(); setShowExport(false); }} className="w-full text-left px-4 py-2 text-xs hover:bg-slate-50 border-t border-slate-50">PDF</button>
                                </div>
                            )}
                        </div>
                        <button onClick={onClose} className="p-2 hover:bg-slate-200/50 rounded-full transition-colors text-slate-400 hover:text-red-500">
                            <X size={20} />
                        </button>
                    </div>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-auto p-0">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200 sticky top-0 z-10 shadow-sm">
                            <tr>
                                {type === 'purchase' && (
                                    <>
                                        <th className="px-6 py-3">Date</th>
                                        <th className="px-6 py-3">Container</th>
                                        <th className="px-6 py-3">Firm</th>
                                        <th className="px-6 py-3 text-right">Weight</th>
                                        <th className="px-6 py-3 text-right">Amount</th>
                                    </>
                                )}
                                {type === 'sales' && (
                                    <>
                                        <th className="px-6 py-3">Date</th>
                                        <th className="px-6 py-3">Invoice</th>
                                        <th className="px-6 py-3">Buyer</th>
                                        <th className="px-6 py-3 text-right">Weight</th>
                                        <th className="px-6 py-3 text-right">Amount</th>
                                    </>
                                )}
                                {type === 'stock' && (
                                    <>
                                        <th className="px-6 py-3">Item</th>
                                        <th className="px-6 py-3 text-center">Purchase</th>
                                        <th className="px-6 py-3 text-center">Sold</th>
                                        <th className="px-6 py-3 text-center">Stock</th>
                                        <th className="px-6 py-3 text-center">% Free</th>
                                    </>
                                )}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {data.map((row, i) => (
                                <tr key={i} className="hover:bg-slate-50">
                                    {type === 'purchase' && (
                                        <>
                                            <td className="px-6 py-3 text-slate-600">{formatDate(row.date)}</td>
                                            <td className="px-6 py-3 font-medium text-slate-800">{row.containerNo}</td>
                                            <td className="px-6 py-3 text-slate-600">{row.firm}</td>
                                            <td className="px-6 py-3 text-right font-mono text-slate-700">{(row.items ? row.items.reduce((s, item) => s + (parseFloat(item.quantity) || 0), 0) : 0).toFixed(2)}</td>
                                            <td className="px-6 py-3 text-right font-mono text-slate-700">{parseFloat(row.totalAmount).toLocaleString('en-IN')}</td>
                                        </>
                                    )}
                                    {type === 'sales' && (
                                        <>
                                            <td className="px-6 py-3 text-slate-600">{formatDate(row.date)}</td>
                                            <td className="px-6 py-3 font-medium text-slate-800">{row.invoiceNo}</td>
                                            <td className="px-6 py-3 text-slate-600">{row.buyerName}</td>
                                            <td className="px-6 py-3 text-right font-mono text-slate-700">{parseFloat(row.quantity).toFixed(2)}</td>
                                            <td className="px-6 py-3 text-right font-mono text-slate-700">{parseFloat(row.totalAmount).toLocaleString('en-IN')}</td>
                                        </>
                                    )}
                                    {type === 'stock' && (
                                        <>
                                            <td className="px-6 py-3 font-bold text-slate-700">{row.name}</td>
                                            <td className="px-6 py-3 text-center font-mono">{row.purchase.toFixed(2)}</td>
                                            <td className="px-6 py-3 text-center font-mono text-orange-600">{row.sold.toFixed(2)}</td>
                                            <td className="px-6 py-3 text-center font-mono text-green-600 font-bold">{row.stock.toFixed(2)}</td>
                                            <td className="px-6 py-3 text-center">
                                                <span className={`px-2 py-0.5 rounded text-xs font-bold ${row.stock > 0 ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-400'}`}>
                                                    {row.purchase > 0 ? ((row.stock / row.purchase) * 100).toFixed(0) : 0}%
                                                </span>
                                            </td>
                                        </>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                        <tfoot className="bg-slate-100 border-t-2 border-slate-200 font-bold text-slate-700 sticky bottom-0 z-20 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
                            <tr>
                                {type === 'purchase' && (
                                    <>
                                        <td colSpan={3} className="px-6 py-4 text-right uppercase text-xs tracking-wider">Total</td>
                                        <td className="px-6 py-4 text-right font-mono text-blue-700 text-base">
                                            {data.reduce((sum, row) => sum + (row.items ? row.items.reduce((s, item) => s + (parseFloat(item.quantity) || 0), 0) : 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </td>
                                        <td className="px-6 py-4 text-right font-mono text-emerald-700 text-base">
                                            {data.reduce((sum, row) => sum + parseFloat(row.totalAmount || 0), 0).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })}
                                        </td>
                                    </>
                                )}
                                {type === 'sales' && (
                                    <>
                                        <td colSpan={3} className="px-6 py-4 text-right uppercase text-xs tracking-wider">Total</td>
                                        <td className="px-6 py-4 text-right font-mono text-blue-700 text-base">
                                            {data.reduce((sum, row) => sum + parseFloat(row.quantity || 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </td>
                                        <td className="px-6 py-4 text-right font-mono text-emerald-700 text-base">
                                            {data.reduce((sum, row) => sum + parseFloat(row.totalAmount || 0), 0).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })}
                                        </td>
                                    </>
                                )}
                                {type === 'stock' && (
                                    <>
                                        <td className="px-6 py-4 text-right uppercase text-xs tracking-wider">Total</td>
                                        <td className="px-6 py-4 text-center font-mono text-blue-700 text-base">
                                            {data.reduce((sum, item) => sum + item.purchase, 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </td>
                                        <td className="px-6 py-4 text-center font-mono text-orange-600 text-base">
                                            {data.reduce((sum, item) => sum + item.sold, 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </td>
                                        <td className="px-6 py-4 text-center font-mono text-green-700 text-base">
                                            {data.reduce((sum, item) => sum + item.stock, 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </td>
                                        <td></td>
                                    </>
                                )}
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>
        </div>
    );
};

// Helper for icon import collision
const PieChartIcon = ({ size, className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M21.21 15.89A10 10 0 1 1 8 2.83" /><path d="M22 12A10 10 0 0 0 12 2v10z" /></svg>
);

export default Reports;