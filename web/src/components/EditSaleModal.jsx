/* eslint-disable react/prop-types */
import React, { useState, useEffect } from 'react';
import { X, Save, Trash2, RefreshCw } from 'lucide-react';
import { updateSale, deleteSale, getAvailableContainers, getUniqueValues } from '../services/api';
import StringCombo from './StringCombo';
import CustomDatePicker from './CustomDatePicker';

const EditSaleModal = ({ sale, isOpen, onClose, onSuccess, items = [] }) => {
    const [formData, setFormData] = useState({});
    const [allocations, setAllocations] = useState({});
    const [availableStock, setAvailableStock] = useState([]);
    const [loading, setLoading] = useState(false);
    const [stockLoading, setStockLoading] = useState(false);
    const [initialAllocations, setInitialAllocations] = useState({}); // Stores Original Alloc (ContainerItemId -> Qty)

    useEffect(() => {
        if (sale && isOpen) {
            // Match format for StringCombo
            let initialName = sale.itemName;
            const itemObj = items.find(i => i.name === sale.itemName);
            if (itemObj) {
                initialName = `${itemObj.name} — Avl: ${(parseFloat(itemObj.currentStock) || 0).toFixed(2)}`;
            }

            setFormData({
                ...sale,
                quantity: sale.quantity ? parseFloat(sale.quantity).toFixed(2) : '',
                rate: sale.rate ? parseFloat(sale.rate).toFixed(2) : '',
                itemName: initialName,
                date: sale.date ? sale.date.split('T')[0] : new Date().toISOString().split('T')[0],
            });

            const initAlloc = {};
            sale.allocations?.forEach(a => {
                initAlloc[a.containerItemId] = parseFloat(a.quantity || 0).toFixed(2);
            });
            setInitialAllocations(initAlloc);

            if (itemObj) fetchStock(itemObj._id || itemObj.itemId, initAlloc);
        }
    }, [sale, isOpen, items]);

    const fetchStock = async (itemId, currentAllocMap = initialAllocations) => {
        setStockLoading(true);
        try {
            const includeIds = Object.keys(currentAllocMap);
            const res = await getAvailableContainers(itemId, { includeIds });
            const dbStock = res.data; // Raw items

            // 1. Adjust DB Stock with Current Allocation (Add back what we hold)
            // But first, we need to identify WHICH items in DB match our held items.
            // If item exists in DB, we increase its remainingQty.
            // If item does NOT exist in DB (e.g. was empty), we need to reconstruct it?
            // Actually, if we hold it, it implies it was valid.
            // Ideally backend returns it. If not, we can't allocate to it easily unless we fake it.
            // V1 Assumption: DB returns valid items.

            // Map Raw Items -> Adjusted Items
            let adjustedItems = dbStock.map(c => {
                const held = currentAllocMap[c.id] || 0;
                return {
                    ...c,
                    remainingQuantity: parseFloat(c.remainingQuantity) + parseFloat(held)
                };
            });

            // 2. Group by ContainerNo
            const groups = {};
            adjustedItems.forEach(item => {
                const no = item.Container?.containerNo || 'Unknown';
                if (!groups[no]) {
                    groups[no] = {
                        id: `GROUP_${no}`, // Virtual ID
                        containerNo: no,
                        remainingQuantity: 0,
                        subItems: []
                    };
                }
                groups[no].remainingQuantity += parseFloat(item.remainingQuantity);
                groups[no].subItems.push(item);
            });

            const groupList = Object.values(groups);

            // Sort Groups by ContainerNo
            groupList.sort((a, b) => {
                const na = parseFloat(a.containerNo);
                const nb = parseFloat(b.containerNo);
                if (!isNaN(na) && !isNaN(nb)) return na - nb;
                return a.containerNo.localeCompare(b.containerNo);
            });

            // Sort subItems by ID
            groupList.forEach(g => g.subItems.sort((a, b) => (a.id > b.id ? 1 : -1)));

            setAvailableStock(groupList);

            // 3. Initialize Visual Allocations for these Groups
            // Sum all held items corresponding to this group
            const visualAlloc = {};
            groupList.forEach(group => {
                let groupHeld = 0;
                group.subItems.forEach(sub => {
                    groupHeld += parseFloat(currentAllocMap[sub.id] || 0);
                });
                if (groupHeld > 0) visualAlloc[group.id] = parseFloat(groupHeld.toFixed(2));
            });
            setAllocations(visualAlloc);

        } catch (err) {
            console.error(err);
        } finally {
            setStockLoading(false);
        }
    };

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(p => ({ ...p, [name]: value }));

        if (name === 'itemName') {
            setAllocations({});
            const itemObj = items.find(i => i.name === value);
            if (itemObj) {
                setFormData(p => ({ ...p, hsnCode: itemObj.hsnCode || '7204' }));
                fetchStock(itemObj._id || itemObj.itemId, {});
            } else {
                setAvailableStock([]);
            }
        }
    };

    // Auto Allocate helper
    const handleAutoAllocate = () => {
        const qty = parseFloat(formData.quantity) || 0;
        const newAlloc = {};
        let remaining = qty;

        availableStock.forEach(group => {
            if (remaining > 0) {
                const avail = parseFloat(group.remainingQuantity);
                const take = Math.min(remaining, avail);
                if (take > 0.001) {
                    // Fix precision for display
                    const cleanTake = parseFloat(take.toFixed(2));
                    newAlloc[group.id] = cleanTake;
                    remaining = parseFloat((remaining - cleanTake).toFixed(2));
                }
            }
        });
        setAllocations(newAlloc);
    };

    const handleSave = async () => {
        const totalAllocated = Object.values(allocations).reduce((sum, q) => sum + (parseFloat(q) || 0), 0);
        const reqQty = parseFloat(formData.quantity);

        let finalAllocations = { ...allocations };

        if (Math.abs(totalAllocated - reqQty) > 0.05) {

            // Smart Logic 1: Detect "Swap" intention
            // If user added NEW containers that exactly match the Required Qty, they likely want to Swap.
            const newKeys = Object.keys(allocations).filter(k => !initialAllocations[k]);
            const newTotal = newKeys.reduce((sum, k) => sum + (parseFloat(allocations[k]) || 0), 0);

            if (Math.abs(newTotal - reqQty) < 0.05 && newKeys.length > 0) {
                const confirmSwap = window.confirm(
                    `You selected new containers matching the Quantity (${reqQty}).\n\nClick OK to SWITCH to these new containers (removing old ones).\nClick Cancel to keep both (and fix manually).`
                );
                if (confirmSwap) {
                    const swappedAlloc = {};
                    newKeys.forEach(k => swappedAlloc[k] = allocations[k]);
                    setAllocations(swappedAlloc);
                    finalAllocations = swappedAlloc;
                    // Proceed to save with swappedAlloc
                } else {
                    return;
                }
            }
            // Smart Logic 2: Update Quantity
            else {
                const confirmUpdateQty = window.confirm(
                    `Allocated (${totalAllocated.toFixed(2)}) != Quantity (${reqQty}).\n\nClick OK to update 'Quantity' to ${totalAllocated.toFixed(2)} and Save.\nClick Cancel to adjust manually.`
                );
                if (confirmUpdateQty) {
                    setFormData(p => ({ ...p, quantity: totalAllocated }));
                    // Use standard allocations
                } else {
                    return;
                }
            }
        }
        setLoading(true);
        try {
            // Explode Groups back to Real IDs
            let finalSource = [];

            Object.entries(finalAllocations).forEach(([groupId, qty]) => {
                const val = parseFloat(qty);
                if (val <= 0) return;

                const group = availableStock.find(g => g.id === groupId);
                if (!group) return;

                let toAlloc = val;
                // Distribute FIFO
                for (const sub of group.subItems) {
                    if (toAlloc <= 0.0001) break;
                    const available = parseFloat(sub.remainingQuantity);
                    const take = Math.min(available, toAlloc);
                    if (take > 0.0001) {
                        finalSource.push({ containerItemId: sub.id, quantity: take });
                        toAlloc -= take;
                    }
                }
            });

            const payload = {
                ...formData,
                quantity: Math.abs(totalAllocated - parseFloat(formData.quantity)) > 0.05 && Object.keys(finalAllocations).length === Object.keys(allocations).length ? totalAllocated : formData.quantity, // Use updated qty if we agreed to update it
                itemName: formData.itemName?.split(' — Avl:')[0] || formData.itemName, // Clean Name
                sourceContainers: finalSource
            };

            await updateSale(sale.id || sale._id, payload);
            alert("Updated Successfully");
            onSuccess();
        } catch (error) {
            console.error(error);
            alert("Update Failed: " + (error.response?.data?.message || error.message));
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async () => {
        if (!window.confirm("Delete this entry? Stock will be restored.")) return;
        setLoading(true);
        try {
            await deleteSale(sale.id || sale._id);
            alert("Deleted");
            onSuccess();
        } catch (error) {
            console.error(error);
            alert("Delete failed");
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-4xl h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
                    <div>
                        <h2 className="text-xl font-bold text-slate-800">Edit Entry</h2>
                        <div className="text-xs text-slate-500 mt-1">Ref: {sale.id || sale._id}</div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors"><X /></button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <label className="block text-xs font-semibold text-slate-500 mb-1">Date</label>
                            <CustomDatePicker name="date" value={formData.date || ''} onChange={handleChange} />
                        </div>
                        <div>
                            <StringCombo label="Buyer Name" value={formData.buyerName || ''} onChange={v => setFormData(p => ({ ...p, buyerName: v }))} fetchOptions={p => getUniqueValues('buyerName', p.search)} />
                        </div>
                        <div>
                            <StringCombo label="Invoice No" value={formData.invoiceNo || ''} onChange={v => setFormData(p => ({ ...p, invoiceNo: v }))} fetchOptions={p => getUniqueValues('invoiceNo', p.search)} />
                        </div>
                    </div>

                    <div className="h-px bg-slate-100 my-2"></div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 mb-1">Item Name</label>
                                <StringCombo
                                    label="Item Name"
                                    value={formData.itemName || ''}
                                    onChange={(val) => {
                                        // Parse real name
                                        const realName = val.split(' — Avl:')[0];
                                        setFormData(p => ({ ...p, itemName: val })); // Keep full string for UI
                                        setAllocations({});

                                        const itemObj = items.find(i => i.name === realName);
                                        if (itemObj) {
                                            setFormData(p => ({ ...p, itemName: val, hsnCode: itemObj.hsnCode || '7204' }));
                                            fetchStock(itemObj._id || itemObj.itemId, {});
                                        } else {
                                            setAvailableStock([]);
                                        }
                                    }}
                                    fetchOptions={async (p) => {
                                        const search = (p.search || '').toLowerCase();
                                        const opts = items
                                            .map(i => `${i.name} — Avl: ${(parseFloat(i.currentStock) || 0).toFixed(2)}`)
                                            // Handle case where items might have null name? No.
                                            .filter(str => str.toLowerCase().includes(search));
                                        return { data: opts };
                                    }}
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-semibold text-slate-500 mb-1">Quantity</label>
                                    <div className="flex gap-2">
                                        <input type="number" name="quantity" value={formData.quantity || ''} onChange={handleChange} className="w-full p-2 border border-slate-300 rounded-lg text-sm font-bold text-slate-800" />
                                        <button onClick={handleAutoAllocate} className="bg-slate-100 border border-slate-300 px-2 rounded hover:bg-slate-200 text-xs text-slate-600" title="Auto Allocate">Auto</button>
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-slate-500 mb-1">Rate</label>
                                    <input type="number" name="rate" value={formData.rate || ''} onChange={handleChange} className="w-full p-2 border border-slate-300 rounded-lg text-sm font-bold text-slate-800" />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <StringCombo label="HSN" value={formData.hsnCode || ''} onChange={v => setFormData(p => ({ ...p, hsnCode: v }))} fetchOptions={p => getUniqueValues('hsnCode', p.search)} />
                                </div>
                                <div>
                                    <StringCombo label="Remarks" value={formData.remarks || ''} onChange={v => setFormData(p => ({ ...p, remarks: v }))} fetchOptions={p => getUniqueValues('remarks', p.search)} />
                                </div>
                            </div>
                        </div>

                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                            <div className="flex justify-between items-center mb-2">
                                <h3 className="text-sm font-bold text-slate-700">Stock Allocation</h3>
                                <div className="flex gap-1">
                                    <button onClick={() => setAllocations({})} className="p-1 hover:bg-slate-200 rounded" title="Clear All"><span className="text-xs text-red-500 font-bold">Clear</span></button>
                                    <button onClick={() => {
                                        const realName = formData.itemName?.split(' — Avl:')[0];
                                        const item = items.find(i => i.name === realName);
                                        if (item) fetchStock(item._id || item.itemId, initialAllocations);
                                    }}><RefreshCw size={14} /></button>
                                </div>
                            </div>
                            <div className="space-y-2 max-h-[250px] overflow-y-auto pr-2">
                                {availableStock.map(c => {
                                    // True Max already in c.remainingQuantity due to adjustment
                                    const maxLimit = c.remainingQuantity;

                                    return (
                                        <div key={c.id} className="flex items-center justify-between bg-white p-2 border border-slate-200 rounded-lg">
                                            <div>
                                                <div className="font-bold text-slate-800 text-xs">{c.containerNo}</div>
                                                <div className="text-[10px] text-slate-500">Avl: {maxLimit.toFixed(2)}</div>
                                            </div>
                                            <input
                                                type="number"
                                                value={allocations[c.id] || ''}
                                                onChange={e => {
                                                    const val = e.target.value;
                                                    setAllocations(p => ({ ...p, [c.id]: val }));
                                                }}
                                                className="w-20 text-right text-sm p-1 border border-slate-300 rounded focus:ring-2 focus:ring-blue-500"
                                                placeholder="0.00"
                                            />
                                        </div>
                                    );
                                })}
                                {availableStock.length === 0 && <div className="text-center text-xs text-slate-400 py-4">No Stock Available</div>}
                            </div>
                            <div className="mt-4 pt-2 border-t border-slate-200 flex justify-between items-center text-sm">
                                <span>Allocated:</span>
                                <span className={Math.abs(Object.values(allocations).reduce((sum, q) => sum + (parseFloat(q) || 0), 0) - parseFloat(formData.quantity || 0)) < 0.05 ? 'text-green-600 font-bold' : 'text-orange-600 font-bold'}>
                                    {Object.values(allocations).reduce((sum, q) => sum + (parseFloat(q) || 0), 0).toFixed(2)} / {parseFloat(formData.quantity || 0).toFixed(2)}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex justify-between items-center">
                    <button
                        onClick={handleDelete}
                        disabled={loading}
                        className="px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors"
                    >
                        <Trash2 size={16} /> Delete
                    </button>
                    <div className="flex gap-3">
                        <button onClick={onClose} className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded-lg text-sm font-medium">Cancel</button>
                        <button
                            onClick={handleSave}
                            disabled={loading}
                            className="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold shadow-md hover:bg-blue-700 flex items-center gap-2"
                        >
                            <Save size={16} /> {loading ? 'Saving...' : 'Update'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default EditSaleModal;
