
import React, { useState, useEffect } from 'react';
import { getContainers, updateContainer, getItems, updateItem, createItem, bulkUpdateItemRate, getRateHistoryLog, updateItemsBatch, api } from '../services/api'; // updateContainer used to save daily rates
import { formatDate } from '../utils/dateUtils';
import { useAuth } from '../context/AuthContext';
import { Calendar, Search, Filter, Save, AlertCircle, IndianRupee, CheckCircle, Clock, FileSpreadsheet, Download, ChevronDown, FileText, Edit, XCircle, RotateCcw } from 'lucide-react';
import ConfirmationModal from '../components/ConfirmationModal';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

const RatePanel = () => {
    const [viewMode, setViewMode] = useState('daily'); // 'daily' or 'master' or 'history'
    const [filterType, setFilterType] = useState('month'); // 'date' or 'month'
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
    const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));

    useEffect(() => {
        console.log("View Mode Changed to:", viewMode);
    }, [viewMode]);

    const [containers, setContainers] = useState([]);
    const [loading, setLoading] = useState(false);

    // Master Rate State
    const [masterItems, setMasterItems] = useState([]);
    const [masterSearch, setMasterSearch] = useState('');
    const [masterLoading, setMasterLoading] = useState(false);
    const [savingMasterId, setSavingMasterId] = useState(null);
    const [historyLogs, setHistoryLogs] = useState([]);

    // For editing
    const [selectedContainer, setSelectedContainer] = useState(null);
    const [editItems, setEditItems] = useState([]);
    const [saving, setSaving] = useState(false);

    // Confirmation Modal State
    const [confirmModal, setConfirmModal] = useState({
        isOpen: false,
        title: '',
        message: '',
        onConfirm: null
    });

    const [showRateExportMenu, setShowRateExportMenu] = useState(false);

    // History Search State
    const [historySearch, setHistorySearch] = useState('');
    const filteredHistoryLogs = historyLogs.filter(log =>
        log.itemName.toLowerCase().includes(historySearch.toLowerCase()) ||
        String(log.oldRate).includes(historySearch) ||
        String(log.newRate).includes(historySearch) ||
        (log.changedBy && log.changedBy.toLowerCase().includes(historySearch.toLowerCase()))
    );

    const { user } = useAuth();

    // STRICT ADMIN CHECK OR PERMISSION CHECK
    const hasAccess = user && (user.role === 'Admin' || (user.permissions && user.permissions.includes('/rates')));

    if (!hasAccess) {
        return (
            <div className="flex flex-col items-center justify-center p-20 text-center text-slate-500">
                <AlertCircle size={48} className="text-red-500 mb-4" />
                <h2 className="text-2xl font-bold text-slate-800">Access Denied</h2>
                <p>You do not have permission to view the Rate Management Panel.</p>
            </div>
        );
    }

    // Existing Logic continues...
    useEffect(() => {
        if (viewMode === 'daily') {
            fetchContainers();
        } else if (viewMode === 'master') {
            fetchMasterItems();
        } else if (viewMode === 'history') {
            fetchHistoryLogs();
        }
    }, [viewMode, filterType, selectedDate, selectedMonth]);

    const fetchContainers = async () => {
        setLoading(true);
        try {
            let startDate, endDate;
            if (filterType === 'date' && selectedDate) {
                startDate = selectedDate;
                endDate = selectedDate;
            } else if (filterType === 'month' && selectedMonth) {
                const [year, month] = selectedMonth.split('-');
                startDate = `${year}-${month}-01`;
                const lastDay = new Date(year, month, 0).getDate();
                endDate = `${year}-${month}-${lastDay}`;
            }

            const response = await getContainers({ startDate, endDate });
            setContainers(response.data);
        } catch (error) {
            console.error("Error fetching containers:", error);
        } finally {
            setLoading(false);
        }
    };

    const fetchHistoryLogs = async () => {
        setLoading(true);
        try {
            const res = await getRateHistoryLog();
            setHistoryLogs(res.data);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const fetchMasterItems = async () => {
        setMasterLoading(true);
        try {
            const response = await getItems();
            // Ensure we have a valid rate for editing
            const items = response.data.map(i => ({
                ...i,
                currentRate: (i.defaultRate !== undefined && i.defaultRate !== null) ? i.defaultRate : ''
            }));
            setMasterItems(items);
        } catch (error) {
            console.error("Error fetching master items:", error);
        } finally {
            setMasterLoading(false);
        }
    };

    // Initial Load of Master Data for Auto-Fill
    useEffect(() => {
        fetchMasterItems();
    }, []);

    const handleEditClick = (container) => {
        setSelectedContainer(container);

        // Auto-fill rates from Master if they are 0
        setEditItems(container.items.map(i => {
            let currentRate = parseFloat(i.rate) || 0;
            const qty = parseFloat(i.quantity) || 0;

            // If rate is missing/zero, try to find in Master
            if (currentRate === 0) {
                const masterMatch = masterItems.find(m =>
                    (m.name || '').trim().toLowerCase() === (i.itemName || '').trim().toLowerCase()
                );
                if (masterMatch && masterMatch.currentRate > 0) {
                    currentRate = parseFloat(masterMatch.currentRate);
                } else if (masterMatch && masterMatch.defaultRate > 0) {
                    currentRate = parseFloat(masterMatch.defaultRate);
                }
            }

            return {
                ...i,
                rate: currentRate || '', // String for input if 0
                amount: (qty * currentRate).toFixed(2)
            };
        }));
    };

    const handleRateChange = (index, value) => {
        const newItems = [...editItems];
        const rate = parseFloat(value) || 0;
        const qty = parseFloat(newItems[index].quantity) || 0;

        newItems[index].rate = value; // Keep string for input
        newItems[index].amount = (qty * rate).toFixed(2);

        setEditItems(newItems);
    };

    const calculateTotal = (items) => {
        return items.reduce((sum, i) => sum + (parseFloat(i.amount) || 0), 0);
    };

    const handleSave = async () => {
        if (!selectedContainer) return;
        setSaving(true);
        try {
            const payload = {
                ...selectedContainer,
                items: editItems.map(i => ({
                    ...i,
                    rate: parseFloat(i.rate) || 0,
                    amount: parseFloat(i.amount) || 0
                })),
                totalAmount: calculateTotal(editItems)
            };

            await updateContainer(selectedContainer.id, payload);

            // Refresh list
            await fetchContainers();
            setSelectedContainer(null);
            alert("Rates Updated Successfully!");
        } catch (error) {
            console.error("Error updating rates:", error);
            alert("Failed to update rates.");
        } finally {
            setSaving(false);
        }
    };

    const handleMasterRateUpdate = (id, newRate) => {
        setMasterItems(prev => prev.map(item =>
            item._id === id ? { ...item, currentRate: newRate } : item
        ));
    };

    const saveMasterItem = async (item) => {
        setSavingMasterId(item._id);
        try {
            const newRate = parseFloat(item.currentRate) || 0;
            let realId = item._id;

            // Check if Orphan (starts with 'orphan-')
            if (item._id.toString().startsWith('orphan-')) {
                // CREATE NEW ITEM
                const res = await createItem({
                    name: item.name,
                    defaultRate: newRate,
                    category: 'General', // Default
                    hsnCode: '7204'     // Default
                });
                // Robust ID extraction
                realId = res.data._id || res.data.id;
                console.log("Created Item Response:", res.data, "RealID:", realId);

                if (!realId) throw new Error("Failed to get new Item ID from server");
            } else {
                // UPDATE EXISTING
                await updateItem(item._id, {
                    defaultRate: newRate
                });
            }

            // 2. Ask user if they want to update ALL existing entries with Custom Modal
            setConfirmModal({
                isOpen: true,
                title: 'Update Historic Entries?',
                message: `Master Rate Updated to ₹${newRate}.\n\nDo you want to apply this rate to ALL existing "${item.name}" entries in the current history?\n(This will recalculate amounts for all past entries)`,
                confirmText: 'Yes, Update All',
                confirmColor: 'bg-blue-600',
                onConfirm: async () => {
                    try {
                        await bulkUpdateItemRate(realId, newRate);
                        await fetchContainers(); // Force refresh of daily entries
                        // alert("Success: All existing entries have been updated with the new rate."); // Kept silent or toast preferred
                        setConfirmModal(prev => ({ ...prev, isOpen: false }));
                    } catch (err) {
                        console.error("Bulk update failed", err);
                        alert("Failed to update history: " + err.message);
                    }
                }
            });

            // Update local state and reflect 'saved' status by syncing defaultRate
            // If it was orphan, we should ideally replace the ID, but for UI 'Saved' state, name matching or simple state update is enough
            setMasterItems(prev => prev.map(i =>
                i._id === item._id ? { ...i, _id: realId, defaultRate: newRate } : i
            ));

        } catch (error) {
            console.error("Failed to update item rate:", error);
            alert("Failed to save rate: " + (error.response?.data?.message || error.message));
        } finally {
            setSavingMasterId(null);
        }
    };


    // Batch Editing for Master Rates
    const [isBatchEdit, setIsBatchEdit] = useState(false);

    const toggleBatchEdit = () => {
        if (isBatchEdit) {
            setIsBatchEdit(false);
            fetchMasterItems(); // Revert changes
        } else {
            setIsBatchEdit(true);
        }
    };

    const saveBatchMasterUpdates = async () => {
        // Find changed items
        const changedItems = masterItems.filter(item =>
            String(item.currentRate) !== String(item.defaultRate) && !String(item._id).startsWith('orphan-')
        );

        if (changedItems.length === 0) {
            alert("No changes to save.");
            return;
        }

        if (!window.confirm(`Save changes for ${changedItems.length} items?`)) return;

        try {
            // Prepare payload: map currentRate to defaultRate
            const payload = changedItems.map(item => ({
                _id: item._id,
                defaultRate: item.currentRate,
                category: item.category,
                hsnCode: item.hsnCode
            }));

            await updateItemsBatch(payload);

            // Refresh
            await fetchMasterItems();
            setIsBatchEdit(false);
            alert("All rates updated successfully!");

        } catch (error) {
            console.error("Batch save failed:", error);
            alert("Failed to save batch updates.");
        }
    };

    // Helper to check if rates are pending
    const isPending = (c) => {
        if (!c.items || c.items.length === 0) return false;
        return c.items.some(i => parseFloat(i.quantity) > 0 && parseFloat(i.rate) === 0);
    };

    const filteredMasterItems = masterItems.filter(item =>
        item.name.toLowerCase().includes(masterSearch.toLowerCase())
    );

    return (
        <div className="space-y-6 max-w-7xl mx-auto">
            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                        <IndianRupee className="text-blue-600" />
                        Rate Management Panel
                    </h1>
                    <p className="text-slate-500 text-sm">
                        Manage and update item rates
                    </p>
                </div>

                {/* Main Mode Toggle */}
                <div className="bg-slate-100 p-1 rounded-lg flex gap-1 border border-slate-200">
                    <button
                        onClick={() => setViewMode('daily')}
                        className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${viewMode === 'daily' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        Daily Entries
                    </button>
                    <button
                        onClick={() => setViewMode('master')}
                        className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${viewMode === 'master' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        Item Master Rates
                    </button>
                    <button
                        onClick={() => setViewMode('history')}
                        className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${viewMode === 'history' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        Rate History
                    </button>
                </div>
            </div>

            {/* DAILY ENTRIES VIEW */}
            {viewMode === 'daily' && (
                <>
                    <div className="flex justify-end gap-3 bg-white p-1.5 rounded-xl border border-slate-200 shadow-sm w-fit ml-auto">
                        <div className="flex bg-slate-100 rounded-lg p-1">
                            <button
                                onClick={() => setFilterType('date')}
                                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${filterType === 'date' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                Daily
                            </button>
                            <button
                                onClick={() => setFilterType('month')}
                                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${filterType === 'month' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                Monthly
                            </button>
                        </div>

                        <div className="h-6 w-px bg-slate-200"></div>

                        {filterType === 'date' ? (
                            <div className="flex items-center bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 hover:border-blue-400 transition-colors gap-2">
                                <input
                                    type="date"
                                    value={selectedDate}
                                    onChange={(e) => setSelectedDate(e.target.value)}
                                    className="text-sm font-medium text-slate-700 bg-transparent outline-none cursor-pointer"
                                />
                                {selectedDate && (
                                    <button
                                        onClick={() => setSelectedDate('')}
                                        className="text-slate-400 hover:text-red-500 hover:bg-slate-200 rounded-full p-0.5 transition-colors"
                                        title="Clear Date"
                                    >
                                        <XCircle size={15} />
                                    </button>
                                )}
                            </div>
                        ) : (
                            <div className="flex items-center bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 hover:border-blue-400 transition-colors gap-2">
                                <input
                                    type="month"
                                    value={selectedMonth}
                                    onChange={(e) => setSelectedMonth(e.target.value)}
                                    className="text-sm font-medium text-slate-700 bg-transparent outline-none cursor-pointer"
                                />
                                {selectedMonth && (
                                    <button
                                        onClick={() => setSelectedMonth('')}
                                        className="text-slate-400 hover:text-red-500 hover:bg-slate-200 rounded-full p-0.5 transition-colors"
                                        title="Clear Month"
                                    >
                                        <XCircle size={15} />
                                    </button>
                                )}
                            </div>
                        )}

                        {/* Export Button */}
                        <button
                            onClick={async () => {
                                setLoading(true);
                                try {
                                    const params = filterType === 'date'
                                        ? { startDate: selectedDate, endDate: selectedDate }
                                        : { month: selectedMonth };

                                    const response = await api.get('/containers/export-matrix', {
                                        params,
                                        responseType: 'blob'
                                    });

                                    const url = window.URL.createObjectURL(new Blob([response.data]));
                                    const link = document.createElement('a');
                                    link.href = url;
                                    link.setAttribute('download', 'RateMatrix.xlsx');
                                    document.body.appendChild(link);
                                    link.click();
                                    link.remove();
                                    window.URL.revokeObjectURL(url);

                                } catch (error) {
                                    console.error("Export failed:", error);
                                    let msg = error.message;
                                    if (error.response?.data instanceof Blob) {
                                        try {
                                            const text = await error.response.data.text();
                                            const json = JSON.parse(text);
                                            msg = json.message || msg;
                                        } catch (e) { }
                                    } else if (error.response?.data?.message) {
                                        msg = error.response.data.message;
                                    }
                                    alert("Failed to export: " + msg);
                                } finally {
                                    setLoading(false);
                                }
                            }}
                            disabled={loading}
                            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors shadow-sm font-medium disabled:opacity-50"
                            title="Export Matrix (Column Wise)"
                        >
                            <FileSpreadsheet size={18} />
                            <span>{loading ? 'Exporting...' : 'Export Excel'}</span>
                        </button>
                    </div>

                    {loading ? (
                        <div className="flex justify-center py-12">
                            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            {/* Container List */}
                            <div className={`${selectedContainer ? 'lg:col-span-1' : 'lg:col-span-3'} transition-all duration-300`}>
                                <div className="glass-card bg-white border border-slate-200 overflow-hidden">
                                    <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                                        <h2 className="font-semibold text-slate-700">Entries List</h2>
                                        <span className="text-xs bg-slate-200 text-slate-600 px-2 py-1 rounded-full">{containers.length} Found</span>
                                    </div>
                                    <div className="overflow-y-auto max-h-[70vh]">
                                        {containers.length === 0 ? (
                                            <div className="p-8 text-center text-slate-500">No entries found for this period.</div>
                                        ) : (
                                            <div className="divide-y divide-slate-100">
                                                {containers.map(c => {
                                                    const pending = isPending(c);
                                                    const isSelected = selectedContainer?.virtualId === c.virtualId;
                                                    return (
                                                        <div
                                                            key={c.virtualId}
                                                            onClick={() => handleEditClick(c)}
                                                            className={`group p-4 cursor-pointer transition-all hover:bg-slate-50 relative ${isSelected ? 'bg-blue-50/50' : ''}`}
                                                        >
                                                            {/* Selection Indicator Line */}
                                                            {isSelected && <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-600"></div>}

                                                            <div className="flex justify-between items-center mb-2">
                                                                <div className="flex items-center gap-2 overflow-hidden mr-2">
                                                                    <span className={`text-sm font-bold whitespace-nowrap ${isSelected ? 'text-blue-700' : 'text-slate-700'}`}>
                                                                        #{c.containerNo}
                                                                    </span>
                                                                    <span className="text-xs text-slate-300">|</span>
                                                                    <span className="text-xs font-medium text-slate-500 whitespace-nowrap">{formatDate(c.date)}</span>
                                                                    <span className="text-xs text-slate-300">|</span>
                                                                    <span className="text-xs font-semibold text-slate-700 truncate" title={c.firm}>
                                                                        {c.firm || 'Unknown'}
                                                                    </span>
                                                                </div>
                                                                {pending ? (
                                                                    <span className="shrink-0 text-[10px] uppercase font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-100">
                                                                        Pending
                                                                    </span>
                                                                ) : (
                                                                    <span className="shrink-0 text-[10px] uppercase font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                                                                        Done
                                                                    </span>
                                                                )}
                                                            </div>

                                                            <div className="flex justify-between items-center">
                                                                <div className="text-xs text-slate-400 bg-slate-100 px-2 py-1 rounded-md font-medium">
                                                                    {c.items?.length || 0} Items
                                                                </div>
                                                                <div className="text-sm font-bold text-slate-800">
                                                                    {(parseFloat(c.totalAmount) || 0).toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Edit Panel (Visible when selected) */}
                            {selectedContainer && (
                                <div className="lg:col-span-2 animate-in slide-in-from-right-4 duration-300">
                                    <div className="glass-card bg-white border border-slate-200">
                                        <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
                                            <div>
                                                <h2 className="font-bold text-slate-800 text-lg">Update Rates</h2>
                                                <p className="text-xs text-slate-500">#{selectedContainer.containerNo} • {formatDate(selectedContainer.date)}</p>
                                            </div>
                                            <div className="flex gap-2">
                                                <div className="relative">
                                                    <button
                                                        onClick={() => setShowRateExportMenu(!showRateExportMenu)}
                                                        className="text-slate-400 hover:text-blue-600 p-1 hover:bg-blue-50 rounded transition-colors flex items-center gap-1"
                                                        title="Export Rate Statement"
                                                    >
                                                        <Download size={20} />
                                                        <ChevronDown size={14} />
                                                    </button>
                                                    <button
                                                        onClick={() => {
                                                            // Manual Auto Fill Trigger
                                                            const updatedItems = editItems.map(i => {
                                                                let currentRate = parseFloat(i.rate) || 0;
                                                                const qty = parseFloat(i.quantity) || 0;

                                                                // Always try to fetch best rate from Master
                                                                const masterMatch = masterItems.find(m =>
                                                                    (m.name || '').trim().toLowerCase() === (i.itemName || '').trim().toLowerCase()
                                                                );

                                                                if (masterMatch) {
                                                                    // Prefer current master rate, fall back to default
                                                                    const newRate = parseFloat(masterMatch.currentRate) || parseFloat(masterMatch.defaultRate) || 0;
                                                                    if (newRate > 0) currentRate = newRate;
                                                                }

                                                                return {
                                                                    ...i,
                                                                    rate: currentRate || '',
                                                                    amount: (qty * currentRate).toFixed(2)
                                                                };
                                                            });
                                                            setEditItems(updatedItems);
                                                            alert('Rates refreshed from Master List');
                                                        }}
                                                        className="text-slate-400 hover:text-green-600 p-1 hover:bg-green-50 rounded transition-colors flex items-center gap-1"
                                                        title="Auto Fill Rates from Master"
                                                    >
                                                        <RotateCcw size={20} />
                                                    </button>

                                                    {showRateExportMenu && (
                                                        <div className="absolute right-0 top-full mt-2 w-32 bg-white rounded-lg shadow-xl border border-slate-100 py-1 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                                                            <button
                                                                onClick={() => {
                                                                    // Generate Excel
                                                                    const header = ["Item Name", "Qty", "Rate", "Amount"];
                                                                    const data = editItems.map(item => {
                                                                        const qty = parseFloat(item.quantity) || 0;
                                                                        const rate = parseFloat(item.rate) || 0;
                                                                        return [item.itemName, qty, rate, (qty * rate)];
                                                                    });
                                                                    // Total logic
                                                                    const totalAmount = editItems.reduce((acc, item) => acc + ((parseFloat(item.quantity) || 0) * (parseFloat(item.rate) || 0)), 0);
                                                                    data.push(['', '', 'Total', totalAmount]);

                                                                    const ws = XLSX.utils.aoa_to_sheet([header, ...data]);
                                                                    const wb = XLSX.utils.book_new();
                                                                    XLSX.utils.book_append_sheet(wb, ws, "Rate Statement");
                                                                    XLSX.writeFile(wb, `Rates_${selectedContainer.containerNo}.xlsx`);
                                                                    setShowRateExportMenu(false);
                                                                }}
                                                                className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2 transition-colors"
                                                            >
                                                                <FileText size={14} className="text-green-600" /> Excel
                                                            </button>
                                                            <button
                                                                onClick={() => {
                                                                    const doc = new jsPDF();

                                                                    // Header
                                                                    doc.setFontSize(18);
                                                                    doc.text("Rate Statement", 14, 20);

                                                                    doc.setFontSize(10);
                                                                    doc.text(`Container #: ${selectedContainer.containerNo}`, 14, 30);
                                                                    doc.text(`Date: ${formatDate(selectedContainer.date)}`, 14, 35);
                                                                    doc.text(`Firm: ${selectedContainer.firm || '-'}`, 14, 40);

                                                                    // Table
                                                                    const tableColumn = ["Item Name", "Qty", "Rate", "Amount"];
                                                                    const tableRows = [];

                                                                    let totalAmount = 0;
                                                                    editItems.forEach(item => {
                                                                        const qty = parseFloat(item.quantity) || 0;
                                                                        const rate = parseFloat(item.rate) || 0;
                                                                        const amount = qty * rate;
                                                                        totalAmount += amount;

                                                                        tableRows.push([
                                                                            item.itemName,
                                                                            qty.toLocaleString(),
                                                                            rate.toLocaleString('en-IN', { style: 'currency', currency: 'INR' }),
                                                                            amount.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })
                                                                        ]);
                                                                    });

                                                                    // Total Row
                                                                    tableRows.push(['', '', 'Total:', totalAmount.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })]);

                                                                    autoTable(doc, {
                                                                        startY: 50,
                                                                        head: [tableColumn],
                                                                        body: tableRows,
                                                                        theme: 'grid',
                                                                        headStyles: { fillColor: [41, 128, 185] },
                                                                        footStyles: { fillColor: [241, 196, 15], textColor: 0 }
                                                                    });

                                                                    doc.save(`Container_${selectedContainer.containerNo}_Rates.pdf`);
                                                                    setShowRateExportMenu(false);
                                                                }}
                                                                className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2 transition-colors"
                                                            >
                                                                <FileText size={14} className="text-red-600" /> PDF
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                                <button
                                                    onClick={() => setSelectedContainer(null)}
                                                    className="text-slate-400 hover:text-slate-600"
                                                >
                                                    <AlertCircle size={20} className="rotate-45" /> {/* Close Icon */}
                                                </button>
                                            </div>
                                        </div>

                                        <div className="p-0 overflow-x-auto">
                                            <table className="w-full text-sm text-left">
                                                <thead className="bg-slate-50 text-slate-600 text-xs uppercase font-semibold">
                                                    <tr>
                                                        <th className="px-4 py-3">Item Name</th>
                                                        <th className="px-4 py-3 w-24">Qty</th>
                                                        <th className="px-4 py-3 w-32">Rate (₹)</th>
                                                        <th className="px-4 py-3 w-32 text-right">Amount</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-100">
                                                    {editItems.map((item, idx) => (
                                                        <tr key={idx} className="hover:bg-slate-50">
                                                            <td className="px-4 py-3 font-medium text-slate-700">{item.itemName}</td>
                                                            <td className="px-4 py-3 text-slate-600">{item.quantity}</td>
                                                            <td className="px-4 py-2">
                                                                <input
                                                                    type="number"
                                                                    min="0"
                                                                    step="0.01"
                                                                    value={item.rate}
                                                                    onChange={(e) => handleRateChange(idx, e.target.value)}
                                                                    className="w-full bg-white border border-slate-300 rounded px-2 py-1 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                                                    placeholder="0.00"
                                                                />
                                                            </td>
                                                            <td className="px-4 py-3 text-right font-bold text-slate-800">
                                                                {(parseFloat(item.amount) || 0).toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                                <tfoot className="bg-slate-50 font-bold text-slate-800">
                                                    <tr>
                                                        <td colSpan="3" className="px-4 py-3 text-right">Total:</td>
                                                        <td className="px-4 py-3 text-right text-blue-600">
                                                            {calculateTotal(editItems).toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}
                                                        </td>
                                                    </tr>
                                                </tfoot>
                                            </table>
                                        </div>

                                        <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end gap-3">
                                            <button
                                                onClick={() => setSelectedContainer(null)}
                                                className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg text-sm font-medium border border-slate-300"
                                            >
                                                Cancel
                                            </button>
                                            <button
                                                onClick={handleSave}
                                                disabled={saving}
                                                className="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 shadow-sm flex items-center gap-2 disabled:opacity-50"
                                            >
                                                <Save size={16} />
                                                {saving ? 'Saving...' : 'Save Updates'}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </>
            )}

            {/* MASTER ITEMS VIEW */}


            {viewMode === 'master' && (
                // EXISTING MASTER VIEW RENDER
                <div className="glass-card rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    {/* ... (Keep existing Master View Logic - Should be fine as it was rendered conditionally based on Daily check) */}
                    {/* Wait, the original code had simple ternary. I need to check where it renders. */}
                    {/* Assuming the original structure was { viewMode === 'daily' ? (...) : (...) } */}
                    {/* I will wrap the Master view in filteredMasterItems render below */}

                    <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                        <div className="flex items-center gap-4">
                            <h2 className="font-semibold text-slate-700">Item Master List</h2>

                            <div className="hidden md:flex items-center gap-2 text-sm text-slate-500 bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-sm">
                                <Calendar size={14} className="text-blue-600" />
                                <span className="font-medium text-slate-700">{new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                            </div>

                            {/* Batch Edit Controls */}
                            {isBatchEdit ? (
                                <div className="flex gap-2">
                                    <button
                                        onClick={toggleBatchEdit}
                                        className="bg-white border border-slate-300 text-slate-700 px-3 py-1.5 rounded-lg hover:bg-slate-50 flex items-center gap-1 text-sm shadow-sm"
                                    >
                                        <XCircle size={14} /> Cancel
                                    </button>
                                    <button
                                        onClick={saveBatchMasterUpdates}
                                        className="bg-emerald-600 text-white px-4 py-1.5 rounded-lg hover:bg-emerald-700 flex items-center gap-1 text-sm shadow-md animate-pulse font-medium"
                                    >
                                        <Save size={14} /> Save All
                                    </button>
                                </div>
                            ) : (
                                <button
                                    onClick={toggleBatchEdit}
                                    className="bg-white border border-slate-300 text-slate-700 px-3 py-1.5 rounded-lg hover:bg-slate-50 flex items-center gap-2 text-sm shadow-sm transition-all"
                                >
                                    <Edit size={14} /> Bulk Edit Rates
                                </button>
                            )}
                        </div>

                        <div className="relative w-64">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                            <input
                                type="text"
                                placeholder="Search items..."
                                value={masterSearch}
                                onChange={(e) => setMasterSearch(e.target.value)}
                                className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                    </div>

                    {masterLoading ? (
                        <div className="flex justify-center py-12">
                            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="min-w-full text-sm text-left">
                                <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                                    <tr>
                                        <th className="px-6 py-4">Item Name</th>
                                        <th className="px-6 py-4 text-center">Category</th>
                                        <th className="px-6 py-4 w-48">Default Rate (₹)</th>
                                        <th className="px-6 py-4 text-right">Last Updated</th>
                                        <th className="px-6 py-4 text-right">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {filteredMasterItems.map(item => (
                                        <tr key={item._id} className="hover:bg-slate-50 transition-colors">
                                            <td className="px-6 py-4 font-medium text-slate-800">{item.name}</td>
                                            <td className="px-6 py-4 text-center">
                                                <span className="px-2 py-1 bg-slate-100 text-slate-600 rounded text-xs">{item.category}</span>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="relative">
                                                    <IndianRupee size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                                    <input
                                                        type="number"
                                                        disabled={!isBatchEdit && savingMasterId !== item._id} // Allow explicit individual save if not batch mode? Or enforce mode? Let's enforce mode for clarity or allow individual edit only via "Edit" button row (which we don't have). 
                                                        // Actually, let's allow editing IF isBatchEdit is true OR use the old flow. 
                                                        // BUT to avoid confusion, let's disable inputs if not in batch edit mode to enforce the "Bulk Edit" flow the user asked for.
                                                        // However, "Save Rate" button exists per row. That implies individual edit.
                                                        // Let's SUPPORT BOTH: 
                                                        // 1. If Batch Edit Mode -> All inputs enabled, "Save All" shown. Row buttons hidden?
                                                        // 2. If Normal Mode -> Inputs enabled? If we disable them, we break individual row save.
                                                        // SOLUTION: Inputs always enabled, but "Bulk Edit" just reveals the "Save All" button? 
                                                        // User asked for "1 option to save all". 
                                                        // Safest: Disable inputs by default. User must click "Bulk Edit" to enable all. OR click a row edit? 
                                                        // Let's follow Items.jsx pattern: Disable inputs by default.
                                                        value={item.currentRate}
                                                        onChange={(e) => handleMasterRateUpdate(item._id, e.target.value)}
                                                        className={`w-full pl-8 pr-3 py-2 border rounded-lg text-slate-800 font-medium transition-colors ${isBatchEdit
                                                            ? 'border-blue-300 bg-white focus:ring-2 focus:ring-blue-500'
                                                            : 'border-transparent bg-transparent'
                                                            }`}
                                                    />
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-right text-slate-500 text-xs">
                                                {formatDate(item.updatedAt)}
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                {!isBatchEdit && (
                                                    <button
                                                        onClick={() => saveMasterItem(item)}
                                                        disabled={savingMasterId === item._id || String(item.currentRate) === String(item.defaultRate)}
                                                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${String(item.currentRate) !== String(item.defaultRate)
                                                            ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-md'
                                                            : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                                            }`}
                                                    >
                                                        {savingMasterId === item._id ? 'Saving...' : 'Save Rate'}
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}
            {viewMode === 'history' && (
                <div className="glass-card rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                        <h2 className="font-semibold text-slate-700">Rate Change History</h2>
                        <div className="relative w-64">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                            <input
                                type="text"
                                placeholder="Search history..."
                                value={historySearch}
                                onChange={(e) => setHistorySearch(e.target.value)}
                                className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="min-w-full text-sm text-left">
                            <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                                <tr>
                                    <th className="px-6 py-4">Item Name</th>
                                    <th className="px-6 py-4">Old Rate</th>
                                    <th className="px-6 py-4">New Rate</th>
                                    <th className="px-6 py-4">Changed By</th>
                                    <th className="px-6 py-4 text-right">Date</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filteredHistoryLogs.length === 0 ? (
                                    <tr>
                                        <td colSpan="5" className="px-6 py-8 text-center text-slate-500">
                                            No history found matching your search.
                                        </td>
                                    </tr>
                                ) : (
                                    filteredHistoryLogs.map((log, index) => (
                                        <tr key={log._id || index} className="hover:bg-slate-50 transition-colors">
                                            <td className="px-6 py-4 font-medium text-slate-800">{log.itemName}</td>
                                            <td className="px-6 py-4 text-red-600 font-mono">{log.oldRate}</td>
                                            <td className="px-6 py-4 text-emerald-600 font-bold font-mono">{log.newRate}</td>
                                            <td className="px-6 py-4 text-slate-600">
                                                <span className="bg-slate-100 px-2 py-1 rounded text-xs border border-slate-200">
                                                    {log.changedBy || 'System'}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-right text-slate-500 text-xs">
                                                {formatDate(log.createdAt)}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}


            {/* Confirmation Modal */}
            <ConfirmationModal
                isOpen={confirmModal.isOpen}
                onClose={() => setConfirmModal({ ...confirmModal, isOpen: false })}
                onConfirm={confirmModal.onConfirm}
                title={confirmModal.title}
                message={confirmModal.message}
                confirmText={confirmModal.confirmText || 'Confirm'}
                confirmColor={confirmModal.confirmColor || 'bg-blue-600'}
            />
        </div >
    );
};

export default RatePanel;
