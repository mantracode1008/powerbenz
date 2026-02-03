import React, { useState, useEffect } from 'react';
import { getSales } from '../services/api';
import { formatDate } from '../utils/dateUtils';
import { Download, FileText, Calendar, X, ChevronDown, TrendingUp } from 'lucide-react';
import CustomDatePicker from '../components/CustomDatePicker';
import XLSX from 'xlsx-js-style';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useAuth } from '../context/AuthContext';

const SaleSummary = () => {
    const { user } = useAuth();
    const isAdmin = user?.role === 'Admin';
    const canViewRates = isAdmin || user?.permissions?.includes('/rates');
    const [sales, setSales] = useState([]);
    // ...


    const [loading, setLoading] = useState(true);
    const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));
    const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
    const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10));
    const [filterType, setFilterType] = useState('month'); // 'month', 'date', 'range'
    const [showExportMenu, setShowExportMenu] = useState(false);

    useEffect(() => {
        fetchData();
    }, [selectedMonth, selectedDate, startDate, endDate, filterType]);

    const fetchData = async () => {
        try {
            const response = await getSales({}); // Fetch all sales

            let allSales = response.data || [];

            // Client-side filtering
            if (filterType === 'month') {
                if (selectedMonth) {
                    allSales = allSales.filter(s => s.date && s.date.startsWith(selectedMonth));
                }
            } else if (filterType === 'date') {
                allSales = allSales.filter(s => s.date && s.date.startsWith(selectedDate));
            } else if (filterType === 'range') {
                allSales = allSales.filter(s => {
                    const sDate = s.date ? s.date.slice(0, 10) : '';
                    return sDate >= startDate && sDate <= endDate;
                });
            }

            setSales(allSales);
            setLoading(false);
        } catch (error) {
            console.error('Error fetching sale summary:', error);
            setLoading(false);
        }
    };

    const totalAmount = Array.isArray(sales) ? sales.reduce((sum, sale) => sum + (parseFloat(sale.totalAmount) || 0), 0) : 0;
    const totalQty = Array.isArray(sales) ? sales.reduce((sum, sale) => sum + (parseFloat(sale.quantity) || 0), 0) : 0;

    const getVehicleNumbers = (sale) => {
        if (!sale.allocations || !Array.isArray(sale.allocations)) return '-';
        const vehicles = sale.allocations
            .map(a => a.ContainerItem?.Container?.containerNo)
            .filter(Boolean);
        return [...new Set(vehicles)].join(', ');
    };

    const getPeriodText = () => {
        if (filterType === 'month') return `Month: ${selectedMonth}`;
        if (filterType === 'date') return `Date: ${formatDate(selectedDate)}`;
        if (filterType === 'range') return `Period: ${formatDate(startDate)} to ${formatDate(endDate)}`;
        return '';
    };

    const getFilename = (base) => {
        let suffix = '';
        if (filterType === 'month') suffix = selectedMonth;
        else if (filterType === 'date') suffix = selectedDate;
        else if (filterType === 'range') suffix = `${startDate}_to_${endDate}`;
        return `${base}_${suffix}.xlsx`;
    };

    const exportToExcel = () => {
        const wb = XLSX.utils.book_new();

        // 1. Prepare Header
        const headers = ["Sr No", "Date", "Buyer Name", "Invoice No", "Item", "Vehicle/Container", "Qty", "Rate", "Amount"];
        if (!canViewRates) {
            // Remove Rate and Amount if no permission
            headers.splice(7, 2);
        }

        const dataRows = [];

        // 2. Prepare Data
        let lastInvoice = null;
        sales.forEach((sale, index) => {
            const isSame = lastInvoice === sale.invoiceNo;
            const row = [
                index + 1,
                isSame ? '' : formatDate(sale.date),
                isSame ? '' : sale.buyerName,
                isSame ? '' : (sale.invoiceNo || '-'),
                sale.itemName,
                getVehicleNumbers(sale),
                parseFloat(sale.quantity) || 0
            ];
            if (canViewRates) {
                row.push(parseFloat(sale.rate) || 0);
                row.push(parseFloat(sale.totalAmount) || 0);
            }
            dataRows.push(row);
            if (!isSame) lastInvoice = sale.invoiceNo;
        });

        // 3. Prepare Total
        const totalRow = [
            '', 'TOTAL', '', '', '', '', totalQty
        ];
        if (canViewRates) {
            totalRow.push(''); // rate
            totalRow.push(totalAmount);
        }
        dataRows.push(totalRow);

        // 4. Create Sheet
        const ws = XLSX.utils.aoa_to_sheet([headers, ...dataRows]);

        // 5. Apply Styles
        const range = XLSX.utils.decode_range(ws['!ref']);
        for (let R = range.s.r; R <= range.e.r; ++R) {
            for (let C = range.s.c; C <= range.e.c; ++C) {
                const cell_address = { c: C, r: R };
                const cell_ref = XLSX.utils.encode_cell(cell_address);
                if (!ws[cell_ref]) continue;

                // Default Style
                ws[cell_ref].s = {
                    font: { sz: 10 },
                    alignment: { vertical: "center", horizontal: "left" },
                    border: {
                        top: { style: "thin", color: { rgb: "E2E8F0" } }, // Slate 200
                        bottom: { style: "thin", color: { rgb: "E2E8F0" } }
                    }
                };

                // Header Style
                if (R === 0) {
                    ws[cell_ref].s = {
                        font: { bold: true, color: { rgb: "FFFFFF" } },
                        fill: { fgColor: { rgb: "059669" } }, // Emerald 600
                        alignment: { horizontal: "center", vertical: "center" },
                        border: { bottom: { style: "medium", color: { rgb: "FFFFFF" } } }
                    };
                }

                // Numeric Alignment (Qty, Rate, Amount are usually last 3 cols)
                // Logic depends on columns presence
                // Always Qty is index 6. Rate 7, Amount 8.
                if (C >= 6) {
                    ws[cell_ref].s.alignment.horizontal = "right";
                }

                // Total Row Style
                if (R === range.e.r) {
                    ws[cell_ref].s.font = { bold: true };
                    ws[cell_ref].s.fill = { fgColor: { rgb: "F0FDF4" } }; // Emerald 50
                    ws[cell_ref].s.border.top = { style: "medium", color: { rgb: "34D399" } };
                }
            }
        }

        // Adjust Column Widths
        ws['!cols'] = [
            { wch: 8 },  // Sr
            { wch: 12 }, // Date
            { wch: 25 }, // Buyer
            { wch: 15 }, // Invoice
            { wch: 20 }, // Item
            { wch: 25 }, // Vehicle
            { wch: 12 }, // Qty
            { wch: 12 }, // Rate
            { wch: 15 }  // Amount
        ];

        XLSX.utils.book_append_sheet(wb, ws, "Sale Summary");
        XLSX.writeFile(wb, getFilename("Sale_Summary"));
    };

    const exportToPDF = () => {
        const doc = new jsPDF();
        doc.text("Sale Summary Report", 14, 20);
        doc.setFontSize(10);
        doc.text(getPeriodText(), 14, 30);

        const tableColumn = ["Date", "Buyer", "Inv No", "Item", "Vehicle", "Qty", "Rate", "Amount"];
        const tableRows = [];

        let lastInvoice = null;
        sales.forEach(sale => {
            const isSame = lastInvoice === sale.invoiceNo;
            const saleData = [
                isSame ? '' : formatDate(sale.date),
                isSame ? '' : sale.buyerName,
                isSame ? '' : (sale.invoiceNo || '-'),
                sale.itemName,
                getVehicleNumbers(sale),
                sale.quantity,
                canViewRates ? sale.rate : '-',
                canViewRates ? sale.totalAmount : '-'
            ];
            tableRows.push(saleData);
            if (!isSame) lastInvoice = sale.invoiceNo;
        });

        // Total Row
        if (canViewRates) {
            tableRows.push(['', 'Total', '', '', '', totalQty, '', totalAmount]);
        }

        autoTable(doc, {
            head: [tableColumn],
            body: tableRows,
            startY: 40,
            styles: { fontSize: 8 },
            columnStyles: {
                0: { cellWidth: 20 },
                1: { cellWidth: 30 }, // Buyer
                2: { cellWidth: 20 }, // Inv
                4: { cellWidth: 25 }, // Vehicle
            }
        });

        doc.save(getFilename("Sale_Summary").replace('.xlsx', '.pdf'));
    };

    if (loading) {
        return (
            <div className="flex justify-center items-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Header Toolbar */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col xl:flex-row justify-between items-center gap-4 animate-in slide-in-from-top-2">

                {/* Title Section */}
                <div className="flex items-center gap-4 w-full xl:w-auto">
                    <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl hidden md:block">
                        <TrendingUp size={24} />
                    </div>
                    <div>
                        <h1 className="text-xl font-black text-slate-800 tracking-tight">Sale Summary</h1>
                        <div className="flex items-center gap-2 text-slate-500 text-xs font-medium mt-0.5">
                            <span className="bg-slate-100 px-2 py-0.5 rounded text-slate-600 border border-slate-200">Revenue Analysis</span>
                            <span>•</span>
                            <span>Overview of sales performance</span>
                        </div>
                    </div>
                </div>

                {/* Right Side Controls */}
                <div className="flex flex-col md:flex-row items-center gap-3 w-full xl:w-auto">

                    {/* 1. Filter Type Selector (Pill) */}
                    <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200 w-full md:w-auto">
                        {['month', 'date', 'range'].map((type) => (
                            <button
                                key={type}
                                onClick={() => setFilterType(type)}
                                className={`flex-1 md:flex-none px-4 py-1.5 rounded-md text-xs font-bold uppercase tracking-wider transition-all duration-200 ${filterType === type
                                    ? 'bg-white text-emerald-600 shadow-sm ring-1 ring-black/5'
                                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
                                    }`}
                            >
                                {type}
                            </button>
                        ))}
                    </div>

                    {/* 2. Date Pickers */}
                    <div className="flex-1 w-full md:w-auto min-w-[200px]">
                        {filterType === 'month' && (
                            <div className="relative group">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                                    <Calendar size={16} />
                                </div>
                                <CustomDatePicker
                                    value={selectedMonth ? `${selectedMonth}-01` : null}
                                    onChange={(e) => setSelectedMonth(e.target.value ? e.target.value.slice(0, 7) : '')}
                                    dateFormat="MMMM yyyy"
                                    showMonthYearPicker
                                    placeholder="Select Month"
                                    className="w-full pl-10 pr-8 py-2 bg-white border border-slate-200 rounded-lg text-sm font-semibold text-slate-700 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all shadow-sm hover:border-emerald-300"
                                    isClearable={false}
                                />
                                {selectedMonth && (
                                    <button
                                        onClick={() => setSelectedMonth('')}
                                        className="absolute inset-y-0 right-2 flex items-center text-slate-300 hover:text-red-500 transition-colors"
                                    >
                                        <X size={14} />
                                    </button>
                                )}
                            </div>
                        )}

                        {filterType === 'date' && (
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                                    <Calendar size={16} />
                                </div>
                                <CustomDatePicker
                                    value={selectedDate}
                                    onChange={(e) => setSelectedDate(e.target.value)}
                                    placeholder="Select Date"
                                    className="w-full pl-10 pr-8 py-2 bg-white border border-slate-200 rounded-lg text-sm font-semibold text-slate-700 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all shadow-sm hover:border-emerald-300"
                                    isClearable={false}
                                />
                                {selectedDate && (
                                    <button
                                        onClick={() => setSelectedDate('')}
                                        className="absolute inset-y-0 right-2 flex items-center text-slate-300 hover:text-red-500 transition-colors"
                                    >
                                        <X size={14} />
                                    </button>
                                )}
                            </div>
                        )}

                        {filterType === 'range' && (
                            <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-2 py-1.5 shadow-sm hover:border-emerald-300 transition-colors">
                                <CustomDatePicker
                                    value={startDate}
                                    onChange={(e) => setStartDate(e.target.value)}
                                    placeholder="Start"
                                    className="w-24 text-xs font-semibold text-slate-700 border-none outline-none bg-transparent text-center"
                                    isClearable={false}
                                />
                                <span className="text-slate-300">→</span>
                                <CustomDatePicker
                                    value={endDate}
                                    onChange={(e) => setEndDate(e.target.value)}
                                    placeholder="End"
                                    className="w-24 text-xs font-semibold text-slate-700 border-none outline-none bg-transparent text-center"
                                    isClearable={false}
                                />
                            </div>
                        )}
                    </div>

                    <div className="hidden md:block w-px h-8 bg-slate-200 mx-1"></div>

                    {/* 3. Action Buttons */}
                    <div className="relative w-full md:w-auto">
                        <button
                            onClick={() => setShowExportMenu(!showExportMenu)}
                            className={`w-full md:w-auto flex items-center justify-center gap-2 px-4 py-2 border border-slate-200 rounded-lg text-sm font-bold shadow-sm transition-all whitespace-nowrap ${showExportMenu ? 'bg-slate-100 text-slate-800' : 'bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-800'}`}
                        >
                            <Download size={16} />
                            <span className="hidden sm:inline">Export</span>
                            <ChevronDown size={14} className={`transition-transform duration-200 ${showExportMenu ? 'rotate-180' : ''}`} />
                        </button>

                        {showExportMenu && (
                            <div className="absolute right-0 mt-2 w-40 bg-white rounded-xl shadow-xl border border-slate-100 overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-200 origin-top-right">
                                <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                                    Download As
                                </div>
                                <button
                                    onClick={() => { exportToExcel(); setShowExportMenu(false); }}
                                    className="w-full text-left px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:text-green-700 flex items-center gap-3 transition-colors"
                                >
                                    <FileText size={16} className="text-green-600" /> Excel Sheet
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

            <div className="glass-card overflow-hidden border border-slate-200 rounded-xl shadow-sm mt-4">
                <div className="overflow-x-auto">
                    <table className="min-w-full text-sm text-left">
                        <thead className="bg-slate-50 border-b border-slate-200">
                            <tr>
                                <th className="px-4 py-3 font-semibold text-slate-600">Date</th>
                                <th className="px-4 py-3 font-semibold text-slate-600">Buyer Name</th>
                                <th className="px-4 py-3 font-semibold text-slate-600">Inv No</th>
                                <th className="px-4 py-3 font-semibold text-slate-600">Item</th>
                                <th className="px-4 py-3 font-semibold text-slate-600">Container No</th>
                                <th className="px-4 py-3 font-semibold text-slate-600 text-right">Qty</th>
                                {canViewRates && <th className="px-4 py-3 font-semibold text-slate-600 text-right">Rate</th>}
                                {canViewRates && <th className="px-4 py-3 font-semibold text-slate-600 text-right">Amount</th>}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                            {sales.length === 0 ? (
                                <tr>
                                    <td colSpan={canViewRates ? "8" : "6"} className="px-4 py-8 text-center text-slate-500">
                                        No sales found for selected period
                                    </td>
                                </tr>
                            ) : (
                                <>
                                    {sales.map((sale, index) => {
                                        const isSame = index > 0 && sales[index - 1].invoiceNo === sale.invoiceNo;
                                        return (
                                            <tr key={sale._id || index} className={`hover:bg-slate-50 transition-colors ${!isSame ? 'border-t-2 border-slate-200' : 'border-t border-slate-100'}`}>
                                                <td className="px-4 py-2 text-slate-500 whitespace-nowrap">
                                                    {!isSame && formatDate(sale.date)}
                                                </td>
                                                <td className="px-4 py-2 font-medium text-slate-800">
                                                    {!isSame && sale.buyerName}
                                                </td>
                                                <td className="px-4 py-2 text-slate-600">
                                                    {!isSame && (sale.invoiceNo || '-')}
                                                </td>
                                                <td className="px-4 py-2 text-slate-600">
                                                    {sale.itemName}
                                                </td>
                                                <td className="px-4 py-2 text-slate-500 text-xs">
                                                    {getVehicleNumbers(sale)}
                                                </td>
                                                <td className="px-4 py-2 text-right text-slate-600">
                                                    {parseFloat(sale.quantity).toFixed(2)}
                                                </td>
                                                {canViewRates && (
                                                    <td className="px-4 py-2 text-right text-slate-600">
                                                        {parseFloat(sale.rate).toFixed(2)}
                                                    </td>
                                                )}
                                                {canViewRates && (
                                                    <td className="px-4 py-2 text-right font-bold text-emerald-600">
                                                        {parseFloat(sale.totalAmount).toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}
                                                    </td>
                                                )}
                                            </tr>
                                        );
                                    })}
                                    {/* Total Row */}
                                    <tr className="bg-slate-50 font-bold border-t-2 border-slate-200">
                                        <td colSpan="5" className="px-4 py-3 text-right text-slate-800">Total</td>
                                        <td className="px-4 py-3 text-right text-slate-800">{totalQty.toFixed(2)}</td>
                                        {canViewRates && <td className="px-4 py-3 text-right text-slate-800"></td>}
                                        {canViewRates && (
                                            <td className="px-4 py-3 text-right text-emerald-600">
                                                {totalAmount.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}
                                            </td>
                                        )}
                                    </tr>
                                </>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default SaleSummary;
