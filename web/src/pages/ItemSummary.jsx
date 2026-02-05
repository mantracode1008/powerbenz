import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { getContainers, createItem, getItems, getItemSummary, getAvailableContainers, api, updateContainerItem, updateItem, deleteItem } from '../services/api';
import { formatDate } from '../utils/dateUtils';
import { Download, FileText, Plus, X, Calendar, ChevronDown, RotateCcw, Eye, Edit2, Save, XCircle, Trash2 } from 'lucide-react';
import CustomDatePicker from '../components/CustomDatePicker';
import XLSX from 'xlsx-js-style';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const ItemSummary = () => {
    const { user } = useAuth();
    const canViewRates = user?.role === 'Admin' || user?.permissions?.includes('/rates');

    const [items, setItems] = useState([]);
    const [columns, setColumns] = useState([]);
    const [grandTotal, setGrandTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));
    const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
    const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10));
    const [filterType, setFilterType] = useState('month'); // 'month', 'date', 'range'

    // Add Item Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [newItemData, setNewItemData] = useState({ name: '', defaultRate: '' });
    const [modalError, setModalError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showExportMenu, setShowExportMenu] = useState(false);

    // Breakdown State
    const [isBreakdownModalOpen, setIsBreakdownModalOpen] = useState(false);
    const [selectedItem, setSelectedItem] = useState(null);
    const [breakdownData, setBreakdownData] = useState([]);
    const [loadingBreakdown, setLoadingBreakdown] = useState(false);

    // Edit State for Breakdown
    // Edit State for Breakdown
    const [editingItemId, setEditingItemId] = useState(null);
    const [editQty, setEditQty] = useState('');

    // Checkbox Selection
    const [selectedItems, setSelectedItems] = useState(new Set());

    // Rename State
    const [renamingItemId, setRenamingItemId] = useState(null);
    const [renamingName, setRenamingName] = useState('');

    // Delete Modal State
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [itemToDelete, setItemToDelete] = useState(null);

    const navigate = useNavigate();

    const toggleSelection = (itemName, isChecked) => {
        const newSet = new Set(selectedItems);
        if (isChecked) {
            newSet.add(itemName);
        } else {
            newSet.delete(itemName);
        }
        setSelectedItems(newSet);
    };

    const handleCreateSale = () => {
        const selectedData = items.filter(i => selectedItems.has(i.itemName)).map(i => ({
            itemName: i.itemName,
            currentStock: i.activeStock,
            id: i._id || i.itemId
        }));

        navigate('/sales', { state: { selectedItems: selectedData } });
    };

    useEffect(() => {
        fetchData();
    }, [selectedMonth, selectedDate, startDate, endDate, filterType]);

    const fetchData = async () => {
        try {
            setLoading(true);

            const params = {};
            if (filterType === 'month' && selectedMonth) {
                params.month = selectedMonth;
            } else if (filterType === 'date' && selectedDate) {
                params.startDate = selectedDate;
                params.endDate = selectedDate;
            } else if (filterType === 'range' && startDate && endDate) {
                params.startDate = startDate;
                params.endDate = endDate;
            }

            // Backend returns { columns: ['01', '04'], items: [...], grandTotal: 100 }
            const response = await getItemSummary(params);

            // Handle both Array (Legacy/Error) and Object (New Matrix) response
            if (Array.isArray(response.data)) {
                // Fallback if backend reverted or legacy
                setItems(response.data);
                setColumns([]);
                setGrandTotal(0);
            } else {
                setItems(response.data.items || []);
                setColumns(response.data.columns || []);
                setGrandTotal(response.data.grandTotal || 0);
            }

            setLoading(false);
        } catch (error) {
            console.error('Error fetching item summary:', error);
            setLoading(false);
        }
    };

    const handleAddItem = async (e) => {
        e.preventDefault();
        setModalError('');
        setIsSubmitting(true);
        try {
            await createItem({
                name: newItemData.name,
                defaultRate: parseFloat(newItemData.defaultRate) || 0
            });
            await fetchData();
            setIsModalOpen(false);
            setNewItemData({ name: '', defaultRate: '' });
        } catch (error) {
            setModalError(error.response?.data?.message || 'Failed to add item');
        } finally {
            setIsSubmitting(false);
        }
    };

    const grandTotalPurchase = items.reduce((sum, item) => sum + (parseFloat(item.totalQty) || 0), 0);
    const grandTotalStock = items.reduce((sum, item) => sum + (parseFloat(item.currentStock !== undefined ? item.currentStock : item.activeStock) || 0), 0);
    const grandTotalStockValue = items.reduce((sum, item) => sum + (parseFloat(item.currentStockValue !== undefined ? item.currentStockValue : item.stockValue) || 0), 0);

    // Sold = Purchase - (No, use Real Sales from Backend)
    // If backend provides soldQty, use it. Else fallback.
    const grandTotalSold = items.reduce((sum, item) => sum + (parseFloat(item.soldQty !== undefined ? item.soldQty : (item.totalQty - item.activeStock)) || 0), 0);

    const handleItemClick = async (item) => {
        const itemId = item._id || item.itemId || item.id;
        if (!itemId) return;

        setSelectedItem(item);
        setIsBreakdownModalOpen(true);
        setLoadingBreakdown(true);
        setBreakdownData([]);

        try {
            const params = {};
            if (filterType === 'month' && selectedMonth) params.month = selectedMonth;
            if (filterType === 'date' && selectedDate) params.date = selectedDate;
            if (filterType === 'range') {
                params.startDate = startDate;
                params.endDate = endDate;
            }

            // Allow fetching all history (sold items too), specific to current filter
            params.mode = 'history';

            const response = await getAvailableContainers(itemId, params);
            setBreakdownData(response.data || []);
        } catch (error) {
            console.error("Failed to fetch breakdown", error);
        } finally {
            setLoadingBreakdown(false);
        }
    };

    const handleEditClick = (item) => {
        setEditingItemId(item.id);
        const currentQty = parseFloat(item.quantity || item.netWeight) || 0;
        setEditQty(currentQty);
    };

    const handleCancelEdit = () => {
        setEditingItemId(null);
        setEditQty('');
    };

    const handleSaveEdit = async (id) => {
        try {
            await updateContainerItem(id, { quantity: parseFloat(editQty) });
            setEditingItemId(null);

            // Refresh Data
            setLoadingBreakdown(true);
            const params = {};
            if (filterType === 'month' && selectedMonth) params.month = selectedMonth;
            if (filterType === 'date' && selectedDate) params.date = selectedDate;
            if (filterType === 'range') {
                params.startDate = startDate;
                params.endDate = endDate;
            }
            params.mode = 'history';

            // Re-fetch breakdown
            const response = await getAvailableContainers(selectedItem.itemId || selectedItem._id || selectedItem.id, params);
            setBreakdownData(response.data || []);

            // Also refresh main list to update totals
            fetchData();

        } catch (error) {
            console.error("Update failed", error);
            alert("Failed to update item: " + error.message);
        } finally {
            setLoadingBreakdown(false);
        }
    };

    // Item Rename & Delete Handlers
    const handleStartRename = (item, e) => {
        e.stopPropagation();
        setRenamingItemId(item._id || item.itemId || item.id);
        setRenamingName(item.itemName);
    };

    const handleCancelRename = (e) => {
        if (e) e.stopPropagation();
        setRenamingItemId(null);
        setRenamingName('');
    };

    const handleSaveRename = async (item, e) => {
        e.stopPropagation();
        const id = item._id || item.itemId || item.id;
        if (!id) return;

        try {
            await updateItem(id, { name: renamingName });
            setRenamingItemId(null);
            fetchData(); // Refresh list to show new name
        } catch (error) {
            console.error("Failed to rename item", error);
            alert("Failed to rename item");
        }
    };

    // Delete Modal Actions
    const handleDeleteClick = (item, e) => {
        e.stopPropagation();
        setItemToDelete(item);
        setIsDeleteModalOpen(true);
    };

    const confirmDelete = async () => {
        if (!itemToDelete) return;
        try {
            const id = itemToDelete._id || itemToDelete.itemId || itemToDelete.id;
            await deleteItem(id);
            fetchData();
            setIsDeleteModalOpen(false);
            setItemToDelete(null);
        } catch (error) {
            console.error("Failed to delete item", error);
            alert("Failed to delete item");
        }
    };

    // ... (existing handlers)



    // ... (rest of code)

    // In the JSX, replace the delete button handler:
    // onClick={(e) => handleDeleteClick(item, e)}

    // Add the Modal JSX at the end of the return statement (before the closing div)
    /*
            {isDeleteModalOpen && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[70] p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden animate-in scale-95 duration-200">
                        <div className="p-6 text-center">
                            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4 text-red-600">
                                <Trash2 size={24} />
                            </div>
                            <h3 className="text-lg font-bold text-slate-800 mb-2">Delete Item?</h3>
                            <p className="text-sm text-slate-500 mb-6">
                                Are you sure you want to delete <span className="font-bold text-slate-900">"{itemToDelete?.itemName}"</span>? This action cannot be undone.
                            </p>
                            <div className="flex gap-3">
                                <button 
                                    onClick={() => setIsDeleteModalOpen(false)}
                                    className="flex-1 px-4 py-2 border border-slate-200 rounded-lg text-slate-600 font-bold hover:bg-slate-50 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button 
                                    onClick={confirmDelete}
                                    className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg font-bold hover:bg-red-700 shadow-md hover:shadow-lg transition-all"
                                >
                                    Delete
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
    */


    const hasColumns = columns.length > 0;

    // Calculate Vertical Totals for Footer
    const columnTotals = columns.reduce((acc, col) => {
        acc[col] = items.reduce((sum, item) => sum + (parseFloat(item.dailyQty?.[col]) || 0), 0);
        return acc;
    }, {});

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
        const headers = ["Sr No", "Item Name", "Total Purchase", "Total Sold", "In Stock (In-Hand)"];
        if (canViewRates) headers.push("Stock Value (₹)");

        const dataRows = [];

        // 2. Prepare Data
        items.forEach((item, idx) => {
            const purchase = parseFloat(item.totalQty) || 0;
            const stock = parseFloat(item.currentStock !== undefined ? item.currentStock : item.activeStock) || 0;

            // Sold = Real Sales (soldQty) if available
            const remainingBatch = parseFloat(item.activeStock) || 0;
            const sold = item.soldQty !== undefined ? parseFloat(item.soldQty) : (purchase - remainingBatch);

            const row = [
                idx + 1,
                item.itemName,
                purchase,
                sold,
                stock
            ];
            if (canViewRates) row.push(item.stockValue || 0);

            dataRows.push(row);
        });

        // 3. Prepare Total
        const totalRow = [
            '',
            'TOTAL',
            grandTotalPurchase,
            grandTotalSold,
            grandTotalStock
        ];
        if (canViewRates) totalRow.push(grandTotalStockValue);

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
                        bottom: { style: "thin", color: { rgb: "E2E8F0" } },
                        left: { style: "thin", color: { rgb: "E2E8F0" } },
                        right: { style: "thin", color: { rgb: "E2E8F0" } }
                    }
                };

                // Header Style
                if (R === 0) {
                    ws[cell_ref].s = {
                        font: { bold: true, color: { rgb: "FFFFFF" } },
                        fill: { fgColor: { rgb: "475569" } }, // Slate 600
                        alignment: { horizontal: "center", vertical: "center" },
                        border: { bottom: { style: "medium", color: { rgb: "FFFFFF" } } }
                    };
                }

                // Numeric Columns Alignment (Total Purchase, Sold, Stock)
                if (C >= 2) {
                    ws[cell_ref].s.alignment.horizontal = "right";
                    ws[cell_ref].s.font = { ...ws[cell_ref].s.font, bold: true };

                    // Color Coding for Data Rows (exclude Header and Footer for now, or keep them if preferred)
                    if (R > 0 && R < range.e.r) {
                        if (C === 2) ws[cell_ref].s.font.color = { rgb: "1E40AF" }; // Purchase: Blue 800
                        if (C === 3) ws[cell_ref].s.font.color = { rgb: "EA580C" }; // Sold: Orange 600
                        if (C === 4) ws[cell_ref].s.font.color = { rgb: "047857" }; // Stock: Emerald 700
                        if (C === 5) ws[cell_ref].s.font.color = { rgb: "1D4ED8" }; // Value: Blue 700
                    }
                }

                // Total Row Style
                if (R === range.e.r) {
                    ws[cell_ref].s.font = { bold: true };
                    ws[cell_ref].s.fill = { fgColor: { rgb: "F1F5F9" } }; // Slate 100
                    ws[cell_ref].s.border.top = { style: "medium", color: { rgb: "CBD5E1" } };

                    // Apply colors to Totals as well
                    if (C === 2) ws[cell_ref].s.font.color = { rgb: "1E40AF" };
                    if (C === 3) ws[cell_ref].s.font.color = { rgb: "EA580C" };
                    if (C === 4) ws[cell_ref].s.font.color = { rgb: "047857" };
                    if (C === 5) ws[cell_ref].s.font.color = { rgb: "1D4ED8" };
                }
            }
        }

        // Adjust Column Widths
        const cols = [
            { wch: 8 },  // Sr No
            { wch: 30 }, // Item Name
            { wch: 15 }, // Purchase
            { wch: 15 }, // Sold
            { wch: 15 }  // Stock
        ];
        if (canViewRates) cols.push({ wch: 15 }); // Stock Value

        ws['!cols'] = cols;

        XLSX.utils.book_append_sheet(wb, ws, "Item Summary");
        XLSX.writeFile(wb, getFilename("Item_Summary"));
        setShowExportMenu(false);
    };

    const exportToPDF = () => {
        const doc = new jsPDF();
        doc.text("Item Summary Report", 14, 15);
        doc.setFontSize(10);
        doc.text(getPeriodText(), 14, 22);

        const tableColumn = ["Sr No", "Item Name", "Total Purchase", "Total Sold", "In Stock"];
        if (canViewRates) tableColumn.push("Value");

        const tableRows = [];

        items.forEach((item, index) => {
            const purchase = parseFloat(item.totalQty) || 0;
            const stock = parseFloat(item.currentStock !== undefined ? item.currentStock : item.activeStock) || 0;
            // Sold = Real Sales (soldQty) if available
            const remainingBatch = parseFloat(item.activeStock) || 0;
            const sold = item.soldQty !== undefined ? parseFloat(item.soldQty) : (purchase - remainingBatch);

            const itemData = [
                index + 1,
                item.itemName,
                purchase > 0 ? purchase.toLocaleString() : '-',
                sold > 0 ? sold.toLocaleString() : '-',
                stock > 0 ? stock.toLocaleString() : '-'
            ];
            if (canViewRates) itemData.push(item.stockValue > 0 ? item.stockValue.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }) : '-');

            tableRows.push(itemData);
        });

        // Add Total Row
        const footerRow = ['', 'TOTAL', grandTotalPurchase.toLocaleString(), grandTotalSold.toLocaleString(), grandTotalStock.toLocaleString()];
        if (canViewRates) footerRow.push(grandTotalStockValue.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }));

        tableRows.push(footerRow);

        autoTable(doc, {
            head: [tableColumn],
            body: tableRows,
            startY: 30,
            headStyles: { fillColor: [66, 66, 66] },
            footStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: 'bold' },
            columnStyles: {
                2: { textColor: [30, 64, 175], fontStyle: 'bold', halign: 'right' }, // Purchase: Blue
                3: { textColor: [234, 88, 12], fontStyle: 'bold', halign: 'right' }, // Sold: Orange
                4: { textColor: [4, 120, 87], fontStyle: 'bold', halign: 'right' },  // Stock: Green
                5: { textColor: [29, 78, 216], fontStyle: 'bold', halign: 'right' }  // Value: Blue
            },
            // Align "Sr No" and "Item Name" if needed, usually 'left' is default
            didParseCell: function (data) {
                // Apply specific styling to the Footer Row (last row) if columnStyles doesn't cover it automatically
                if (data.row.index === tableRows.length - 1) {
                    data.cell.styles.fontStyle = 'bold';
                }
            }
        });

        doc.save(getFilename("Item_Summary").replace('.xlsx', '.pdf'));
        setShowExportMenu(false);
    };

    const handleFixStock = async (itemName) => {
        if (!itemName) return;
        if (!window.confirm(`Attempt to fix stock for ${itemName}? This will reset stock to original purchase quantity if no sales exist.`)) return;

        try {
            setLoading(true);
            await api.post('/fix-stock-emergency', null, { params: { name: itemName } });
            alert('Fix process ran. Please check if stock is corrected.');
            fetchData();
        } catch (e) {
            alert('Error: ' + (e.response?.data?.message || e.message));
        } finally {
            setLoading(false);
        }
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
                    <div className="p-3 bg-blue-50 text-blue-600 rounded-xl hidden md:block">
                        <FileText size={24} />
                    </div>
                    <div>
                        <h1 className="text-xl font-black text-slate-800 tracking-tight">Summary Report</h1>
                        <div className="flex items-center gap-2 text-slate-500 text-xs font-medium mt-0.5">
                            <span className="bg-slate-100 px-2 py-0.5 rounded text-slate-600 border border-slate-200">Daily Matrix</span>
                            <span>•</span>
                            <span>Stock & Sales Analysis</span>
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
                                    ? 'bg-white text-blue-600 shadow-sm ring-1 ring-black/5'
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
                                    className="w-full pl-10 pr-8 py-2 bg-white border border-slate-200 rounded-lg text-sm font-semibold text-slate-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all shadow-sm hover:border-blue-300"
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
                                    className="w-full pl-10 pr-8 py-2 bg-white border border-slate-200 rounded-lg text-sm font-semibold text-slate-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all shadow-sm hover:border-blue-300"
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
                            <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-2 py-1.5 shadow-sm hover:border-blue-300 transition-colors">
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
                    <div className="flex items-center gap-2 w-full md:w-auto">
                        <button
                            onClick={() => setIsModalOpen(true)}
                            className="flex-1 md:flex-none items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 active:translate-y-0.5 text-sm font-bold shadow-sm hover:shadow-md transition-all whitespace-nowrap"
                        >
                            <Plus size={16} strokeWidth={3} />
                            <span>Item</span>
                        </button>

                        <div className="relative">
                            <button
                                onClick={() => setShowExportMenu(!showExportMenu)}
                                className={`flex items-center justify-center gap-2 px-4 py-2 border border-slate-200 rounded-lg text-sm font-bold shadow-sm transition-all whitespace-nowrap ${showExportMenu ? 'bg-slate-100 text-slate-800' : 'bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-800'}`}
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
                                        onClick={exportToExcel}
                                        className="w-full text-left px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:text-green-700 flex items-center gap-3 transition-colors"
                                    >
                                        <FileText size={16} className="text-green-600" /> Excel Sheet
                                    </button>
                                    <button
                                        onClick={exportToPDF}
                                        className="w-full text-left px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:text-red-700 flex items-center gap-3 transition-colors border-t border-slate-50"
                                    >
                                        <FileText size={16} className="text-red-500" /> PDF Document
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            <div className="glass-card overflow-hidden border border-slate-200 rounded-xl shadow-sm bg-white mt-4">
                <div className="overflow-x-auto max-h-[600px] scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-transparent">
                    <table className="min-w-full text-sm text-left border-collapse">
                        <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-20 shadow-sm">
                            <tr>
                                <th className="px-4 py-4 w-12 bg-slate-50"></th>
                                <th className="px-6 py-4 font-semibold text-slate-600 w-16 bg-slate-50 text-center">SR. No</th>
                                <th className="px-6 py-4 font-semibold text-slate-600 bg-slate-50 text-left">Item Name</th>
                                <th className="px-6 py-4 font-semibold text-slate-700 text-right bg-slate-50 min-w-[100px]">Total Purchase</th>
                                <th className="px-6 py-4 font-semibold text-orange-600 text-right bg-slate-50 min-w-[100px]">Total Sold</th>
                                <th className="px-6 py-4 font-semibold text-emerald-700 text-right bg-slate-50 min-w-[100px]">In Stock (In-Hand)</th>
                                {canViewRates && <th className="px-6 py-4 font-semibold text-blue-700 text-right bg-slate-50 min-w-[100px]">Stock Value (₹)</th>}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                            {items.length === 0 ? (
                                <tr><td colSpan={6} className="px-6 py-8 text-center text-slate-500">No items found</td></tr>
                            ) : (
                                items.map((item, idx) => {
                                    // Use Real Sales (soldQty) if available, else fallback
                                    const soldQty = item.soldQty !== undefined ? parseFloat(item.soldQty) : ((parseFloat(item.totalQty) || 0) - (parseFloat(item.activeStock) || 0));
                                    const isSelected = selectedItems.has(item.itemName);

                                    return (
                                        <React.Fragment key={idx}>
                                            <tr
                                                className={`hover:bg-slate-50 transition-colors group cursor-pointer ${selectedItem && (selectedItem._id === item._id) ? 'bg-blue-50/50' : ''} ${isSelected ? 'bg-blue-50/30' : ''}`}
                                                onClick={(e) => {
                                                    // Prevent row click when clicking specific actions or checkbox
                                                    if (!e.target.closest('input[type="checkbox"]') && !e.target.closest('button')) {
                                                        handleItemClick(item);
                                                    }
                                                }}
                                            >
                                                <td className="px-4 py-3 text-center w-12 bg-white">
                                                    <input
                                                        type="checkbox"
                                                        checked={isSelected}
                                                        onChange={(e) => toggleSelection(item.itemName, e.target.checked)}
                                                        className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500 cursor-pointer"
                                                        onClick={(e) => e.stopPropagation()}
                                                    />
                                                </td>
                                                <td className="px-6 py-3 text-slate-500 font-mono text-xs text-center w-16">{idx + 1}</td>
                                                <td className="px-6 py-3 font-medium text-slate-800 text-left flex items-center justify-between">
                                                    {renamingItemId === (item._id || item.itemId || item.id) ? (
                                                        <div className="flex items-center gap-2 w-full" onClick={(e) => e.stopPropagation()}>
                                                            <input
                                                                type="text"
                                                                value={renamingName}
                                                                onChange={(e) => setRenamingName(e.target.value)}
                                                                className="border border-blue-400 rounded px-2 py-1 text-sm outline-none w-full"
                                                                autoFocus
                                                            />
                                                            <button onClick={(e) => handleSaveRename(item, e)} className="text-green-600 hover:bg-green-100 p-1 rounded">
                                                                <Save size={16} />
                                                            </button>
                                                            <button onClick={handleCancelRename} className="text-red-500 hover:bg-red-100 p-1 rounded">
                                                                <XCircle size={16} />
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <>
                                                            <div className="flex items-center gap-2">
                                                                {item.itemName}
                                                            </div>
                                                            <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                <button
                                                                    onClick={(e) => handleStartRename(item, e)}
                                                                    className="text-slate-400 hover:text-blue-600 p-1 rounded hover:bg-blue-50 transition-colors"
                                                                    title="Rename Item"
                                                                >
                                                                    <Edit2 size={16} />
                                                                </button>
                                                                <button
                                                                    onClick={(e) => handleDeleteClick(item, e)}
                                                                    className="text-slate-400 hover:text-red-600 p-1 rounded hover:bg-red-50 transition-colors"
                                                                    title="Delete Item"
                                                                >
                                                                    <Trash2 size={16} />
                                                                </button>
                                                                <span className="text-blue-600 ml-1">
                                                                    <Eye size={16} />
                                                                </span>
                                                            </div>
                                                        </>
                                                    )}
                                                </td>
                                                <td className="px-6 py-3 text-right text-blue-800 font-bold">
                                                    {item.totalQty > 0 ? parseFloat(item.totalQty).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-'}
                                                </td>
                                                <td className="px-6 py-3 text-right text-orange-600 font-bold font-mono">
                                                    {soldQty > 0.001 ? soldQty.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-'}
                                                </td>
                                                <td className="px-6 py-3 text-right text-emerald-700 font-bold font-mono bg-emerald-50/30">
                                                    {(item.currentStock !== undefined ? item.currentStock : item.activeStock) > 0 ? parseFloat(item.currentStock !== undefined ? item.currentStock : item.activeStock).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-'}
                                                </td>
                                                {canViewRates && (
                                                    <td className="px-6 py-3 text-right text-blue-700 font-bold font-mono">
                                                        {(item.currentStockValue !== undefined ? item.currentStockValue : item.stockValue) > 0 ? parseFloat(item.currentStockValue !== undefined ? item.currentStockValue : item.stockValue).toLocaleString('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0, maximumFractionDigits: 0 }) : '-'}
                                                    </td>
                                                )}
                                            </tr>
                                        </React.Fragment>
                                    );
                                })
                            )}
                        </tbody>
                        <tfoot className="bg-slate-100 font-bold sticky bottom-0 z-30 shadow-[0_-2px_5px_-2px_rgba(0,0,0,0.1)]">
                            <tr>
                                <td className="px-6 py-4"></td>
                                <td className="px-6 py-4"></td>
                                <td className="px-6 py-4 text-slate-800 text-left">TOTAL</td>
                                <td className="px-6 py-4 text-right text-blue-800">
                                    {grandTotalPurchase.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </td>
                                <td className="px-6 py-4 text-right text-orange-700">
                                    {grandTotalSold.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </td>
                                <td className="px-6 py-4 text-right text-emerald-800">
                                    {grandTotalStock.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </td>
                                {canViewRates && (
                                    <td className="px-6 py-4 text-right text-blue-800">
                                        {grandTotalStockValue.toLocaleString('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                    </td>
                                )}
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>

            {/* Floating Action Button for Sale Creation */}
            {
                selectedItems.size > 0 && (
                    <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-5 fade-in duration-300">
                        <button
                            onClick={handleCreateSale}
                            className="bg-slate-900 text-white px-8 py-4 rounded-full shadow-2xl hover:bg-slate-800 hover:scale-105 active:scale-95 transition-all flex items-center gap-3 font-bold border-4 border-white ring-4 ring-slate-900/10"
                        >
                            <span className="bg-blue-600 text-[10px] px-2 py-0.5 rounded-full min-w-[24px] text-center">
                                {selectedItems.size}
                            </span>
                            <span>Create Sale Invoice</span>
                            <ChevronDown className="rotate-[-90deg]" size={18} />
                        </button>
                    </div>
                )
            }

            {/* Modal Logic (kept same but simplified for brevity in replacement) */}
            {
                isModalOpen && (
                    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                        <div className="glass-card rounded-xl shadow-xl w-full max-w-md bg-white p-6 animate-in zoom-in-95 duration-200">
                            <h3 className="text-lg font-bold mb-4">Add New Item</h3>
                            <form onSubmit={handleAddItem} className="space-y-4">
                                <input type="text" placeholder="Item Name" value={newItemData.name} onChange={e => setNewItemData({ ...newItemData, name: e.target.value })} className="w-full border p-2 rounded" required />
                                <input type="number" placeholder="Default Rate" value={newItemData.defaultRate} onChange={e => setNewItemData({ ...newItemData, defaultRate: e.target.value })} className="w-full border p-2 rounded" />
                                <div className="flex justify-end gap-2">
                                    <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 border rounded">Cancel</button>
                                    <button type="submit" disabled={isSubmitting} className="px-4 py-2 bg-blue-600 text-white rounded">Add</button>
                                </div>
                            </form>
                        </div>
                    </div>
                )
            }

            {/* Breakdown Modal */}
            {
                isBreakdownModalOpen && (
                    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4 font-sans">
                        <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[85vh]">
                            {/* Header */}
                            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                                <div>
                                    <h3 className="text-xl font-bold text-slate-800">{selectedItem?.itemName}</h3>
                                    <p className="text-xs text-slate-500 mt-0.5">Container Breakdown</p>
                                </div>
                                <button
                                    onClick={() => setIsBreakdownModalOpen(false)}
                                    className="text-slate-400 hover:text-red-500 hover:bg-slate-100 rounded-full p-2 transition-colors"
                                >
                                    <X size={20} />
                                </button>
                            </div>

                            {/* Content */}
                            <div className="flex-1 overflow-auto p-0">
                                {loadingBreakdown ? (
                                    <div className="flex justify-center items-center h-48">
                                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                                    </div>
                                ) : (
                                    <table className="w-full text-sm text-left">
                                        <thead className="bg-slate-50 text-xs text-slate-500 uppercase sticky top-0 z-10 shadow-sm">
                                            <tr>
                                                <th className="px-6 py-3 font-semibold">Container No</th>
                                                <th className="px-6 py-3 font-semibold">Date</th>
                                                <th className="px-6 py-3 font-semibold">Firm</th>

                                                <th className="px-6 py-3 font-semibold text-right">Actual %</th>
                                                <th className="px-6 py-3 font-semibold text-right">Expected %</th>
                                                <th className="px-6 py-3 font-semibold text-right">Qty (kg)</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {breakdownData.length === 0 ? (
                                                <tr>
                                                    <td colSpan={4} className="px-6 py-8 text-center text-slate-400">
                                                        No breakdown data found for this period.
                                                    </td>
                                                </tr>
                                            ) : (
                                                breakdownData.map((row, i) => (
                                                    <tr key={i} className="hover:bg-blue-50/50 transition-colors">
                                                        <td className="px-6 py-3 font-medium text-slate-700">
                                                            {row.containerNo || row.Container?.containerNo || row.container?.containerNo || <span className="text-slate-400 italic text-xs">{(row.containerId || '').slice(0, 8)}...</span>}
                                                        </td>
                                                        <td className="px-6 py-3 text-slate-500">
                                                            {formatDate(row.date || row.unloadDate || row.Container?.date || row.container?.date || row.Container?.unloadDate)}
                                                        </td>
                                                        <td className="px-6 py-3 text-slate-600">
                                                            {row.firm || row.Container?.firm || row.container?.firmName || row.Container?.firmName || row.container?.firm || '-'}
                                                        </td>
                                                        <td className="px-6 py-3 text-right font-mono text-xs text-slate-500">
                                                            {(() => {
                                                                const qty = parseFloat(row.quantity || row.netWeight) || 0;
                                                                // Actual % uses Assortment Weight (Sum of items)
                                                                const totalAssortment = parseFloat(row.Container?.assortmentWeight || row.container?.assortmentWeight) || 0;
                                                                // Fallback to containerWeight if assortment is missing/zero (though ideally they differ)
                                                                const denominator = totalAssortment > 0 ? totalAssortment : (parseFloat(row.Container?.containerWeight || row.container?.containerWeight) || 0);

                                                                return denominator > 0 ? ((qty / denominator) * 100).toFixed(2) + '%' : '-';
                                                            })()}
                                                        </td>
                                                        <td className="px-6 py-3 text-right font-mono text-xs text-amber-600">
                                                            {(() => {
                                                                const qty = parseFloat(row.quantity || row.netWeight) || 0;
                                                                // Expected % uses Container Weight (Purchase Weight)
                                                                const totalContainer = parseFloat(row.Container?.containerWeight || row.container?.containerWeight) || 0;
                                                                return totalContainer > 0 ? ((qty / totalContainer) * 100).toFixed(2) + '%' : '-';
                                                            })()}
                                                        </td>
                                                        <td className="px-6 py-3 text-right font-bold text-slate-700 min-w-[150px]">
                                                            {editingItemId === row.id ? (
                                                                <div className="flex items-center justify-end gap-2">
                                                                    <input
                                                                        type="number"
                                                                        value={editQty}
                                                                        onChange={(e) => setEditQty(e.target.value)}
                                                                        className="w-20 border rounded px-1 py-0.5 text-sm text-right focus:ring-2 focus:ring-blue-500 outline-none"
                                                                        autoFocus
                                                                    />
                                                                    <button onClick={() => handleSaveEdit(row.id)} className="text-green-600 hover:bg-green-50 p-1 rounded">
                                                                        <Save size={16} />
                                                                    </button>
                                                                    <button onClick={handleCancelEdit} className="text-red-500 hover:bg-red-50 p-1 rounded">
                                                                        <XCircle size={16} />
                                                                    </button>
                                                                </div>
                                                            ) : (
                                                                <div className="flex items-center justify-end gap-2 group/edit">
                                                                    <span className="font-mono">
                                                                        {parseFloat(row.quantity || row.netWeight).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                                                    </span>
                                                                    <button
                                                                        onClick={() => handleEditClick(row)}
                                                                        className="text-slate-300 hover:text-blue-600 transition-colors ml-2"
                                                                        title="Edit Quantity"
                                                                    >
                                                                        <Edit2 size={16} />
                                                                    </button>
                                                                </div>
                                                            )}
                                                        </td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                        {breakdownData.length > 0 && (
                                            <tfoot className="bg-slate-50 sticky bottom-0 border-t border-slate-200">
                                                <tr>
                                                    <td colSpan={5} className="px-6 py-3 text-right font-bold text-slate-600 uppercase text-xs">Total</td>
                                                    <td className="px-6 py-3 text-right font-bold text-blue-600 text-base">
                                                        {breakdownData.reduce((sum, row) => sum + (parseFloat(row.quantity || row.netWeight) || 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                                    </td>
                                                </tr>
                                            </tfoot>
                                        )}
                                    </table>
                                )}
                            </div>

                            {/* Footer with Professional Aggregated Totals */}
                            <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex flex-col sm:flex-row justify-end items-center gap-4">
                                <div className="flex flex-wrap items-center justify-end gap-3 order-2 sm:order-1">
                                    {Object.entries(breakdownData.reduce((acc, row) => {
                                        const no = row.containerNo || row.Container?.containerNo || row.container?.containerNo || 'Unknown';
                                        const qty = parseFloat(row.quantity || row.netWeight) || 0;
                                        acc[no] = (acc[no] || 0) + qty;
                                        return acc;
                                    }, {})).sort((a, b) => String(a[0]).localeCompare(String(b[0]), undefined, { numeric: true })).map(([no, qty]) => (
                                        <div key={no} className="flex items-center gap-3 px-3 py-2 rounded-xl bg-white border border-slate-200 shadow-sm">
                                            <span className="bg-slate-200 text-slate-800 border border-slate-300 px-2.5 py-1 rounded-lg text-[11px] font-bold tracking-wide">
                                                #{no}
                                            </span>
                                            <span className="font-mono font-bold text-blue-600 text-sm">
                                                {qty.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                                <div className="h-6 w-px bg-slate-300 hidden sm:block order-last sm:order-2 mx-2"></div>
                                <button
                                    onClick={() => setIsBreakdownModalOpen(false)}
                                    className="px-6 py-2 bg-slate-800 text-white text-sm font-medium rounded-lg hover:bg-slate-900 transition-all shadow-md hover:shadow-lg active:scale-95 order-1 sm:order-3 w-full sm:w-auto"
                                >
                                    Close
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }
            {/* Delete Confirmation Modal */}
            {
                isDeleteModalOpen && (
                    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[70] p-4 animate-in fade-in duration-200">
                        <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden animate-in scale-95 duration-200">
                            <div className="p-6 text-center">
                                <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4 text-red-600">
                                    <Trash2 size={24} />
                                </div>
                                <h3 className="text-lg font-bold text-slate-800 mb-2">Delete Item?</h3>
                                <p className="text-sm text-slate-500 mb-6">
                                    Are you sure you want to delete <span className="font-bold text-slate-900">"{itemToDelete?.itemName}"</span>? This action cannot be undone.
                                </p>
                                <div className="flex gap-3">
                                    <button
                                        onClick={() => setIsDeleteModalOpen(false)}
                                        className="flex-1 px-4 py-2 border border-slate-200 rounded-lg text-slate-600 font-bold hover:bg-slate-50 transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={confirmDelete}
                                        className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg font-bold hover:bg-red-700 shadow-md hover:shadow-lg transition-all"
                                    >
                                        Delete
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )
            }
        </div >
    );
};

export default ItemSummary;
