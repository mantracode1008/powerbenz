
import React, { useState, useEffect } from 'react';
import { getContainers, getItems, deleteContainer } from '../services/api';
import { formatDate } from '../utils/dateUtils';
import { useNavigate } from 'react-router-dom';
import { Download, Search, FileText, Plus, X, ExternalLink, ChevronDown, Trash2, AlertTriangle, Calendar } from 'lucide-react';
import CustomDatePicker from '../components/CustomDatePicker';
import XLSX from 'xlsx-js-style';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const ContainerSummary = ({ viewMode = 'summary', groupByDate = false }) => {
    const navigate = useNavigate();
    const [containers, setContainers] = useState([]);
    const [itemsList, setItemsList] = useState([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(0);
    const [selectedContainer, setSelectedContainer] = useState(null);
    const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));
    const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
    const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10));
    const [filterType, setFilterType] = useState('month'); // 'month', 'date', 'range'
    const [selectedFirm, setSelectedFirm] = useState('');
    const searchInputRef = React.useRef(null);
    const [showExportMenu, setShowExportMenu] = useState(false);
    const [showModalExportMenu, setShowModalExportMenu] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [containerToDelete, setContainerToDelete] = useState(null);
    const [itemBreakdown, setItemBreakdown] = useState(null);
    const containersPerPage = 12;

    useEffect(() => {
        const init = async () => {
            setLoading(true);
            await Promise.all([fetchItems(), fetchContainers()]);
            setLoading(false);
        };
        init();
    }, [selectedMonth, selectedDate, startDate, endDate, filterType]);

    // Search Shortcut Support (Shift+F)
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

    const fetchItems = async () => {
        try {
            const response = await getItems();
            setItemsList(response.data);
        } catch (error) {
            console.error('Error fetching items:', error);
        }
    };

    const fetchContainers = async () => {
        try {
            // Fetch all containers and filter client-side to ensure consistency
            const response = await getContainers({});
            setContainers(response.data);
        } catch (error) {
            console.error('Error fetching containers:', error);
        }
    };





    const filteredContainers = React.useMemo(() => {
        let processList = Array.isArray(containers) ? containers : [];

        // Client-side Filtering
        if (filterType === 'month') {
            processList = processList.filter(c => !selectedMonth || (c.date && c.date.startsWith(selectedMonth)));
        } else if (filterType === 'date') {
            processList = processList.filter(c => c.date && c.date.startsWith(selectedDate));
        } else if (filterType === 'range') {
            processList = processList.filter(c => {
                const cDate = c.date ? c.date.slice(0, 10) : '';
                return cDate >= startDate && cDate <= endDate;
            });
        }

        if (selectedFirm) {
            const lowerSearch = selectedFirm.trim().toLowerCase();
            console.log('Filtering Containers. Query:', lowerSearch);
            processList = processList.filter((c, idx) => {
                const firmMatch = (c.firm || '').toLowerCase().includes(lowerSearch);
                // Check itemName OR name (just in case)
                const itemMatch = (c.items || []).some(i => {
                    const iName = i.itemName || i.name || '';
                    return iName.toLowerCase().includes(lowerSearch);
                });
                return firmMatch || itemMatch;
            });
            console.log('Containers after filter:', processList.length);
        }

        if (viewMode === 'summary') {
            // GroupByDate Logic for History Matrix View
            if (groupByDate) {
                return [...processList].sort((a, b) => {
                    const dateA = new Date(a.unloadDate || a.date);
                    const dateB = new Date(b.unloadDate || b.date);
                    return dateA - dateB; // Chronological order
                });
            }

            // Group and Merge containers by containerNo
            const mergedContainersMap = new Map();

            processList.forEach(container => {
                const containerNo = (container.containerNo || '').trim().toUpperCase();
                // Also normalize the container object's number for consistent display
                container.containerNo = containerNo;

                if (!mergedContainersMap.has(containerNo)) {
                    // Clone the container and its items to avoid mutating original data
                    mergedContainersMap.set(containerNo, {
                        ...container,
                        items: container.items ? container.items.map(item => ({ ...item })) : [],
                        allDates: [container.date],
                        // Ensure numeric values for aggregation
                        workerCount: parseFloat(container.workerCount) || 0,
                        containerWeight: parseFloat(container.containerWeight) || 0
                    });
                } else {
                    const existingContainer = mergedContainersMap.get(containerNo);

                    // Merge items
                    container.items?.forEach(newItem => {
                        const existingItemIndex = existingContainer.items.findIndex(i =>
                            (i.itemName || '').trim().toLowerCase() === (newItem.itemName || '').trim().toLowerCase()
                        );

                        if (existingItemIndex >= 0) {
                            // Update quantity of existing item
                            const existingItem = existingContainer.items[existingItemIndex];
                            existingContainer.items[existingItemIndex] = {
                                ...existingItem,
                                quantity: parseFloat(((parseFloat(existingItem.quantity) || 0) + (parseFloat(newItem.quantity) || 0)).toFixed(2))
                            };
                        } else {
                            // Add new item
                            existingContainer.items.push({ ...newItem });
                        }
                    });

                    // Update date to latest if needed
                    if (new Date(container.date) > new Date(existingContainer.date)) {
                        existingContainer.date = container.date;
                    }

                    // Accumulate Worker Count (User requested Summation)
                    existingContainer.workerCount = (parseFloat(existingContainer.workerCount) || 0) + (parseFloat(container.workerCount) || 0);
                    // Do not sum container weights (static property), likely same container split across entries. Take max or latest.
                    existingContainer.containerWeight = Math.max(existingContainer.containerWeight, parseFloat(container.containerWeight) || 0);
                }
            });

            return Array.from(mergedContainersMap.values()).sort((a, b) => {
                const numComparison = (a.containerNo || '').localeCompare(b.containerNo || '', undefined, { numeric: true, sensitivity: 'base' });
                if (numComparison !== 0) return numComparison;
                // Sort by Date (Unload Date preferred, which is now in .date property of merged container)
                return new Date(a.date) - new Date(b.date);
            });
        } else {
            // History Mode: Show all containers separately, sorted by Date (Newest First) then ContainerNo
            return [...processList].sort((a, b) => {
                // Sort by Unload Date or Date DESC
                const dateA = new Date(a.unloadDate || a.date);
                const dateB = new Date(b.unloadDate || b.date);
                const dateComparison = dateB - dateA; // Newest first

                if (dateComparison !== 0) return dateComparison;

                return (a.containerNo || '').localeCompare(b.containerNo || '', undefined, { numeric: true, sensitivity: 'base' });
            });
        }
    }, [containers, viewMode, filterType, selectedMonth, selectedDate, startDate, endDate]);

    // History Grouping Logic
    const historyGroups = React.useMemo(() => {
        if (viewMode !== 'history') return [];

        const groups = {};
        // Process filtered list
        filteredContainers.forEach(c => {
            const no = (c.containerNo || 'Unknown').trim().toUpperCase();
            if (!groups[no]) {
                groups[no] = {
                    containerNo: no,
                    entries: [],
                    totalWeight: 0,
                    latestDate: c.date || c.unloadDate
                };
            }

            // Calculate Daily Weight
            const dailyWeight = c.items?.reduce((sum, i) => sum + (parseFloat(i.quantity) || 0), 0) || 0;

            groups[no].entries.push({
                ...c,
                totalWeight: dailyWeight.toFixed(2)
            });
            groups[no].totalWeight += dailyWeight;

            // Keep track of latest date for sorting groups (Prioritize Unload Date)
            const entryDate = c.unloadDate || c.date;
            if (!groups[no].latestDate || new Date(entryDate) > new Date(groups[no].latestDate)) {
                groups[no].latestDate = entryDate;
            }
        });

        // Convert to array and sort by latest activity date desc
        return Object.values(groups).sort((a, b) => new Date(b.latestDate) - new Date(a.latestDate));
    }, [filteredContainers, viewMode]);

    const [expandedGroups, setExpandedGroups] = useState({});

    const toggleGroup = (containerNo) => {
        setExpandedGroups(prev => ({
            ...prev,
            [containerNo]: !prev[containerNo]
        }));
    };

    const totalPages = Math.ceil(filteredContainers.length / containersPerPage);
    const visibleContainers = filteredContainers.slice(page * containersPerPage, (page + 1) * containersPerPage);

    const handlePrevPage = () => setPage(p => Math.max(0, p - 1));
    const handleNextPage = () => setPage(p => Math.min(totalPages - 1, p + 1));

    // Calculate Totals per Item
    const itemTotals = React.useMemo(() => {
        const totals = {};
        itemsList.forEach(item => {
            totals[item.name] = parseFloat(filteredContainers.reduce((sum, c) => {
                const qty = c.items
                    ?.filter(i => (i.itemName || '').trim().toLowerCase() === (item.name || '').trim().toLowerCase())
                    .reduce((s, i) => s + (parseFloat(i.quantity) || 0), 0) || 0;
                return sum + qty;
            }, 0).toFixed(2));
        });
        return totals;
    }, [itemsList, filteredContainers]);

    const handleShowBreakdown = (item) => {
        // Ensure source is array
        let sourceList = Array.isArray(containers) ? containers : [];

        // Match Filter Logic exactly
        if (filterType === 'month') {
            sourceList = sourceList.filter(c => !selectedMonth || (c.date && c.date.startsWith(selectedMonth)));
        } else if (filterType === 'date') {
            sourceList = sourceList.filter(c => c.date && c.date.startsWith(selectedDate));
        } else if (filterType === 'range') {
            sourceList = sourceList.filter(c => {
                const cDate = c.date ? c.date.slice(0, 10) : '';
                return cDate >= startDate && cDate <= endDate;
            });
        }

        const targetName = (item.name || '').trim().toLowerCase();

        const breakdownEntries = sourceList
            .map(c => {
                // Robust Item Match
                const quantity = c.items
                    ?.filter(i => (i.itemName || '').trim().toLowerCase() === targetName)
                    .reduce((sum, i) => sum + (parseFloat(i.quantity) || 0), 0) || 0;

                return {
                    containerNo: c.containerNo,
                    date: c.date || c.unloadDate,
                    quantity: quantity,
                    firm: c.firm
                };
            })
            .filter(entry => entry.quantity > 0)
            .sort((a, b) => new Date(b.date) - new Date(a.date));

        console.log('Breakdown for:', item.name, 'Found entries:', breakdownEntries.length);

        setItemBreakdown({
            itemName: item.name,
            total: itemTotals[item.name],
            entries: breakdownEntries
        });
    };

    const handleDeleteClick = (container, e) => {
        e.stopPropagation();
        setContainerToDelete(container);
        setIsDeleteModalOpen(true);
    };

    const confirmDelete = async () => {
        if (!containerToDelete) return;
        try {
            await deleteContainer(containerToDelete.id || containerToDelete._id, containerToDelete.date);
            await fetchContainers(); // Refresh list
            setIsDeleteModalOpen(false);
            setContainerToDelete(null);
        } catch (error) {
            console.error("Delete failed", error);
            alert("Failed to delete container entry.");
        }
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
        try {
            if (filteredContainers.length === 0) {
                alert("No data to export");
                return;
            }

            const containers = filteredContainers;
            // Pre-calculate container totals
            containers.forEach(c => {
                c.totalQty = c.items?.reduce((s, i) => s + (parseFloat(i.quantity) || 0), 0) || 1;
            });

            const activeItems = itemsList.filter(item => itemTotals[item.name] > 0);

            // Build Header Rows
            const headerRow1 = ["Item Name"];
            const headerRow2 = [""];
            const merges = [{ s: { r: 0, c: 0 }, e: { r: 1, c: 0 } }]; // Merge Item Name vertical

            let colIndex = 1;

            // Container Headers
            containers.forEach(c => {
                headerRow1.push(c.containerNo);
                headerRow1.push("");
                headerRow2.push("Qty");
                headerRow2.push("%");

                // Merge Container Name horizontal
                merges.push({ s: { r: 0, c: colIndex }, e: { r: 0, c: colIndex + 1 } });
                colIndex += 2;
            });

            // Total Headers
            headerRow1.push("Total");
            headerRow1.push("");
            headerRow2.push("Qty");
            headerRow2.push("%");
            merges.push({ s: { r: 0, c: colIndex }, e: { r: 0, c: colIndex + 1 } });

            const excelData = [headerRow1, headerRow2];

            // Item Rows
            const grandTotalWeight = Object.values(itemTotals).reduce((a, b) => a + b, 0) || 1;

            activeItems.forEach(item => {
                const row = [item.name];
                let itemRowTotal = 0;

                containers.forEach(c => {
                    const containerItem = c.items?.find(i => (i.itemName || '').trim().toLowerCase() === (item.name || '').trim().toLowerCase());
                    const qty = containerItem ? parseFloat(containerItem.quantity) || 0 : 0;

                    if (qty > 0) {
                        const pct = ((qty / c.totalQty) * 100).toFixed(2);
                        row.push(qty);
                        row.push(`${pct}%`);
                    } else {
                        row.push('');
                        row.push('');
                    }
                    itemRowTotal += qty;
                });

                // Total Column
                const totalPct = ((itemRowTotal / grandTotalWeight) * 100).toFixed(2);
                row.push(itemRowTotal);
                row.push(`${totalPct}%`);

                excelData.push(row);
            });

            // Footer Row
            const footerRow = ["Total Weight"];
            let grandTotal = 0;
            containers.forEach(c => {
                const colSum = activeItems.reduce((sum, item) => {
                    const containerItem = c.items?.find(i => (i.itemName || '').trim().toLowerCase() === (item.name || '').trim().toLowerCase());
                    return sum + (containerItem ? parseFloat(containerItem.quantity) || 0 : 0);
                }, 0);
                footerRow.push(colSum > 0 ? colSum : '');
                footerRow.push("");
                grandTotal += colSum;
            });
            footerRow.push(grandTotal);
            footerRow.push("");
            excelData.push(footerRow);

            // Create Sheet
            const ws = XLSX.utils.aoa_to_sheet(excelData);
            ws['!merges'] = merges;

            // Column Widths
            const wscols = [{ wch: 25 }];
            for (let i = 0; i <= containers.length; i++) {
                wscols.push({ wch: 10 });
                wscols.push({ wch: 10 });
            }
            ws['!cols'] = wscols;

            // Apply Styles
            const styleHeader = {
                font: { bold: true, sz: 12, color: { rgb: "000000" } },
                alignment: { horizontal: "center", vertical: "center" },
                fill: { fgColor: { rgb: "E0E0E0" } },
                border: {
                    top: { style: "thin" }, bottom: { style: "thin" },
                    left: { style: "thin" }, right: { style: "thin" }
                }
            };

            const styleQty = {
                font: { sz: 10 },
                alignment: { horizontal: "center" },
                fill: { fgColor: { rgb: "E3F2FD" } }, // Light Blue
                border: { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } }
            };

            const stylePct = {
                font: { sz: 10 },
                alignment: { horizontal: "center" },
                fill: { fgColor: { rgb: "FFF3E0" } }, // Light Orange
                border: { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } }
            };

            // Calculate Range
            const range = XLSX.utils.decode_range(ws['!ref']);
            for (let R = range.s.r; R <= range.e.r; ++R) {
                for (let C = range.s.c; C <= range.e.c; ++C) {
                    const cell_address = { c: C, r: R };
                    const cell_ref = XLSX.utils.encode_cell(cell_address);

                    if (!ws[cell_ref]) ws[cell_ref] = { t: 's', v: '' }; // Ensure cell exists
                    const cell = ws[cell_ref];

                    // Headers
                    if (R <= 1) {
                        cell.s = styleHeader;
                    } else {
                        // Data Rows
                        if (C === 0) {
                            cell.s = { font: { bold: true }, border: { right: { style: "thin" } }, fill: { fgColor: { rgb: "FFFFFF" } } };
                        } else {
                            if (C % 2 !== 0) cell.s = styleQty; // Odd = Qty
                            else cell.s = stylePct; // Even = %
                        }
                    }
                }
            }

            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Container Summary");
            XLSX.writeFile(wb, getFilename("Container_Summary"));

        } catch (error) {
            console.error("Excel Export Error:", error);
            alert("Failed to export Excel file. " + error.message);
        }
    };

    const exportToPDF = () => {
        try {
            if (filteredContainers.length === 0) {
                alert("No data to export");
                return;
            }

            const doc = new jsPDF('l', 'mm', 'a4'); // Landscape
            doc.setFontSize(14);
            doc.text("Container Summary Report", 14, 15);
            doc.setFontSize(10);
            doc.text(getPeriodText(), 14, 22);

            // Pre-calculate container totals
            filteredContainers.forEach(c => {
                c.totalQty = c.items?.reduce((s, i) => s + (parseFloat(i.quantity) || 0), 0) || 1;
            });

            // Transpose Logic: Cols = Containers, Rows = Items
            const containerHeaders = filteredContainers.map(c => c.containerNo);
            const tableColumn = ["Item Name", ...containerHeaders, "Total"];

            const tableRows = [];

            // 1. Item Rows
            // Filter active items (row total > 0) to save space
            const activeItems = itemsList.filter(item => itemTotals[item.name] > 0);

            // Calculate Grand Total for %
            const grandTotalWeight = Object.values(itemTotals).reduce((a, b) => a + b, 0) || 1;

            activeItems.forEach(item => {
                const row = [item.name];
                filteredContainers.forEach(c => {
                    const containerItem = c.items?.find(i => (i.itemName || '').trim().toLowerCase() === (item.name || '').trim().toLowerCase());
                    if (containerItem) {
                        const qty = parseFloat(containerItem.quantity);
                        const pct = ((qty / c.totalQty) * 100).toFixed(2);
                        row.push(`${qty.toFixed(2)}\n(${pct}%)`);
                    } else {
                        row.push('');
                    }
                });

                // Total Column with %
                const totalPct = ((itemTotals[item.name] / grandTotalWeight) * 100).toFixed(2);
                row.push(`${itemTotals[item.name].toFixed(2)}\n(${totalPct}%)`);
                tableRows.push(row);
            });

            // 2. Footer Row (Container Totals)
            const footerRow = ["TOTAL WEIGHT"];
            let grandTotal = 0;

            filteredContainers.forEach(c => {
                // Sum of displayed item quantities for that container
                // OR use totalWeight. Better to sum displayed active items to match the matrix logic exactly.
                // Actually, containerWeight might differ from sum of items?
                // Let's use Sum of Items for consistency with the table body.
                const sum = activeItems.reduce((acc, item) => {
                    const containerItem = c.items?.find(i => (i.itemName || '').trim().toLowerCase() === (item.name || '').trim().toLowerCase());
                    return acc + (containerItem ? parseFloat(containerItem.quantity) || 0 : 0);
                }, 0);
                footerRow.push(sum > 0 ? sum.toFixed(2) : '');
                grandTotal += sum;
            });
            footerRow.push(grandTotal.toFixed(2));
            tableRows.push(footerRow);


            autoTable(doc, {
                head: [tableColumn],
                body: tableRows,
                startY: 25,
                theme: 'grid',
                styles: { fontSize: 7, cellPadding: 1, overflow: 'linebreak' },
                headStyles: { fillColor: [66, 133, 244], textColor: 255 },
                columnStyles: {
                    0: { fontStyle: 'bold', cellWidth: 30 }, // Item Name
                    // cellWidth: 'auto' for others
                }
            });

            doc.save(getFilename("Container_Summary").replace('.xlsx', '.pdf'));
        } catch (error) {
            console.error("PDF Export Error:", error);
            alert("Failed to export PDF file. Please try again.");
        }
    };

    if (loading) {
        return (
            <div className="flex justify-center items-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    const title = viewMode === 'history' ? 'Container History' : 'Container Summary';
    const subtitle = viewMode === 'history' ? 'Detailed history of all container entries' : 'Matrix view of all containers and items';

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
                        <h1 className="text-xl font-black text-slate-800 tracking-tight">{title}</h1>
                        <div className="flex items-center gap-2 text-slate-500 text-xs font-medium mt-0.5">
                            <span className="bg-slate-100 px-2 py-0.5 rounded text-slate-600 border border-slate-200">Matrix View</span>
                            <span>•</span>
                            <span>{subtitle}</span>
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

                    {/* Firm Search */}
                    <div className="relative w-full md:w-auto">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                            <Search size={16} />
                        </div>
                        <input
                            ref={searchInputRef}
                            type="text"
                            placeholder="Search Firm or Item..."
                            value={selectedFirm}
                            onChange={(e) => setSelectedFirm(e.target.value)}
                            className="w-full md:w-48 pl-10 pr-8 py-2 bg-white border border-slate-200 rounded-lg text-sm font-semibold text-slate-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all shadow-sm hover:border-blue-300"
                        />
                        {selectedFirm && (
                            <button
                                onClick={() => setSelectedFirm('')}
                                className="absolute inset-y-0 right-2 flex items-center text-slate-300 hover:text-red-500 transition-colors"
                            >
                                <X size={14} />
                            </button>
                        )}
                    </div>

                    <div className="hidden md:block w-px h-8 bg-slate-200 mx-1"></div>

                    {/* 3. Action Buttons */}
                    <div className="flex items-center gap-2 w-full md:w-auto">
                        <button
                            onClick={() => navigate('/entry')}
                            className="flex-1 md:flex-none items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 active:translate-y-0.5 text-sm font-bold shadow-sm hover:shadow-md transition-all whitespace-nowrap"
                        >
                            <Plus size={16} strokeWidth={3} />
                            <span>Entry</span>
                        </button>

                        <div className={`relative ${viewMode === 'history' ? 'hidden' : ''}`}>
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
            </div>

            {viewMode === 'history' && (
                <div className="space-y-4 pt-4">
                    {historyGroups.map(group => (
                        <div key={group.containerNo} className="glass-card border border-slate-200 bg-white overflow-hidden">
                            <div
                                onClick={() => toggleGroup(group.containerNo)}
                                className="p-4 flex justify-between items-center cursor-pointer hover:bg-slate-50 transition-colors bg-slate-50/50"
                            >
                                <div className="flex items-center gap-4">
                                    <div className="bg-blue-100 p-2 rounded-lg text-blue-600">
                                        <ChevronDown className={`transition-transform duration-300 ${expandedGroups[group.containerNo] ? 'rotate-180' : ''}`} />
                                    </div>
                                    <div>
                                        <h3 className="text-base font-bold text-slate-800">{group.containerNo}</h3>
                                        <p className="text-xs text-slate-500">{group.entries.length} Entries • Last: {formatDate(group.latestDate)}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-6">
                                    <div className="text-right">
                                        <p className="text-xs text-slate-500 uppercase font-semibold">Total Weight</p>
                                        <p className="text-lg font-bold text-blue-600">{group.totalWeight.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg</p>
                                    </div>
                                </div>
                            </div>

                            {expandedGroups[group.containerNo] && (
                                <div className="border-t border-slate-100">
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm text-left">
                                            <thead className="bg-slate-50 text-slate-600 text-xs uppercase font-semibold">
                                                <tr>
                                                    <th className="px-6 py-3">Assortment Date</th>
                                                    <th className="px-6 py-3">Firm Name</th>
                                                    <th className="px-6 py-3 text-right">Items</th>
                                                    <th className="px-6 py-3 text-right">Worker Count</th>
                                                    <th className="px-6 py-3 text-right">C. Weight</th>
                                                    <th className="px-6 py-3 text-right">Assortment Weight</th>
                                                    <th className="px-6 py-3 text-center">Action</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {group.entries.sort((a, b) => new Date(b.date) - new Date(a.date)).map(entry => (
                                                    <tr key={entry.virtualId || entry.id} className="hover:bg-slate-50">
                                                        <td className="px-6 py-3 font-medium text-slate-700">{formatDate(entry.unloadDate || entry.date)}</td>
                                                        <td className="px-6 py-3 text-slate-600">{entry.firm}</td>
                                                        <td className="px-6 py-3 text-right font-medium">{entry.items?.length || 0}</td>
                                                        <td className="px-6 py-3 text-right">
                                                            <span className="bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full text-xs font-bold">
                                                                {entry.workerCount || 0}
                                                            </span>
                                                        </td>
                                                        <td className="px-6 py-3 text-right font-bold text-slate-800">{(parseFloat(entry.containerWeight || entry.totalWeight) || 0).toFixed(2)}</td>
                                                        <td className="px-6 py-3 text-right font-bold text-slate-600">{(parseFloat(entry.assortmentWeight) || 0).toFixed(2)}</td>
                                                        <td className="px-6 py-3 text-center flex items-center justify-center gap-3">
                                                            <button
                                                                onClick={() => setSelectedContainer(entry)}
                                                                className="text-blue-600 hover:text-blue-800 font-medium text-xs hover:underline"
                                                            >
                                                                View
                                                            </button>
                                                            <button
                                                                onClick={(e) => handleDeleteClick(entry, e)}
                                                                className="text-red-400 hover:text-red-600 transition-colors"
                                                                title="Delete Entry"
                                                            >
                                                                <Trash2 size={14} />
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                    {historyGroups.length === 0 && (
                        <div className="text-center py-12 text-slate-500 bg-white rounded-xl border border-slate-200">
                            No history entries found.
                        </div>
                    )}
                </div>
            )}

            {viewMode === 'summary' && (
                <>
                    {/* Pagination Controls */}
                    {filteredContainers.length > containersPerPage && (
                        <div className="flex justify-between items-center glass-card p-2 rounded-lg border border-slate-200 shadow-sm">
                            <button
                                onClick={handlePrevPage}
                                disabled={page === 0}
                                className="px-3 py-1 text-sm font-medium text-slate-600 bg-slate-100 rounded hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                &larr; Previous
                            </button>
                            <span className="text-sm text-slate-500 font-medium">
                                Page {page + 1} of {totalPages}
                            </span>
                            <button
                                onClick={handleNextPage}
                                disabled={page === totalPages - 1}
                                className="px-3 py-1 text-sm font-medium text-slate-600 bg-slate-100 rounded hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Next &rarr;
                            </button>
                        </div>
                    )}


                    {/* Matrix Table */}
                    <div className="glass-card overflow-hidden">
                        <div className="overflow-x-auto max-h-[600px] scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-transparent">
                            <table className="min-w-full text-sm text-left border-collapse">
                                <thead className="bg-slate-50/90 sticky top-0 z-30 shadow-sm backdrop-blur-md">
                                    <tr>
                                        <th className="px-4 py-3 font-semibold text-slate-600 border-b border-r border-slate-200 min-w-[180px] sticky left-0 bg-slate-50 z-40 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                                            Item Name
                                        </th>
                                        {visibleContainers.map(container => (
                                            <th
                                                key={container.virtualId || container.id || container._id}
                                                className="px-2 py-3 font-semibold text-slate-600 border-b border-r border-slate-200 text-center min-w-[80px] bg-slate-50 transition-colors group/header hover:bg-blue-50 cursor-pointer"
                                                onClick={() => setSelectedContainer(container)}
                                            >
                                                <div className="flex flex-col items-center gap-1">
                                                    <span className="text-slate-800 font-bold text-base group-hover/header:text-blue-600 underline decoration-dotted transition-colors">
                                                        {container.containerNo}
                                                    </span>
                                                    {/* Date removed as per user request */}
                                                </div>
                                            </th>
                                        ))}
                                        <th
                                            className="px-4 py-3 font-bold text-slate-700 border-b border-r border-slate-200 min-w-[100px] text-center bg-yellow-50 sticky right-0 z-30 shadow-[-2px_0_5px_-2px_rgba(0,0,0,0.1)] cursor-pointer hover:bg-yellow-100 transition-colors"
                                            onClick={() => {
                                                // Calculate Aggregated Totals
                                                const aggregatedItemsMap = {};
                                                let totalWeight = 0;
                                                let totalWorkerCount = 0;
                                                const processedContainers = new Set();

                                                visibleContainers.forEach(container => {
                                                    const cNo = (container.containerNo || '').trim().toUpperCase();

                                                    // Only add container-level stats ONCE per container number
                                                    if (!processedContainers.has(cNo)) {
                                                        totalWeight += parseFloat(container.containerWeight) || 0;
                                                        totalWorkerCount += parseInt(container.workerCount) || 0;
                                                        processedContainers.add(cNo);
                                                    }

                                                    if (container.items) {
                                                        container.items.forEach(item => {
                                                            const normName = (item.itemName || '').trim(); // Normalize name
                                                            if (!aggregatedItemsMap[normName]) {
                                                                aggregatedItemsMap[normName] = { ...item, quantity: 0 };
                                                            }
                                                            aggregatedItemsMap[normName].quantity += parseFloat(item.quantity) || 0;
                                                        });
                                                    }
                                                });

                                                const aggregatedItems = Object.values(aggregatedItemsMap);

                                                setSelectedContainer({
                                                    containerNo: 'Total Summary',
                                                    date: null, // No specific date
                                                    unloadDate: null,
                                                    firm: 'Multiple Firms',
                                                    containerWeight: totalWeight, // Sum of weights
                                                    workerCount: totalWorkerCount, // Sum of workers
                                                    remarks: 'Aggregated View',
                                                    items: aggregatedItems,
                                                    isAggregated: true // Flag to potentially hide specific fields if needed
                                                });
                                            }}
                                        >
                                            Total
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-200">
                                    {itemsList.filter((item, idx) => {
                                        if (!selectedFirm) return true;
                                        const lowerSearch = selectedFirm.trim().toLowerCase();

                                        // Robust Name Check
                                        const currentItemName = (item.name || item.itemName || '').toLowerCase();

                                        // 1. If search matches THIS item, show it.
                                        if (currentItemName.includes(lowerSearch)) return true;

                                        // 2. Heuristic: If search text matches ANY known item name, we assume User is searching for items.
                                        // In that case, we should HIDE non-matching items (like this one).
                                        const matchesAnyItem = itemsList.some(i => {
                                            const name = (i.name || i.itemName || '').toLowerCase();
                                            return name.includes(lowerSearch);
                                        });

                                        if (idx === 0) console.log('Row Filter Debug. Search:', lowerSearch, 'MatchesAny:', matchesAnyItem);

                                        // If it matches at least one item, hide this non-matching item.
                                        if (matchesAnyItem) return false;

                                        // 3. If it matches NO items (must be a Firm search), then Show All Items
                                        return true;
                                    }).map((item, index) => (
                                        <tr key={item._id} className="hover:bg-slate-50 transition-colors group">
                                            <td className="px-4 py-2 font-medium text-slate-700 border-r border-slate-200 sticky left-0 bg-white group-hover:bg-slate-50 transition-colors z-20 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs text-slate-400 w-4">{index + 1}</span>
                                                    {item.name}
                                                </div>
                                            </td>
                                            {visibleContainers.map(container => {
                                                const containerTotal = container.items?.reduce((sum, i) => sum + (parseFloat(i.quantity) || 0), 0) || 1;
                                                const containerExpectedTotal = parseFloat(container.containerWeight) || 0;

                                                const qty = container.items
                                                    ?.filter(i => (i.itemName || '').trim().toLowerCase() === (item.name || '').trim().toLowerCase())
                                                    .reduce((sum, i) => sum + (parseFloat(i.quantity) || 0), 0) || 0;

                                                const pctActual = qty > 0 ? ((qty / containerTotal) * 100).toFixed(2) : null;
                                                const pctExpected = (qty > 0 && containerExpectedTotal > 0) ? ((qty / containerExpectedTotal) * 100).toFixed(2) : null;

                                                return (
                                                    <td key={`${container.virtualId || container.id}-${item.name}`} className={`px-2 py-2 text-center border-r border-slate-200 text-sm ${qty > 0 ? 'bg-blue-50/30' : ''}`}>
                                                        {qty > 0 ? (
                                                            <div className="flex flex-col items-center justify-center leading-none py-1 gap-1">
                                                                <span className="text-slate-900 font-bold text-sm">{parseFloat(qty).toFixed(2)}</span>
                                                                {pctExpected && (
                                                                    <span className="text-[10px] text-amber-600 font-medium tracking-tight bg-amber-50 px-1 rounded-sm whitespace-nowrap" title="Expected % (based on container weight)">
                                                                        E% {pctExpected}
                                                                    </span>
                                                                )}
                                                                <div className="flex flex-col gap-0.5 mt-0.5">
                                                                    <span className="text-[10px] text-green-600 font-medium tracking-tight bg-green-100 px-1 rounded-sm whitespace-nowrap" title="Actual % (based on sum of items)">
                                                                        A% {pctActual}
                                                                    </span>

                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <span className="text-slate-300">-</span>
                                                        )}
                                                    </td>
                                                );
                                            })}
                                            <td
                                                className="px-4 py-2 text-center font-bold text-blue-600 border-r border-slate-200 bg-yellow-50 sticky right-0 z-10 shadow-[-2px_0_5px_-2px_rgba(0,0,0,0.1)] cursor-pointer hover:bg-yellow-100 transition-colors"
                                                onClick={() => handleShowBreakdown(item)}
                                                title="Click to see breakdown"
                                            >
                                                {itemTotals[item.name] > 0 ? (
                                                    <div className="flex flex-col items-center justify-center leading-none py-1 gap-1">
                                                        <span className="text-blue-700 font-bold text-sm">{itemTotals[item.name].toFixed(2)}</span>
                                                        <span className="text-[10px] text-blue-600/70 font-medium tracking-tight bg-blue-100/50 px-1 rounded-sm">
                                                            {(() => {
                                                                const grandTotal = Object.values(itemTotals).reduce((a, b) => a + b, 0) || 1;
                                                                return ((itemTotals[item.name] / grandTotal) * 100).toFixed(2);
                                                            })()}%
                                                        </span>
                                                    </div>
                                                ) : '-'}
                                            </td>
                                        </tr>
                                    ))}
                                    {/* Total Row (Container Totals) */}
                                    <tr className="bg-slate-100 font-bold sticky bottom-0 z-30 shadow-[0_-2px_5px_-2px_rgba(0,0,0,0.1)]">
                                        <td className="px-4 py-3 text-slate-700 border-r border-slate-200 sticky left-0 bg-slate-100 z-40 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                                            TOTAL WEIGHT
                                        </td>
                                        {visibleContainers.map(container => {
                                            const totalWeight = parseFloat((container.items?.reduce((sum, i) => sum + (parseFloat(i.quantity) || 0), 0) || 0).toFixed(2));
                                            return (
                                                <td key={container.virtualId || container.id || container._id} className="px-2 py-3 text-center text-slate-700 border-r border-slate-200">
                                                    {totalWeight > 0 ? totalWeight.toFixed(2) : '-'}
                                                </td>
                                            );
                                        })}
                                        <td className="px-4 py-3 text-center text-white bg-blue-600 border-r border-blue-700 sticky right-0 z-40">
                                            {Object.values(itemTotals).reduce((a, b) => a + b, 0).toFixed(2)}
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}
            {/* Container Details Modal */}
            {
                selectedContainer && (
                    <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-[100] p-4 backdrop-blur-sm">
                        <div className="glass-card w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col animate-in fade-in zoom-in duration-200 border border-slate-200 shadow-xl bg-white">
                            <div className="flex justify-between items-center p-5 border-b border-slate-200 bg-slate-50">
                                <div>
                                    <div className="flex items-center gap-3">
                                        <h3 className="text-xl font-bold text-slate-800">Container #{selectedContainer.containerNo}</h3>
                                        {/* Date removed as per user request */}
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-12 gap-y-4 mt-4 text-sm">
                                        {selectedContainer.firm && (
                                            <div className="flex items-center">
                                                <span className="text-slate-500 font-medium w-32 shrink-0">Firm Name</span>
                                                <span className="font-bold text-slate-800">{selectedContainer.firm}</span>
                                            </div>
                                        )}
                                        {selectedContainer.containerWeight && (
                                            <div className="flex items-center">
                                                <span className="text-slate-500 font-medium w-32 shrink-0">Weight</span>
                                                <span className="font-bold text-slate-800 font-mono">
                                                    {parseFloat(selectedContainer.containerWeight || 0).toFixed(2)}
                                                </span>
                                            </div>
                                        )}
                                        {selectedContainer.assortmentWeight && (
                                            <div className="flex items-center">
                                                <span className="text-slate-500 font-medium w-32 shrink-0">Assortment Wt</span>
                                                <span className="font-bold text-slate-800 font-mono">
                                                    {parseFloat(selectedContainer.assortmentWeight).toFixed(2)}
                                                </span>
                                            </div>
                                        )}
                                        {(selectedContainer.workerCount !== undefined && selectedContainer.workerCount !== null) && (
                                            <>
                                                <div className="flex items-center">
                                                    <span className="text-slate-500 font-medium w-32 shrink-0">Worker Count</span>
                                                    <span className="font-bold text-slate-800 flex items-center justify-center w-8 h-8 rounded-full bg-slate-100">
                                                        {selectedContainer.workerCount}
                                                    </span>
                                                </div>
                                                {selectedContainer.workerCount > 0 && selectedContainer.containerWeight > 0 && (
                                                    <div className="flex items-center">
                                                        <span className="text-slate-500 font-medium w-32 shrink-0">Day Avg</span>
                                                        <span className="font-bold text-slate-800 font-mono">
                                                            {(parseFloat(selectedContainer.containerWeight) / parseFloat(selectedContainer.workerCount)).toFixed(2)}
                                                        </span>
                                                    </div>
                                                )}
                                                {selectedContainer.workerCount > 0 && selectedContainer.assortmentWeight > 0 && (
                                                    <div className="flex items-center">
                                                        <span className="text-slate-500 font-medium w-32 shrink-0">Worker Day Avg</span>
                                                        <span className="font-bold text-slate-800 font-mono">
                                                            {(parseFloat(selectedContainer.assortmentWeight) / parseFloat(selectedContainer.workerCount)).toFixed(2)}
                                                        </span>
                                                    </div>
                                                )}
                                            </>
                                        )}
                                        {selectedContainer.remarks && (
                                            <div className="flex items-center">
                                                <span className="text-slate-500 font-medium w-32 shrink-0">Scrap Type</span>
                                                <span className="font-bold text-slate-800 italic uppercase">"{selectedContainer.remarks}"</span>
                                            </div>
                                        )}
                                        {selectedContainer.vehicleNo && (
                                            <div className="flex items-center">
                                                <span className="text-slate-500 font-medium w-32 shrink-0">Vehicle No</span>
                                                <span className="font-bold text-slate-800">{selectedContainer.vehicleNo}</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <button
                                    onClick={() => setSelectedContainer(null)}
                                    className="p-2 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-colors"
                                >
                                    <X size={24} />
                                </button>
                            </div>

                            {/* Body */}
                            <div className="p-0 overflow-y-auto flex-1 scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-transparent">
                                <table className="min-w-full text-sm text-left">
                                    <thead className="bg-slate-50 sticky top-0 z-10 backdrop-blur-sm">
                                        <tr>
                                            <th className="px-6 py-3 font-semibold text-slate-600 border-b border-slate-200">Item Name</th>
                                            <th className="px-6 py-3 font-semibold text-slate-600 border-b border-slate-200 text-right">Quantity</th>
                                            <th className="px-6 py-3 font-semibold text-slate-600 border-b border-slate-200 text-right">Actual %</th>
                                            <th className="px-6 py-3 font-semibold text-slate-600 border-b border-slate-200 text-right">Expected %</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-200">
                                        {selectedContainer.items && selectedContainer.items.length > 0 ? (
                                            (() => {
                                                // Calculate Totals
                                                const totalAssortment = selectedContainer.items.reduce((sum, i) => sum + (parseFloat(i.quantity) || 0), 0);
                                                const totalContainer = parseFloat(selectedContainer.containerWeight) || 0;

                                                return selectedContainer.items
                                                    .filter(item => parseFloat(item.quantity) > 0)
                                                    .map((item, idx) => {
                                                        const qty = parseFloat(item.quantity) || 0;
                                                        const pctActual = totalAssortment > 0 ? ((qty / totalAssortment) * 100).toFixed(2) : '0.00';
                                                        const pctExpected = totalContainer > 0 ? ((qty / totalContainer) * 100).toFixed(2) : '0.00';

                                                        return (
                                                            <tr key={idx} className="hover:bg-slate-50">
                                                                <td className="px-6 py-3 font-medium text-slate-700">{item.itemName}</td>
                                                                <td className="px-6 py-3 text-right font-bold text-slate-800">{qty.toFixed(2)}</td>
                                                                <td className="px-6 py-3 text-right text-slate-500 text-xs font-medium bg-slate-50">
                                                                    {pctActual}%
                                                                </td>
                                                                <td className="px-6 py-3 text-right text-amber-600 text-xs font-medium bg-slate-50">
                                                                    {pctExpected}%
                                                                </td>
                                                            </tr>
                                                        );
                                                    });
                                            })()
                                        ) : (
                                            <tr>
                                                <td colSpan="3" className="px-6 py-8 text-center text-slate-500">No items found in this container</td>
                                            </tr>
                                        )}
                                    </tbody>
                                    <tfoot className="bg-slate-50 sticky bottom-0 backdrop-blur-sm">
                                        <tr>
                                            <td className="px-6 py-3 font-bold text-slate-800 border-t border-slate-200">Total Weight</td>
                                            <td className="px-6 py-3 text-right font-bold text-blue-600 border-t border-slate-200">
                                                {(selectedContainer.items?.reduce((sum, i) => sum + (parseFloat(i.quantity) || 0), 0) || 0).toFixed(2)}
                                            </td>
                                            <td className="px-6 py-3 border-t border-slate-200 bg-slate-50"></td>
                                            <td className="px-6 py-3 border-t border-slate-200 bg-slate-50"></td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>

                            {/* Footer */}
                            <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end gap-3">
                                <button
                                    onClick={() => setSelectedContainer(null)}
                                    className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg text-sm font-medium transition-colors border border-slate-300"
                                >
                                    Close
                                </button>
                                <div className="relative">
                                    <button
                                        onClick={() => setShowModalExportMenu(!showModalExportMenu)}
                                        className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-900 text-sm font-medium shadow-sm transition-colors"
                                    >
                                        <Download size={16} />
                                        Export
                                        <ChevronDown size={14} />
                                    </button>

                                    {showModalExportMenu && (
                                        <div className="absolute bottom-full right-0 mb-2 w-32 bg-white rounded-lg shadow-xl border border-slate-100 py-1 z-50 animate-in fade-in slide-in-from-bottom-2 duration-200">
                                            <button
                                                onClick={() => {
                                                    // Generate Excel
                                                    const totalWeightParam = parseFloat(selectedContainer.containerWeight) || selectedContainer.items.reduce((s, i) => s + (parseFloat(i.quantity) || 0), 0);
                                                    const sumQt = selectedContainer.items.reduce((s, i) => s + (parseFloat(i.quantity) || 0), 0);

                                                    const excelData = [
                                                        ["Container Details"],
                                                        ["Container No", selectedContainer.containerNo],
                                                        ["Date", formatDate(selectedContainer.unloadDate || selectedContainer.date)],
                                                        ["Firm", selectedContainer.firm || '-'],
                                                        ["Total Weight", selectedContainer.containerWeight || totalWeightParam],
                                                        ["Worker Count", selectedContainer.workerCount || 0],
                                                        ["Scrap Type", selectedContainer.remarks || '-'],
                                                        [], // Empty row
                                                        ["Item Name", "Quantity", "Percentage"] // Header
                                                    ];

                                                    selectedContainer.items.forEach(item => {
                                                        if (parseFloat(item.quantity) > 0) {
                                                            const qty = parseFloat(item.quantity);
                                                            const pct = totalWeightParam > 0 ? ((qty / totalWeightParam) * 100).toFixed(2) + '%' : '-';
                                                            excelData.push([item.itemName, qty, pct]);
                                                        }
                                                    });
                                                    // Add Total Row
                                                    excelData.push(["TOTAL", sumQt, ""]);

                                                    const ws = XLSX.utils.aoa_to_sheet(excelData);
                                                    const wb = XLSX.utils.book_new();
                                                    XLSX.utils.book_append_sheet(wb, ws, "Container Data");
                                                    XLSX.writeFile(wb, `Container_${selectedContainer.containerNo}.xlsx`);
                                                    setShowModalExportMenu(false);
                                                }}
                                                className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2 transition-colors"
                                            >
                                                <FileText size={14} className="text-green-600" />
                                                Excel
                                            </button>
                                            <button
                                                onClick={() => {
                                                    // Generate PDF
                                                    const doc = new jsPDF();
                                                    doc.text(`Container #${selectedContainer.containerNo}`, 14, 20);
                                                    doc.setFontSize(10);
                                                    doc.text(`Date: ${formatDate(selectedContainer.unloadDate || selectedContainer.date)}`, 14, 28);
                                                    doc.text(`Firm: ${selectedContainer.firm || '-'}`, 14, 34);
                                                    doc.text(`Total Weight: ${selectedContainer.containerWeight || '-'}`, 14, 40);

                                                    const tableColumn = ["Item Name", "Quantity", "Percentage"];
                                                    const tableRows = [];
                                                    const totalWeightParam = parseFloat(selectedContainer.containerWeight) || selectedContainer.items.reduce((s, i) => s + (parseFloat(i.quantity) || 0), 0);
                                                    const sumQt = selectedContainer.items.reduce((s, i) => s + (parseFloat(i.quantity) || 0), 0);

                                                    selectedContainer.items.forEach(item => {
                                                        if (parseFloat(item.quantity) > 0) {
                                                            const qty = parseFloat(item.quantity);
                                                            const pct = totalWeightParam > 0 ? ((qty / totalWeightParam) * 100).toFixed(2) + '%' : '-';
                                                            tableRows.push([item.itemName, qty, pct]);
                                                        }
                                                    });

                                                    // Add Total Row
                                                    tableRows.push(["TOTAL", sumQt.toFixed(2), ""]);

                                                    autoTable(doc, {
                                                        head: [tableColumn],
                                                        body: tableRows,
                                                        startY: 50,
                                                    });
                                                    doc.save(`Container_${selectedContainer.containerNo}.pdf`);
                                                    setShowModalExportMenu(false);
                                                }}
                                                className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2 transition-colors"
                                            >
                                                <FileText size={14} className="text-red-600" />
                                                PDF
                                            </button>
                                        </div>
                                    )}
                                </div>
                                <button
                                    onClick={() => navigate(`/entry/${selectedContainer.id || selectedContainer._id}?date=${selectedContainer.unloadDate || selectedContainer.date}`)}
                                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium shadow-sm transition-colors"
                                >
                                    <ExternalLink size={16} />
                                    Edit Full Entry
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Item Breakdown Modal */}
            {
                itemBreakdown && (
                    <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center z-[110] p-4 backdrop-blur-sm transition-opacity">
                        <div className="bg-white w-full max-w-xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-200 ring-1 ring-slate-900/5">

                            {/* Header */}
                            <div className="bg-gradient-to-r from-slate-50 to-white p-6 border-b border-slate-100 flex justify-between items-start">
                                <div>
                                    <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Item Breakdown</div>
                                    <h3 className="text-2xl font-bold text-slate-800 tracking-tight">{itemBreakdown.itemName}</h3>
                                    <div className="mt-3 inline-flex items-center gap-2 px-3 py-1 bg-blue-50 border border-blue-100 rounded-full text-blue-700 text-sm font-semibold shadow-sm">
                                        <span className="text-blue-500/80 uppercase text-xs tracking-wide">Total:</span>
                                        <span className="font-bold">{itemBreakdown.total.toFixed(2)}</span>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setItemBreakdown(null)}
                                    className="p-2 -mr-2 -mt-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-all"
                                >
                                    <X size={20} />
                                </button>
                            </div>

                            {/* Table Content */}
                            <div className="overflow-y-auto flex-1 p-0 scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
                                <table className="w-full text-left border-collapse">
                                    <thead className="bg-slate-50 sticky top-0 z-10 text-xs uppercase tracking-wider text-slate-500 font-semibold shadow-sm">
                                        <tr>
                                            <th className="px-6 py-4 border-b border-slate-200">Date</th>
                                            <th className="px-6 py-4 border-b border-slate-200">Cnt #</th>
                                            <th className="px-6 py-4 border-b border-slate-200">Firm</th>
                                            <th className="px-6 py-4 border-b border-slate-200 text-right">Quantity</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 text-sm bg-white">
                                        {itemBreakdown.entries.map((entry, idx) => (
                                            <tr key={idx} className="hover:bg-slate-50/80 transition-colors group">
                                                <td className="px-6 py-3.5 text-slate-600 font-medium">
                                                    {formatDate(entry.date)}
                                                </td>
                                                <td className="px-6 py-3.5">
                                                    <span className="inline-block px-2.5 py-1 bg-slate-100 border border-slate-200 rounded font-mono text-slate-700 text-xs font-bold group-hover:bg-white group-hover:border-slate-300 transition-colors shadow-sm">
                                                        {entry.containerNo}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-3.5 text-slate-600">
                                                    {entry.firm || <span className="text-slate-300">-</span>}
                                                </td>
                                                <td className="px-6 py-3.5 text-right">
                                                    <span className="font-bold text-slate-800 text-base">{parseFloat(entry.quantity).toFixed(2)}</span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* Footer */}
                            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end">
                                <button
                                    onClick={() => setItemBreakdown(null)}
                                    className="px-6 py-2.5 bg-white border border-slate-300 text-slate-700 rounded-xl hover:bg-slate-50 hover:border-slate-400 hover:shadow-sm text-sm font-semibold transition-all active:scale-[0.98]"
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
                isDeleteModalOpen && containerToDelete && (
                    <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-[80] p-4 backdrop-blur-sm">
                        <div className="bg-white rounded-xl shadow-xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                            <div className="p-6">
                                <div className="flex items-start gap-4">
                                    <div className="bg-red-100 p-3 rounded-full shrink-0">
                                        <AlertTriangle className="text-red-600" size={24} />
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-bold text-slate-900">Delete Entry?</h3>
                                        <p className="text-slate-600 mt-2 text-sm leading-relaxed">
                                            Are you sure you want to delete the entry for <span className="font-bold text-slate-800">#{containerToDelete.containerNo}</span> on <span className="font-bold text-slate-800">{formatDate(containerToDelete.date)}</span>?
                                        </p>
                                        <p className="text-slate-500 mt-2 text-xs">
                                            This action cannot be undone. Only this specific date entry will be removed.
                                        </p>
                                    </div>
                                </div>
                            </div>
                            <div className="bg-slate-50 px-6 py-4 flex justify-end gap-3 border-t border-slate-100">
                                <button
                                    onClick={() => { setIsDeleteModalOpen(false); setContainerToDelete(null); }}
                                    className="px-4 py-2 bg-white border border-slate-300 rounded-lg text-slate-700 text-sm font-medium hover:bg-slate-50 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={confirmDelete}
                                    className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 shadow-sm transition-colors"
                                >
                                    Delete Entry
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }


        </div >
    );
};

export default ContainerSummary;


