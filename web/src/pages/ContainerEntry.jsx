import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getItems, createItem, createContainer, getContainerById, updateContainer, checkActiveContainer, getContainers } from '../services/api';
import { formatDate } from '../utils/dateUtils';
import ConfirmationModal from '../components/ConfirmationModal';
import FirmCombo from '../components/FirmCombo';
import { Plus, Search } from 'lucide-react';
import ScrapTypeCombo from '../components/ScrapTypeCombo';
import CustomDatePicker from '../components/CustomDatePicker';

import { useAuth } from '../context/AuthContext'; // Import Auth

const ContainerEntry = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth(); // Get User
    const isEditMode = !!id;

    // Permission Logic (STRICT ADMIN ONLY)
    const canViewRates = user?.role === 'Admin';

    const [entryMode, setEntryMode] = useState('existing'); // Default to Existing for daily speed
    const [activeContainers, setActiveContainers] = useState([]);
    const [suggestions, setSuggestions] = useState([]);
    const [isSuggestionsOpen, setIsSuggestionsOpen] = useState(false);

    const [formData, setFormData] = useState({
        containerNo: '',
        date: new Date().toISOString().split('T')[0],
        firm: '',
        firmId: null,
        worker: '',
        vehicleNo: '',
        containerWeight: '',
        lrNo: '',
        blNo: '',
        unloadDate: new Date().toISOString().split('T')[0],
        remarks: '',
        workerCount: '',
        assortmentWeight: ''
    });

    const [displayDate, setDisplayDate] = useState(''); // To show original date in Existing mode

    const [modalConfig, setModalConfig] = useState({
        isOpen: false,
        title: '',
        message: '',
        confirmText: '',
        confirmColor: '',
        showCancel: true,
        onConfirm: () => { }
    });

    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [newItemName, setNewItemName] = useState('');

    const [isAddingItem, setIsAddingItem] = useState(false);

    // Manual Search Input Ref for Shift+F shortcut
    const searchInputRef = React.useRef(null);

    // Shortcut Listener
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.shiftKey && (e.key === 'f' || e.key === 'F')) {
                e.preventDefault();
                searchInputRef.current?.focus();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    const initializeItems = (itemsData) => {
        // Deduplicate items based on name (or ID) to prevent React key warnings
        const uniqueItems = [];
        const seenNames = new Set();

        itemsData.forEach(item => {
            const normalized = (item.name || '').trim().toLowerCase();
            if (normalized && !seenNames.has(normalized)) {
                seenNames.add(normalized);
                uniqueItems.push(item);
            }
        });

        const initializedItems = uniqueItems.map(item => ({
            itemId: item._id || `temp-${item.name}`,
            itemName: item.name,
            defaultRate: item.defaultRate,
            quantity: '',
            rate: item.defaultRate || '',
            amount: 0
        }));

        setItems(initializedItems);
    };

    // Search & Suggestion Logic
    const [filteredSuggestions, setFilteredSuggestions] = useState([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [activeIndex, setActiveIndex] = useState(-1); // New State for navigation

    const handleSearchChange = (e) => {
        const value = e.target.value;
        setNewItemName(value);
        setActiveIndex(-1); // Reset index on type

        if (value.trim()) {
            const matches = items.filter(i =>
                i.itemName.toLowerCase().includes(value.toLowerCase())
            );
            setFilteredSuggestions(matches);
            setShowSuggestions(true);
        } else {
            setShowSuggestions(false);
        }
    };

    const selectSuggestion = (item, e) => {
        if (e) e.preventDefault();
        // Move item to top
        const index = items.findIndex(i => i.itemName.toLowerCase() === item.itemName.toLowerCase());
        if (index !== -1) {
            const newItems = [...items];
            const [existingItem] = newItems.splice(index, 1);
            setItems([existingItem, ...newItems]);
        }
        setNewItemName('');
        setShowSuggestions(false);
        // Focus the quantity input of the now-first item
        setTimeout(() => {
            const qtyInput = document.getElementById('quantity-0');
            if (qtyInput) qtyInput.focus();
        }, 50);
    };

    const handleAddItem = async (e) => {
        if (e) e.preventDefault();
        const name = newItemName.trim();
        if (!name) return;

        // 1. Check if ANY item roughly matches, if so, select it instead of creating new
        const existsLine = items.findIndex(i => i.itemName.toLowerCase() === name.toLowerCase());
        if (existsLine !== -1) {
            selectSuggestion(items[existsLine]);
            return;
        }

        setIsAddingItem(true);
        try {
            // 2. Create in Backend
            await createItem({ name: name, description: 'Quick added from Assortment' });

            // Update Cache
            const cachedItems = localStorage.getItem('items');
            if (cachedItems) {
                const parsed = JSON.parse(cachedItems);
                parsed.push({ name: name, defaultRate: 0, currentStock: 0 });
                localStorage.setItem('items', JSON.stringify(parsed));
            }
        } catch (err) {
            console.log('Item creation note:', err);
        }

        // 3. Add to UI
        const newItem = {
            itemId: `manual-${Date.now()}`,
            itemName: name,
            defaultRate: '',
            quantity: '',
            rate: '',
            amount: 0
        };

        setItems([newItem, ...items]);
        setNewItemName('');
        setIsAddingItem(false);
        setShowSuggestions(false);

        // Focus new item
        setTimeout(() => {
            const qtyInput = document.getElementById('quantity-0');
            if (qtyInput) qtyInput.focus();
        }, 50);
    };

    useEffect(() => {
        const init = async () => {
            setLoading(true);
            await fetchItems();

            if (isEditMode) {
                // If editing, logic depends on context. Usually edit specific entry.
                // We'll unlock full form for Edit.
                setEntryMode('new');
                await fetchContainerDetails();
            } else {
                // Fetch active containers for suggestions in Existing Mode
                await fetchActiveContainers();
            }
            setLoading(false);
        };
        init();
    }, [id]);

    // Added: Auto-Sync Assortment Weight with Total Items Quantity
    useEffect(() => {
        const totalQty = items.reduce((sum, item) => sum + (parseFloat(item.quantity) || 0), 0);
        setFormData(prev => {
            // Only update if value actually changes to prevent unnecessary renders/loops
            if (parseFloat(prev.assortmentWeight || 0) !== totalQty) {
                return { ...prev, assortmentWeight: totalQty.toFixed(2) };
            }
            return prev;
        });
    }, [items]);

    const fetchActiveContainers = async () => {
        try {
            // Fetch recent containers or all active masters
            // We use getContainers but maybe we need an optimized list endpoint?
            // Reusing getContainers which now returns virtual containers.
            // We want MASTERS. 
            // checkActiveContainer is one by one. getContainers is all.
            // Let's call getContainers without date range to get recent masters.
            const response = await getContainers({ limit: 100 });
            // Extract unique Container Numbers
            if (response.data && Array.isArray(response.data)) {
                const uniqueNos = [...new Set(response.data.map(c => c.containerNo))];
                setSuggestions(uniqueNos.sort());
            }
        } catch (error) {
            console.error("Error fetching active containers:", error);
        }
    };

    const fetchContainerDetails = async () => {
        try {
            const queryParams = new URLSearchParams(window.location.search);
            const dateParam = queryParams.get('date');
            const response = await getContainerById(id, { date: dateParam });
            const data = response.data;
            setFormData({
                containerNo: data.containerNo,
                date: data.date.split('T')[0],
                firm: data.firm,
                firmId: data.firmId || null,
                worker: data.worker,
                vehicleNo: data.vehicleNo,
                containerWeight: data.containerWeight,
                lrNo: data.lrNo ? (data.blNo ? `${data.lrNo} / ${data.blNo}` : data.lrNo) : (data.blNo || ''),
                blNo: '',
                // FIX: Use URL date param as specific unloadDate if editing a daily entry
                unloadDate: dateParam ? dateParam : (data.unloadDate ? data.unloadDate.split('T')[0] : ''),
                remarks: data.remarks
            });

            setItems(prevItems => {
                const newItems = [...prevItems];
                data.items.forEach(savedItem => {
                    // FIX: Fuzzy Match to handle whitespace/case mismatches ("Lead " vs "Lead")
                    const savedName = (savedItem.itemName || '').trim().toLowerCase();
                    const index = newItems.findIndex(i => (i.itemName || '').trim().toLowerCase() === savedName);

                    if (index !== -1) {
                        newItems[index] = {
                            ...newItems[index],
                            quantity: savedItem.quantity,
                            rate: savedItem.rate,
                            amount: savedItem.amount
                        };
                    }
                });
                return newItems;
            });

        } catch (error) {
            console.error('Error fetching container details:', error);
            alert('Failed to load container details');
        }
    };

    const fetchItems = async () => {
        try {
            const cachedItems = localStorage.getItem('items');
            if (cachedItems) {
                const parsedItems = JSON.parse(cachedItems);
                if (parsedItems.length > 0) {
                    initializeItems(parsedItems);
                }
            }

            const response = await getItems();
            if (response.data && response.data.length > 0) {
                localStorage.setItem('items', JSON.stringify(response.data));
                initializeItems(response.data);
            }
        } catch (error) {
            console.error('Error fetching items:', error);
        }
    };



    const fillContainerDetails = async (containerNo) => {
        if (!containerNo) return;

        try {
            const response = await checkActiveContainer(containerNo);
            if (response.data.exists && response.data.details) {
                const { details } = response.data;

                setFormData(prev => ({
                    ...prev,
                    containerNo: containerNo,
                    // Keep existing date or update? In existing mode, we hide it.
                    // But we store 'date' in state as the Original Trip Start Date.
                    date: details.date ? details.date.split('T')[0] : prev.date,
                    firm: details.firm || '',
                    firmId: details.firmId || null,
                    worker: details.worker || '',
                    vehicleNo: details.vehicleNo || '',
                    containerWeight: details.containerWeight || '',
                    assortmentWeight: details.assortmentWeight || '',
                    lrNo: details.lrNo || '',
                    blNo: details.blNo || '',
                    remarks: details.remarks || '',
                    // Unload Date is usually TODAY for new entry, so keep current value or default.
                    unloadDate: prev.unloadDate || new Date().toISOString().split('T')[0]
                }));

                setDisplayDate(details.date ? formatDate(details.date) : '');

                // Auto-fill Item Rates
                if (details.items && details.items.length > 0) {
                    setItems(prevItems => {
                        return prevItems.map(item => {
                            const prevItem = details.items.find(pi => pi.itemName === item.itemName);
                            if (prevItem) {
                                return {
                                    ...item,
                                    rate: prevItem.rate || item.rate,
                                };
                            }
                            return item;
                        });
                    });
                }
            }
        } catch (error) {
            console.error('Error auto-filling container:', error);
        }
    };

    const handleContainerNoChange = (e) => {
        const value = e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '');
        setFormData(prev => ({ ...prev, containerNo: value }));

        // If in existing mode, trigger auto-fill if it matches a valid suggestion exactly?
        // Or on blur? Blur is safer to avoid many API calls, but user wants speed.
        // Let's use datalist selection detection (usually tricky).
        // Check if value is in suggestions.
        if (entryMode === 'existing' && suggestions.includes(value)) {
            fillContainerDetails(value);
        }
    };

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        if (name === 'vehicleNo') {
            // Vehicle Formatting logic
            let raw = value.toUpperCase().replace(/[^A-Z0-9-]/g, '');
            if (raw.length > 10) raw = raw.substring(0, 10);
            let formatted = '';
            if (raw.length > 0) formatted += raw.substring(0, 2);
            if (raw.length > 2) formatted += '-' + raw.substring(2, 4);
            if (raw.length > 4) formatted += ' ' + raw.substring(4, 6);
            if (raw.length > 6) formatted += ' ' + raw.substring(6, 10);
            setFormData(prev => ({ ...prev, [name]: formatted }));
        } else {
            setFormData(prev => ({ ...prev, [name]: value }));
        }
    };

    const handleFirmChange = ({ name, id }) => {
        setFormData(prev => ({ ...prev, firm: name, firmId: id }));
    };

    const handleScrapTypeChange = ({ name }) => {
        setFormData(prev => ({ ...prev, remarks: name }));
    };

    const handleKeyDown = (e, index, field) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const nextField = field === 'quantity' && canViewRates ? 'rate' : 'quantity';
            const nextIndex = field === 'quantity' && canViewRates ? index : index + 1;

            const nextInput = document.getElementById(`${nextField}-${nextIndex}`);
            if (nextInput) {
                nextInput.focus();
                nextInput.select();
            }
        }
    };

    const handleItemChange = (index, field, value) => {
        const newItems = [...items];
        let sanitizedValue = value;
        if (field === 'quantity' || field === 'rate') {
            if (parseFloat(value) < 0) sanitizedValue = 0;
        }
        newItems[index][field] = sanitizedValue;

        if (field === 'quantity' || field === 'rate') {
            const qty = parseFloat(newItems[index].quantity) || 0;
            const rate = parseFloat(newItems[index].rate) || 0;
            newItems[index].amount = qty * rate;
        }
        setItems(newItems);
    };

    const calculateTotal = () => items.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0).toFixed(2);
    const calculateTotalQty = () => items.reduce((sum, item) => sum + (parseFloat(item.quantity) || 0), 0);

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (entryMode === 'existing') {
            // Check if backend data was filled
            if (!formData.firm) {
                // Try to fill it one last time in case they typed fast and clicked save
                await fillContainerDetails(formData.containerNo);

                // Re-check
                if (!formData.firm) {
                    alert("Please select a valid container number from the suggestions. Firm Name is missing!");
                    return;
                }
            }
        } else {
            // New Mode Validation
            if (!formData.firm) {
                alert('Please select a Firm');
                return;
            }
        }

        // Validate that at least one item has quantity entered
        const hasItems = items.some(item => {
            const qty = parseFloat(item.quantity);
            return !isNaN(qty) && qty > 0;
        });

        if (!hasItems) {
            alert('Please enter Quantity for at least one item.');
            return;
        }

        confirmSubmit();
    };

    const [isSubmitting, setIsSubmitting] = useState(false); // Add State

    // ... (rest of code)

    // ... (rest of code)

    const confirmSubmit = async () => {
        if (isSubmitting) return; // Prevent double click
        setIsSubmitting(true);

        try {
            // ... (existing logic)
            // Lines 311-395
            // Ensure try/catch/finally to reset state

            // Step 0: Ensure all items exist in Master Item List
            const currentMasterItems = await getItems();
            const existingNames = new Set(currentMasterItems.data.map(i => (i.name || '').trim().toLowerCase()));

            const namesToCreate = new Set();
            for (const item of items) {
                const normalizedName = (item.itemName || '').trim();
                const searchName = normalizedName.toLowerCase();

                if (normalizedName && !existingNames.has(searchName) && !namesToCreate.has(searchName)) {
                    namesToCreate.add(searchName);
                    try {
                        await createItem({ name: normalizedName, description: 'Auto-created from Entry' });
                        console.log(`Auto-created master item: ${normalizedName}`);
                    } catch (err) {
                        console.error(`Failed to auto-create item ${normalizedName}`, err);
                    }
                }
            }

            const sanitizedItems = items.map(item => ({
                ...item,
                itemName: (item.itemName || '').trim(),
                quantity: item.quantity === '' || isNaN(parseFloat(item.quantity)) ? 0 : parseFloat(item.quantity),
                rate: item.rate === '' || isNaN(parseFloat(item.rate)) ? 0 : parseFloat(item.rate),
                amount: item.amount === '' || isNaN(parseFloat(item.amount)) ? 0 : parseFloat(item.amount),
            }));

            const payload = {
                ...formData,
                containerWeight: formData.containerWeight === '' || isNaN(parseFloat(formData.containerWeight)) ? null : parseFloat(formData.containerWeight),
                items: sanitizedItems,
                totalAmount: calculateTotal()
            };

            if (isEditMode) {
                await updateContainer(id, payload);
                alert('Container Updated!');
                navigate('/containers');
            } else {
                await createContainer(payload);
                setModalConfig({
                    isOpen: true,
                    title: 'Success',
                    message: 'Entry Saved Successfully! ✅',
                    confirmText: 'OK',
                    confirmColor: 'bg-green-600 hover:bg-green-700',
                    showCancel: false,
                    onConfirm: () => {
                        setModalConfig({ ...modalConfig, isOpen: false });
                        setFormData({
                            containerNo: '',
                            date: new Date().toISOString().split('T')[0],
                            firm: '',
                            firmId: null,
                            worker: '',
                            vehicleNo: '',
                            containerWeight: '',
                            assortmentWeight: '',
                            lrNo: '',
                            blNo: '',
                            unloadDate: new Date().toISOString().split('T')[0],
                            remarks: ''
                        });
                        const resetItems = items.map(item => ({
                            ...item,
                            quantity: '',
                            rate: item.rate || '',
                            amount: 0
                        }));
                        setItems(resetItems);
                        if (entryMode === 'existing') fetchActiveContainers();
                    }
                });
            }
        } catch (error) {
            console.error('Error saving container:', error);
            alert(`Error: ${error.response?.data?.message || 'Failed to save'}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    // ...

    <button
        type="submit"
        disabled={isSubmitting} // Disable when submitting
        className={`px-8 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium shadow-sm transition-all ${isSubmitting ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
        {isSubmitting ? 'Saving...' : (isEditMode ? 'Update Entry' : 'Save Entry')}
    </button>

    const toggleMode = (mode) => {
        setEntryMode(mode);
        // Clear form when switching, except maybe date?
        setFormData(prev => ({
            ...prev,
            containerNo: '',
            firm: '',
            firmId: null,
            worker: '',
            vehicleNo: '',
            containerWeight: '',
            lrNo: '',
            blNo: '',
            remarks: '',
            unloadDate: new Date().toISOString().split('T')[0]
        }));
    };

    if (loading) {
        return (
            <div className="flex justify-center items-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    return (
        <div className="max-w-5xl mx-auto space-y-4">
            {/* Header Toolbar */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col xl:flex-row justify-between items-center gap-4 animate-in slide-in-from-top-2">

                {/* Title Section */}
                <div className="flex items-center gap-4 w-full xl:w-auto">
                    <div className="p-3 bg-purple-50 text-purple-600 rounded-xl hidden md:block">
                        <Plus size={24} />
                    </div>
                    <div>
                        <h1 className="text-xl font-black text-slate-800 tracking-tight">
                            {isEditMode ? 'Edit Container' : 'Assortment Entry'}
                        </h1>
                        <p className="text-slate-500 text-xs mt-0.5 font-medium">
                            {isEditMode ? 'Modify existing container details' : 'Record new daily assortment entries'}
                        </p>
                    </div>
                </div>

                {/* Right Side Controls */}
                <div className="flex flex-col md:flex-row items-center gap-3 w-full xl:w-auto">

                    {/* Mode Toggle */}
                    {!isEditMode && (
                        <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200">
                            <button
                                onClick={() => toggleMode('existing')}
                                className={`px-4 py-1.5 rounded-md text-xs font-bold uppercase tracking-wider transition-all duration-200 ${entryMode === 'existing'
                                    ? 'bg-white text-purple-600 shadow-sm ring-1 ring-black/5'
                                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
                                    }`}
                            >
                                Existing Container
                            </button>
                            <button
                                onClick={() => toggleMode('new')}
                                className={`px-4 py-1.5 rounded-md text-xs font-bold uppercase tracking-wider transition-all duration-200 ${entryMode === 'new'
                                    ? 'bg-white text-purple-600 shadow-sm ring-1 ring-black/5'
                                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
                                    }`}
                            >
                                New Container
                            </button>
                        </div>
                    )}

                    <div className="hidden md:block w-px h-8 bg-slate-200 mx-1"></div>

                    {/* Date Badge */}
                    <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg">
                        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                        <span className="text-xs font-bold text-slate-600 uppercase tracking-wide">
                            {formatDate(new Date())}
                        </span>
                    </div>

                </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
                {/* Sticky Header Section for Container Details */}
                <div className="sticky top-0 z-30 -mx-4 px-4 md:-mx-0 md:px-0">
                    <div className="bg-white/95 backdrop-blur-md rounded-xl border border-slate-200/60 shadow-lg p-5 transition-all">
                        <div className="flex justify-between items-center mb-5 border-b border-slate-100 pb-3">
                            <div>
                                <h2 className="text-lg font-bold text-slate-800 tracking-tight flex items-center gap-2">
                                    {entryMode === 'existing' ? 'Daily Entry Details' : 'Full Container Details'}
                                </h2>
                                <p className="text-xs text-slate-400 font-medium">Please fill in the required core information</p>
                            </div>

                            {/* Action Buttons in Header for easy access */}
                            <div className="flex gap-3">
                                <button
                                    type="button"
                                    onClick={() => navigate('/containers')}
                                    className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50 hover:text-slate-900 transition-all shadow-sm active:scale-95"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className={`px-6 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold shadow-md shadow-blue-600/20 transition-all active:scale-95 flex items-center gap-2 ${isSubmitting ? 'opacity-70 cursor-not-allowed' : ''}`}
                                >
                                    {isSubmitting ? (
                                        <>
                                            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                            Saving...
                                        </>
                                    ) : (
                                        isEditMode ? 'Update Entry' : 'Save Entry'
                                    )}
                                </button>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
                            {/* Row 1: Core ID, Dates, Workers */}
                            <div className="md:col-span-1 relative group">
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5 ml-0.5">
                                    Container No <span className="text-red-500">*</span>
                                </label>
                                <div className="relative">
                                    <input
                                        type="text"
                                        name="containerNo"
                                        placeholder={entryMode === 'existing' ? "Search Active..." : "Enter New No."}
                                        value={formData.containerNo}
                                        onChange={(e) => {
                                            handleContainerNoChange(e);
                                            // Show suggestions when typing
                                            if (entryMode === 'existing') {
                                                const hasMatches = suggestions.some(s => s.includes(e.target.value));
                                                // We can use a data attribute or class to toggle, but for now relying on React re-render
                                            }
                                        }}
                                        onFocus={() => entryMode === 'existing' && setIsSuggestionsOpen(true)}
                                        onBlur={(e) => {
                                            // Delay hiding to allow click event on suggestion
                                            setTimeout(() => setIsSuggestionsOpen(false), 200);
                                            if (entryMode === 'existing' && e.target.value) {
                                                fillContainerDetails(e.target.value);
                                            }
                                        }}
                                        className="block w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-slate-800 text-sm font-medium focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all placeholder:text-slate-400"
                                        required
                                        autoComplete="off"
                                    />
                                    {/* Custom Styled Dropdown */}
                                    {entryMode === 'existing' && isSuggestionsOpen && suggestions.length > 0 && (
                                        <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-xl max-h-60 overflow-y-auto animate-in fade-in zoom-in-95 duration-100">
                                            {suggestions
                                                .filter(s => !formData.containerNo || s.includes(formData.containerNo))
                                                .map(s => (
                                                    <div
                                                        key={s}
                                                        onMouseDown={() => {
                                                            // Use onMouseDown to trigger before onBlur
                                                            setFormData(prev => ({ ...prev, containerNo: s }));
                                                            fillContainerDetails(s);
                                                            setIsSuggestionsOpen(false);
                                                        }}
                                                        className="px-4 py-2.5 text-sm text-slate-700 hover:bg-blue-50 hover:text-blue-600 cursor-pointer font-medium transition-colors border-b border-slate-50 last:border-0"
                                                    >
                                                        {s}
                                                    </div>
                                                ))}
                                            {suggestions.filter(s => !formData.containerNo || s.includes(formData.containerNo)).length === 0 && (
                                                <div className="px-4 py-3 text-xs text-slate-400 text-center italic">
                                                    No active containers found
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Date Field Logic */}
                            {entryMode === 'existing' ? (
                                <div className="md:col-span-1">
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5 ml-0.5">
                                        Assortment Date <span className="text-red-500">*</span>
                                    </label>
                                    <CustomDatePicker
                                        name="unloadDate"
                                        value={formData.unloadDate}
                                        onChange={handleInputChange}
                                        required
                                        className="h-10 bg-white"
                                    />
                                </div>
                            ) : (
                                <>
                                    <div className="md:col-span-1">
                                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5 ml-0.5">
                                            Assortment Date <span className="text-red-500">*</span>
                                        </label>
                                        <CustomDatePicker
                                            name="date"
                                            value={formData.date}
                                            onChange={handleInputChange}
                                            required
                                            className="h-10 bg-white"
                                        />
                                    </div>
                                    <div className="md:col-span-1">
                                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5 ml-0.5">
                                            Unload Date <span className="text-red-500">*</span>
                                        </label>
                                        <CustomDatePicker
                                            name="unloadDate"
                                            value={formData.unloadDate}
                                            onChange={handleInputChange}
                                            required
                                            className="h-10 bg-white"
                                        />
                                    </div>
                                </>
                            )}

                            <div className="md:col-span-1">
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5 ml-0.5">
                                    Worker Count
                                </label>
                                <div className="relative">
                                    <input
                                        type="number"
                                        min="0"
                                        step="any"
                                        name="workerCount"
                                        value={formData.workerCount}
                                        onChange={handleInputChange}
                                        className="block w-full h-10 px-3 pr-12 rounded-lg border border-slate-300 bg-white text-slate-800 text-sm font-medium focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all placeholder:text-slate-400"
                                        placeholder="0"
                                    />
                                    <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-slate-400 text-xs font-medium">
                                        Pers.
                                    </div>
                                </div>
                            </div>

                            {/* Row 2: Firm & Weight Details */}
                            {entryMode === 'existing' ? (
                                <>
                                    <div className="md:col-span-1">
                                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5 ml-0.5">
                                            Assortment Wt
                                        </label>
                                        <div className="relative">
                                            <input
                                                type="number"
                                                step="any"
                                                name="assortmentWeight"
                                                value={formData.assortmentWeight}
                                                onChange={handleInputChange}
                                                className="block w-full h-10 px-3 pr-10 rounded-lg border border-slate-300 bg-white text-slate-800 text-sm font-medium focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all placeholder:text-slate-400"
                                                placeholder="0.00"
                                            />
                                            <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-slate-400 text-xs font-medium">
                                                Kg
                                            </div>
                                        </div>
                                    </div>
                                    <div className="md:col-span-3 lg:col-span-4 bg-slate-50/80 rounded-lg border border-slate-200 p-3 flex items-center justify-between">
                                        <div>
                                            <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Firm Name</span>
                                            <span className="text-sm font-bold text-slate-800">{formData.firm || '-'}</span>
                                        </div>
                                        <div className="text-right">
                                            <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Original Date</span>
                                            <span className="text-sm font-bold text-slate-700">{displayDate ? displayDate.split('T')[0] : '-'}</span>
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div className="md:col-span-2">
                                        <FirmCombo
                                            value={formData.firm}
                                            onChange={handleFirmChange}
                                            label={<span className="text-xs font-bold text-slate-500 uppercase tracking-wide ml-0.5">Firm Name <span className="text-red-500">*</span></span>}
                                            inputClassName="h-10 bg-white"
                                        />
                                    </div>

                                    <div className="md:col-span-1">
                                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5 ml-0.5">
                                            Container Wt
                                        </label>
                                        <div className="relative">
                                            <input
                                                type="number"
                                                step="any"
                                                name="containerWeight"
                                                value={formData.containerWeight}
                                                onChange={handleInputChange}
                                                className="block w-full h-10 px-3 pr-10 rounded-lg border border-slate-300 bg-white text-slate-800 text-sm font-medium focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all placeholder:text-slate-400"
                                                placeholder="0.00"
                                            />
                                            <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-slate-400 text-xs font-medium">
                                                Kg
                                            </div>
                                        </div>
                                    </div>

                                    <div className="md:col-span-1">
                                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5 ml-0.5">
                                            Assortment Wt (Auto)
                                        </label>
                                        <div className="relative">
                                            <input
                                                type="number"
                                                step="any"
                                                name="assortmentWeight"
                                                value={formData.assortmentWeight}
                                                readOnly
                                                className="block w-full h-10 px-3 pr-10 rounded-lg border border-slate-300 bg-slate-100 text-slate-500 text-sm font-bold focus:outline-none cursor-not-allowed"
                                                placeholder="0.00"
                                            />
                                            <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-slate-400 text-xs font-medium">
                                                Kg
                                            </div>
                                        </div>
                                    </div>

                                    <div className="md:col-span-1">
                                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5 ml-0.5">
                                            LR / BL No
                                        </label>
                                        <input
                                            type="text"
                                            name="lrNo"
                                            value={formData.lrNo}
                                            onChange={handleInputChange}
                                            className="block w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-slate-800 text-sm font-medium focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all placeholder:text-slate-400"
                                            placeholder="Optional"
                                        />
                                    </div>

                                    <div className="md:col-span-3">
                                        <ScrapTypeCombo
                                            value={formData.remarks}
                                            onChange={handleScrapTypeChange}
                                            label={<span className="text-xs font-bold text-slate-500 uppercase tracking-wide ml-0.5">Scrap Type / Remarks</span>}
                                            inputClassName="h-10 bg-white"
                                        />
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="px-6 py-3 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-center bg-slate-50/30 gap-4">
                        <div className="flex items-center gap-4 w-full sm:w-auto">
                            <h2 className="text-base font-bold text-slate-800 tracking-tight">Items Manifest</h2>
                            <div className="text-xs bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full font-medium border border-slate-200">
                                Total: {items.length}
                            </div>
                        </div>

                        {/* Compact Quick Add Bar */}
                        <div className="flex items-center gap-2 w-full sm:w-auto">
                            <div className="relative flex-1 sm:w-64 z-20">
                                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                                <input
                                    ref={searchInputRef}
                                    type="text"
                                    value={newItemName}
                                    onChange={handleSearchChange}
                                    onKeyDown={(e) => {
                                        if (e.key === 'ArrowDown') {
                                            e.preventDefault();
                                            setActiveIndex(prev => (prev < filteredSuggestions.length - 1 ? prev + 1 : prev));
                                        } else if (e.key === 'ArrowUp') {
                                            e.preventDefault();
                                            setActiveIndex(prev => (prev > 0 ? prev - 1 : -1));
                                        } else if (e.key === 'Enter') {
                                            e.preventDefault();
                                            if (activeIndex >= 0 && filteredSuggestions[activeIndex]) {
                                                selectSuggestion(filteredSuggestions[activeIndex]);
                                            } else if (filteredSuggestions.length > 0) {
                                                selectSuggestion(filteredSuggestions[0]);
                                            } else {
                                                handleAddItem(e);
                                            }
                                        }
                                    }}
                                    onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                                    placeholder="Add item..."
                                    className={`w-full pl-8 pr-3 py-1.5 text-xs font-medium border rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none shadow-sm h-8 ${items.some(i => i.itemName.toLowerCase() === newItemName.trim().toLowerCase()) ? 'border-orange-300 text-orange-700 bg-orange-50' : 'border-slate-300'}`}
                                />
                                {items.some(i => i.itemName.toLowerCase() === newItemName.trim().toLowerCase()) && (
                                    <div className="absolute top-full left-0 mt-1 text-[10px] text-orange-600 font-bold tracking-tight">
                                        ! Item already exists
                                    </div>
                                )}

                                {showSuggestions && filteredSuggestions.length > 0 && (
                                    <ul className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-xl max-h-48 overflow-y-auto z-50 divide-y divide-slate-100">
                                        {filteredSuggestions.map((item, idx) => (
                                            <li
                                                key={idx}
                                                onMouseDown={(e) => selectSuggestion(item, e)}
                                                className={`px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 cursor-pointer flex justify-between items-center ${idx === activeIndex ? 'bg-blue-100' : ''}`}
                                            >
                                                <span className="font-bold">{item.itemName}</span>
                                                <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded border border-slate-200">Existing</span>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                            <button
                                type="button"
                                onClick={handleAddItem}
                                disabled={!newItemName.trim() || isAddingItem}
                                className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm h-8 uppercase tracking-wide"
                            >
                                {isAddingItem ? <span className="animate-pulse">...</span> : <><Plus size={14} /> Add</>}
                            </button>
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50 text-slate-500 uppercase text-xs font-bold tracking-wider border-b border-slate-200">
                                <tr>
                                    <th className="px-6 py-3.5 w-12 text-center">#</th>
                                    <th className="px-6 py-3.5">Item Details</th>
                                    <th className="px-6 py-3.5 w-36 text-center">Quantity (Kg)</th>
                                    <th className="px-6 py-3.5 w-24 text-center">Split %</th>
                                    {canViewRates && <th className="px-6 py-3.5 w-32 text-center">Rate</th>}
                                    {canViewRates && <th className="px-6 py-3.5 text-right">Amount</th>}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {items.map((item, index) => {
                                    // Calculate Percentage dynamically
                                    const qty = parseFloat(item.quantity) || 0;
                                    const totalWt = parseFloat(formData.containerWeight) > 0
                                        ? parseFloat(formData.containerWeight)
                                        : calculateTotalQty(); // Fallback to sum of items
                                    const pct = totalWt > 0 ? ((qty / totalWt) * 100).toFixed(2) : '0.00';

                                    return (
                                        <tr key={item.itemId} className="hover:bg-blue-50/30 transition-colors group">
                                            <td className="px-6 py-3 text-center text-slate-400 font-medium">{index + 1}</td>
                                            <td className="px-6 py-3 font-semibold text-slate-700">{item.itemName}</td>
                                            <td className="px-6 py-3">
                                                <input
                                                    id={`quantity-${index}`}
                                                    type="number"
                                                    min="0"
                                                    step="any"
                                                    onKeyDown={(e) => {
                                                        if (e.key === '-') e.preventDefault();
                                                        handleKeyDown(e, index, 'quantity');
                                                    }}
                                                    value={item.quantity}
                                                    onChange={(e) => handleItemChange(index, 'quantity', e.target.value)}
                                                    className="block w-full h-9 rounded-md border border-slate-200 bg-white text-center text-slate-800 text-sm font-semibold focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 placeholder-slate-300 transition-all shadow-sm"
                                                    placeholder="0"
                                                />
                                            </td>
                                            <td className="px-6 py-3 text-center">
                                                <span className="inline-flex items-center px-2 py-1 rounded text-xs font-bold bg-slate-100 text-slate-600">
                                                    {pct}%
                                                </span>
                                            </td>
                                            {canViewRates && (
                                                <td className="px-6 py-3">
                                                    <input
                                                        id={`rate-${index}`}
                                                        type="number"
                                                        min="0"
                                                        step="any"
                                                        onKeyDown={(e) => {
                                                            if (e.key === '-') e.preventDefault();
                                                            handleKeyDown(e, index, 'rate');
                                                        }}
                                                        value={item.rate}
                                                        onChange={(e) => handleItemChange(index, 'rate', e.target.value)}
                                                        className="block w-full h-9 rounded-md border border-slate-200 bg-white text-center text-slate-800 text-sm font-semibold focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 placeholder-slate-300 transition-all shadow-sm"
                                                        placeholder="0"
                                                    />
                                                </td>
                                            )}
                                            {canViewRates && (
                                                <td className="px-6 py-3 text-right font-bold text-slate-700 font-mono">
                                                    {item.amount.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}
                                                </td>
                                            )}
                                        </tr>
                                    );
                                })}
                            </tbody>
                            <tfoot className="bg-slate-50/50 border-t border-slate-200">
                                <tr>
                                    <td colSpan="2" className="px-6 py-4 text-right text-sm font-bold text-slate-500 uppercase tracking-wide">Total Summary:</td>
                                    <td className="px-6 py-4 text-center text-base font-bold text-slate-800">
                                        {calculateTotalQty().toLocaleString('en-IN')} <span className="text-xs font-normal text-slate-400">Kg</span>
                                    </td>
                                    <td className="px-6 py-4"></td>
                                    {canViewRates && <td className="px-6 py-4"></td>}
                                    {canViewRates && (
                                        <td className="px-6 py-4 text-right text-lg font-bold text-blue-600 font-mono">
                                            {calculateTotal().toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}
                                        </td>
                                    )}
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>
            </form>

            <ConfirmationModal
                isOpen={modalConfig.isOpen}
                onClose={() => setModalConfig({ ...modalConfig, isOpen: false })}
                onConfirm={modalConfig.onConfirm}
                title={modalConfig.title}
                message={modalConfig.message}
                confirmText={modalConfig.confirmText}
                confirmColor={modalConfig.confirmColor}
                showCancel={modalConfig.showCancel}
            />
        </div >
    );

};

export default ContainerEntry;