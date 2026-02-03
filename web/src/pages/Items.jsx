import React, { useState, useEffect } from 'react';
import { getItems, createItem, updateItem, deleteItem, updateItemsBatch } from '../services/api';

import { Package, Trash2, Search, Tag, Plus, X, Download, ChevronDown, FileText, Edit, Save, XCircle } from 'lucide-react';
import XLSX from 'xlsx-js-style';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import CategoryCombo from '../components/CategoryCombo';

const Items = () => {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [showExportMenu, setShowExportMenu] = useState(false);
    const [newItem, setNewItem] = useState({ name: '', defaultRate: '', category: 'General', hsnCode: '' });

    // Batch Edit State
    const [isEditing, setIsEditing] = useState(false);
    const [editedItems, setEditedItems] = useState([]); // Buffer for changes

    useEffect(() => {
        fetchItems();
    }, []);

    const fetchItems = async () => {
        try {
            const response = await getItems();
            setItems(response.data);
            setLoading(false);
        } catch (error) {
            console.error('Error fetching items:', error);
            setLoading(false);
        }
    };

    const handleCreateItem = async (e) => {
        e.preventDefault();
        try {
            const response = await createItem(newItem);
            setItems([...items, response.data]);
            setShowModal(false);
            setNewItem({ name: '', defaultRate: '', category: 'General', hsnCode: '' });
        } catch (error) {
            console.error('Error creating item:', error);
            alert(error.response?.data?.message || 'Failed to create item');
        }
    };

    const toggleEditMode = () => {
        if (isEditing) {
            // Cancel Editing
            setIsEditing(false);
            setEditedItems([]);
            fetchItems(); // Reset to server state
        } else {
            // Start Editing - load current items into buffer
            setEditedItems(JSON.parse(JSON.stringify(items)));
            setIsEditing(true);
        }
    };

    const handleBatchChange = (id, field, value) => {
        setEditedItems(prev => prev.map(item =>
            item._id === id ? { ...item, [field]: value } : item
        ));
    };

    const saveBatchUpdates = async () => {
        if (!window.confirm("Save all changes to Item Master?")) return;

        try {
            // Filter only changed items or send all? Sending all is safer for "Batch Update" if list isn't huge.
            // But optimal is only diffs. For simplicity and robustness, send all non-orphans.
            await updateItemsBatch(editedItems);

            // Update main state
            setItems(editedItems);
            setIsEditing(false);
            alert("All items updated successfully!");
        } catch (error) {
            console.error("Batch update failed:", error);
            alert("Failed to save changes.");
        }
    };

    // Single item handlers (Legacy/Direct mode) - only used when NOT in batch edit mode
    // We can keep them or disable them. Better to disable them in UI when isEditing is true.

    const handleDelete = async (id) => {
        if (window.confirm('Are you sure you want to delete this item?')) {
            try {
                await deleteItem(id);
                setItems(items.filter(item => item._id !== id));
            } catch (error) {
                console.error('Error deleting item:', error);
                alert('Failed to delete item');
            }
        }
    };

    const exportToExcel = () => {
        const wb = XLSX.utils.book_new();

        // 1. Prepare Header
        const headers = ["Sr No", "Item Name", "Category", "HSN Code", "Default Rate"];
        const dataRows = [];

        // 2. Prepare Data
        items.forEach((item, idx) => {
            dataRows.push([
                idx + 1,
                item.name,
                item.category,
                item.hsnCode || '-',
                parseFloat(item.defaultRate) || 0
            ]);
        });

        // 3. Create Sheet
        const ws = XLSX.utils.aoa_to_sheet([headers, ...dataRows]);

        // 4. Apply Styles
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
                        fill: { fgColor: { rgb: "2563EB" } }, // Blue 600
                        alignment: { horizontal: "center", vertical: "center" },
                        border: { bottom: { style: "medium", color: { rgb: "FFFFFF" } } }
                    };
                }

                // Numeric Alignment (Rate is last column)
                if (C === 4) {
                    ws[cell_ref].s.alignment.horizontal = "right";
                }
            }
        }

        // Adjust Column Widths
        ws['!cols'] = [
            { wch: 8 },  // Sr
            { wch: 30 }, // Item Name
            { wch: 15 }, // Category
            { wch: 15 }, // HSN
            { wch: 15 }  // Rate
        ];

        XLSX.utils.book_append_sheet(wb, ws, "Items List");
        XLSX.writeFile(wb, "Items_List.xlsx");
    };

    const exportToPDF = () => {
        const doc = new jsPDF();
        doc.text("Items Inventory Report", 14, 20);

        const tableColumn = ["Item Name", "Category", "HSN Code", "Default Rate"];
        const tableRows = [];

        items.forEach(item => {
            const itemData = [
                item.name,
                item.category,
                item.hsnCode || '-',
                item.defaultRate
            ];
            tableRows.push(itemData);
        });

        autoTable(doc, {
            head: [tableColumn],
            body: tableRows,
            startY: 30,
        });

        doc.save("Items_List.pdf");
    };

    const activeList = isEditing ? editedItems : items;

    const filteredItems = activeList.filter(item =>
        item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.category.toLowerCase().includes(searchTerm.toLowerCase())
    );

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
                        <Package size={24} />
                    </div>
                    <div>
                        <h1 className="text-xl font-black text-slate-800 tracking-tight">Item Management</h1>
                        <p className="text-slate-500 text-xs mt-0.5 font-medium">Manage inventory items and their default rates</p>
                    </div>
                </div>

                {/* Right Side Controls */}
                <div className="flex flex-col md:flex-row items-center gap-3 w-full xl:w-auto">

                    {/* Search */}
                    <div className="relative w-full md:w-auto">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                        <input
                            type="text"
                            placeholder="Search items..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full md:w-64 pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white transition-all shadow-sm focus:border-blue-500"
                        />
                    </div>

                    <div className="hidden md:block w-px h-8 bg-slate-200 mx-1"></div>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-2 w-full md:w-auto">

                        {isEditing ? (
                            <>
                                <button
                                    onClick={toggleEditMode}
                                    className="px-4 py-2 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 text-sm font-bold transition-all"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={saveBatchUpdates}
                                    className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm font-bold shadow-md shadow-emerald-200 transition-all animate-pulse"
                                >
                                    <Save size={16} />
                                    Save Changes
                                </button>
                            </>
                        ) : (
                            <>
                                <button
                                    onClick={toggleEditMode}
                                    className="flex items-center gap-2 px-3 py-2 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 text-sm font-bold transition-all"
                                >
                                    <Edit size={16} />
                                    <span className="hidden sm:inline">Edit Rates</span>
                                </button>

                                <div className="relative">
                                    <button
                                        onClick={() => setShowExportMenu(!showExportMenu)}
                                        className="flex items-center gap-2 px-3 py-2 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 text-sm font-bold transition-all"
                                    >
                                        <Download size={16} />
                                        <ChevronDown size={14} />
                                    </button>
                                    {showExportMenu && (
                                        <div className="absolute right-0 mt-2 w-32 bg-white rounded-lg shadow-xl border border-slate-100 py-1 z-50 animate-in fade-in zoom-in-95 duration-200 origin-top-right">
                                            <button
                                                onClick={() => { exportToExcel(); setShowExportMenu(false); }}
                                                className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2 transition-colors"
                                            >
                                                <FileText size={14} className="text-green-600" /> Excel
                                            </button>
                                            <button
                                                onClick={() => { exportToPDF(); setShowExportMenu(false); }}
                                                className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2 transition-colors"
                                            >
                                                <FileText size={14} className="text-red-600" /> PDF
                                            </button>
                                        </div>
                                    )}
                                </div>

                                <button
                                    onClick={() => setShowModal(true)}
                                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-bold shadow-md shadow-blue-200 transition-all whitespace-nowrap"
                                >
                                    <Plus size={18} />
                                    <span className="hidden sm:inline">Add Item</span>
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* Items List */}
            <div className="glass-card overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="min-w-full text-sm text-left">
                        <thead className="bg-slate-50 border-b border-slate-200">
                            <tr>
                                <th className="px-4 py-3 font-semibold text-slate-600">Item Name</th>
                                <th className="px-4 py-3 font-semibold text-slate-600">HSN Code</th>
                                <th className="px-4 py-3 font-semibold text-slate-600 w-40">Default Rate</th>
                                <th className="px-4 py-3 font-semibold text-slate-600">Category</th>
                                <th className="px-4 py-3 font-semibold text-slate-600 text-center w-24">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                            {filteredItems.length === 0 ? (
                                <tr>
                                    <td colSpan="5" className="px-6 py-12 text-center text-slate-500">
                                        <div className="flex flex-col items-center justify-center gap-2">
                                            <Package className="w-8 h-8 text-slate-400" />
                                            <p>No items found</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                filteredItems.map(item => (
                                    <tr key={item._id} className="hover:bg-slate-50 transition-colors group">
                                        <td className="px-4 py-2 font-medium text-slate-800">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100">
                                                    <Package size={16} />
                                                </div>
                                                {item.name}
                                            </div>
                                        </td>
                                        <td className="px-4 py-2">
                                            <input
                                                type="text"
                                                disabled={!isEditing}
                                                value={item.hsnCode || ''}
                                                onChange={(e) => handleBatchChange(item._id, 'hsnCode', e.target.value)}
                                                placeholder="-"
                                                className={`w-full px-2 py-1 rounded border transition-colors text-sm ${isEditing
                                                    ? 'border-blue-300 bg-white ring-1 ring-blue-100'
                                                    : 'border-transparent bg-transparent text-slate-600'
                                                    }`}
                                            />
                                        </td>
                                        <td className="px-4 py-2">
                                            <div className="relative">
                                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs">₹</span>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    disabled={!isEditing}
                                                    onKeyDown={(e) => e.key === '-' && e.preventDefault()}
                                                    value={item.defaultRate}
                                                    onChange={(e) => handleBatchChange(item._id, 'defaultRate', parseFloat(e.target.value) || 0)}
                                                    className={`w-full pl-6 pr-3 py-1 rounded border text-sm transition-colors ${isEditing
                                                        ? 'border-blue-300 bg-white ring-1 ring-blue-100'
                                                        : 'border-transparent bg-transparent text-slate-600'
                                                        }`}
                                                />
                                            </div>
                                        </td>
                                        <td className="px-4 py-2">
                                            {isEditing ? (
                                                <CategoryCombo
                                                    value={item.category}
                                                    onChange={(val) => handleBatchChange(item._id, 'category', val)}
                                                    label=""
                                                />
                                            ) : (
                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
                                                    <Tag size={12} />
                                                    {item.category}
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-4 py-2 text-center">
                                            {!isEditing && (
                                                <button
                                                    onClick={() => handleDelete(item._id)}
                                                    className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                                                    title="Delete Item"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Add Item Modal */}
            {showModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
                    <div className="glass-card w-full max-w-md animate-in fade-in zoom-in duration-200 border border-slate-200 bg-white shadow-xl">
                        <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
                            <h3 className="text-lg font-bold text-slate-800">Add New Item</h3>
                            <button
                                onClick={() => setShowModal(false)}
                                className="text-slate-400 hover:text-slate-600 transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <form onSubmit={handleCreateItem} className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Item Name *</label>
                                <input
                                    type="text"
                                    value={newItem.name}
                                    onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                                    className="block w-full px-3 py-2 glass-input rounded-lg focus:ring-blue-500 focus:border-blue-500 text-slate-800 placeholder-slate-400"
                                    placeholder="Enter item name"
                                    required
                                    autoFocus
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">HSN Code</label>
                                <input
                                    type="text"
                                    value={newItem.hsnCode}
                                    onChange={(e) => setNewItem({ ...newItem, hsnCode: e.target.value })}
                                    className="block w-full px-3 py-2 glass-input rounded-lg focus:ring-blue-500 focus:border-blue-500 text-slate-800 placeholder-slate-400"
                                    placeholder="Enter HSN Code"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Default Rate</label>
                                    <input
                                        type="number"
                                        value={newItem.defaultRate}
                                        onChange={(e) => setNewItem({ ...newItem, defaultRate: e.target.value })}
                                        className="block w-full px-3 py-2 glass-input rounded-lg focus:ring-blue-500 focus:border-blue-500 text-slate-800 placeholder-slate-400"
                                        placeholder="0.00"
                                        min="0"
                                    />
                                </div>
                                <div>
                                    <CategoryCombo
                                        value={newItem.category}
                                        onChange={(val) => setNewItem({ ...newItem, category: val })}
                                        label="Category"
                                    />
                                </div>
                            </div>

                            <div className="flex gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setShowModal(false)}
                                    className="flex-1 px-4 py-2 text-slate-600 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 font-medium transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="flex-1 px-4 py-2 text-white bg-blue-600 rounded-xl hover:bg-blue-700 font-medium transition-colors shadow-sm"
                                >
                                    Create Item
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Items;
