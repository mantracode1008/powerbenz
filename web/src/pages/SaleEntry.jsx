import React, { useState, useEffect, useRef } from 'react';
import { getItems, getSales, createSale, updateSale, deleteSale, getAvailableContainers, getUniqueValues, api } from '../services/api';
import { formatDate } from '../utils/dateUtils';
import CustomDatePicker from '../components/CustomDatePicker';
import StringCombo from '../components/StringCombo';
import {
    Plus, Trash2, Pencil, Search, Calendar, User, FileText, CheckCircle,
    AlertCircle, ChevronDown, ChevronUp, X,
    RotateCcw, Download, Hash, History
} from 'lucide-react';
import ConfirmationModal from '../components/ConfirmationModal';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import XLSX from 'xlsx-js-style';
import { useAuth } from '../context/AuthContext';
import { useLocation } from 'react-router-dom';

const SaleEntry = () => {
    const { user } = useAuth();
    const location = useLocation();

    // TAB STATE: 'entry' or 'history'
    const [activeTab, setActiveTab] = useState('entry');

    // DATA LOADING
    const [sales, setSales] = useState([]);
    const [masterItems, setMasterItems] = useState([]); // All available items from DB
    const [loading, setLoading] = useState(false);

    // INVOICE HEADER STATE
    const [invoiceData, setInvoiceData] = useState({
        date: new Date().toISOString().split('T')[0],
        buyerName: '',
        invoiceNo: '',
        hsnCode: '7204',
        broker: '' // Previously 'remarks'
    });

    // CART STATE (List of Items to Sell)
    const [cartItems, setCartItems] = useState([]);
    const [editingId, setEditingId] = useState(null);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false); // Modal state
    const [successData, setSuccessData] = useState(null); // Data for success screen

    // CONTAINER STOCK CACHE
    const [containerCache, setContainerCache] = useState({}); // { itemName: [containerGroups] }
    const [loadingStockFor, setLoadingStockFor] = useState(null); // itemName being loaded

    // HISTORY FILTERS
    const [historyFilter, setHistoryFilter] = useState('month'); // 'month', 'range'
    const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
    const [dateRange, setDateRange] = useState({ start: '', end: '' });
    const [searchTerm, setSearchTerm] = useState('');

    // MODALS
    const [modalConfig, setModalConfig] = useState({ isOpen: false, title: '', message: '', onConfirm: () => { } });

    useEffect(() => {
        fetchInitialData();
    }, []);

    // INITIALIZE CART FROM NAVIGATION
    useEffect(() => {
        if (location.state?.selectedItems && masterItems.length > 0) {
            console.log("Receiving items from navigation:", location.state.selectedItems);
            const importedItems = location.state.selectedItems.map(item => ({
                id: Date.now() + Math.random(),
                itemName: item.itemName,
                availableStock: item.currentStock || 0,
                quantity: '',
                rate: '',
                hsnCode: item.hsnCode || '7204',
                amount: 0,
                sourceContainers: [], // Specific container allocation
                isExpanded: false
            }));

            setCartItems(prev => {
                if (prev.length === 0) return importedItems;
                return prev;
            });

            // Prefetch stock for these items
            importedItems.forEach(i => fetchStockForItem(i.itemName));
        }
    }, [location.state, masterItems]);

    const fetchInitialData = async () => {
        setLoading(true);
        try {
            const [itemsRes, salesRes] = await Promise.all([getItems(), getSales({})]);
            setMasterItems(itemsRes.data);
            setSales(salesRes.data);
            setLoading(false);
        } catch (error) {
            console.error('Error fetching data:', error);
            setLoading(false);
        }
    };

    // --- STOCK LOGIC ---

    const fetchStockForItem = async (itemName) => {
        // if (containerCache[itemName]) return; // Allow refetch to ensure we get latest total

        // Find Item ID
        const itemObj = masterItems.find(i => i.name === itemName);
        if (!itemObj) return;

        try {
            setLoadingStockFor(itemName);
            const res = await getAvailableContainers(itemObj._id || itemObj.id);
            const validContainers = res.data.filter(c => parseFloat(c.remainingQuantity) > 0);

            // Calculate Total Global Stock
            const totalStock = validContainers.reduce((sum, c) => sum + parseFloat(c.remainingQuantity || 0), 0);

            // Group by Container No
            const groups = {};
            validContainers.forEach(c => {
                const no = c.Container?.containerNo || 'Unknown';
                if (!groups[no]) groups[no] = { containerNo: no, totalQty: 0, distinctItems: [] };
                groups[no].totalQty += parseFloat(c.remainingQuantity);
                groups[no].distinctItems.push(c);
            });

            const sortedGroups = Object.values(groups).sort((a, b) => {
                const na = parseFloat(a.containerNo);
                const nb = parseFloat(b.containerNo);
                if (!isNaN(na) && !isNaN(nb)) return na - nb;
                return a.containerNo.localeCompare(b.containerNo);
            });

            setContainerCache(prev => ({ ...prev, [itemName]: sortedGroups }));

            // UPDATE CART ITEM Display Stock
            setCartItems(prev => prev.map(item => {
                if (item.itemName === itemName) {
                    return { ...item, availableStock: totalStock };
                }
                return item;
            }));

        } catch (e) {
            console.error("Stock fetch error", e);
        } finally {
            setLoadingStockFor(null);
        }
    };

    // --- CART HANDLERS ---

    const updateCartItem = (id, field, value) => {
        setCartItems(prev => prev.map(item => {
            if (item.id === id) {
                const updated = { ...item, [field]: value };

                // Recalculate Amount
                if (field === 'quantity' || field === 'rate') {
                    const q = parseFloat(field === 'quantity' ? value : item.quantity) || 0;
                    const r = parseFloat(field === 'rate' ? value : item.rate) || 0;
                    updated.amount = q * r;
                }

                // If opening dropdown, ensure stock is fetched
                if (field === 'isExpanded' && value === true) {
                    fetchStockForItem(item.itemName);
                }

                return updated;
            }
            return item;
        }));
    };

    const removeCartItem = (id) => {
        setCartItems(prev => prev.filter(i => i.id !== id));
    };

    const handleContainerSelect = (cartId, group, allocateQty) => {
        setCartItems(prev => prev.map(item => {
            if (item.id !== cartId) return item;

            // Logic: Add/Update specific allocation
            // We need to map the 'allocateQty' to specific subItems in the group (FIFO within group)
            let remainingToAlloc = parseFloat(allocateQty);

            // Enforce limit: Cannot allocate more than available in this container group
            if (remainingToAlloc > group.totalQty) {
                remainingToAlloc = group.totalQty;
            }

            let newSource = [...item.sourceContainers];

            // Remove existing allocations for this group to overwrite
            newSource = newSource.filter(sc => sc.containerNo !== group.containerNo);

            if (remainingToAlloc > 0) {
                // Sort subItems by ID (Oldest first)
                const sortedSub = [...group.distinctItems].sort((a, b) => (a.id > b.id ? 1 : -1));

                for (const sub of sortedSub) {
                    if (remainingToAlloc <= 0.001) break;
                    const available = parseFloat(sub.remainingQuantity);
                    const take = Math.min(available, remainingToAlloc);

                    if (take > 0) {
                        newSource.push({
                            containerItemId: sub.id,
                            quantity: take,
                            containerNo: group.containerNo
                        });
                        remainingToAlloc -= take;
                    }
                }
            }

            // Update Total Quantity based on allocation? 
            // Ideally User types Total Qty, and then optionally selects containers.
            // OR User selects containers and Total Qty updates.
            // Let's go with: User sets Total Qty Manually normally. 
            // If they use Breakdown, we update Total Qty to match allocation sum.
            const totalAllocated = parseFloat(newSource.reduce((ppt, curr) => ppt + curr.quantity, 0).toFixed(3));

            return {
                ...item,
                sourceContainers: newSource,
                quantity: totalAllocated > 0 ? totalAllocated : item.quantity, // Auto update qty if allocating
                amount: (totalAllocated > 0 ? totalAllocated : (parseFloat(item.quantity) || 0)) * (parseFloat(item.rate) || 0)
            };
        }));
    };

    // --- SAVING ---

    const handleSaveInvoice = async () => {
        // Validation
        if (!invoiceData.buyerName) {
            alert("Please enter Buyer Name");
            return;
        }
        if (cartItems.length === 0) {
            alert("Cart is empty");
            return;
        }

        const invalidItems = cartItems.filter(i => !i.quantity || parseFloat(i.quantity) <= 0 || !i.rate);
        if (invalidItems.length > 0) {
            alert("Please ensure all items have valid Quantity and Rate");
            return;
        }

        // Processing
        try {
            setLoading(true);
            const payload = {
                date: invoiceData.date,
                buyerName: invoiceData.buyerName,
                invoiceNo: invoiceData.invoiceNo,
                remarks: invoiceData.broker, // Mapping Broker -> Remarks
                items: cartItems.map(item => ({
                    itemName: item.itemName,
                    quantity: item.quantity,
                    rate: item.rate,
                    hsnCode: invoiceData.hsnCode || '7204',
                    // Auto-allocate if no specific sourceContainers
                    sourceContainers: item.sourceContainers.length > 0 ? item.sourceContainers : undefined
                }))
            };

            if (editingId) {
                // Update
                const item = payload.items[0];
                const updatePayload = {
                    date: payload.date,
                    buyerName: payload.buyerName,
                    invoiceNo: payload.invoiceNo,
                    remarks: payload.remarks,
                    itemName: item.itemName,
                    quantity: item.quantity,
                    rate: item.rate,
                    hsnCode: item.hsnCode,
                    sourceContainers: item.sourceContainers
                };
                await updateSale(editingId, updatePayload);
                setSuccessData({ title: 'Invoice Updated!', type: 'update', ...payload });
            } else {
                // Create
                await createSale(payload);
                setSuccessData({ title: 'Invoice Created!', type: 'create', ...payload });
            }

            // Clean up state BEHIND the success screen so it's ready for next time
            setCartItems([]);
            // Keep invoice details for display in success screen, but clear them for next entry
            // We will actually clear them when the user clicks "Start New Invoice"

            setEditingId(null);
            setIsEditModalOpen(false);
            fetchInitialData();

        } catch (error) {
            console.error(error);
            alert("Failed to save: " + (error.response?.data?.message || error.message));
        } finally {
            setLoading(false);
        }
    };

    const handleEdit = (sale) => {
        setEditingId(sale._id || sale.id);
        const isoDate = sale.date ? new Date(sale.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];

        setInvoiceData({
            date: isoDate,
            buyerName: sale.buyerName,
            invoiceNo: sale.invoiceNo,
            hsnCode: sale.hsnCode || '7204',
            broker: sale.remarks || ''
        });

        const editingItem = {
            id: Date.now(),
            itemName: sale.itemName,
            quantity: sale.quantity,
            rate: sale.rate,
            amount: sale.totalAmount,
            sourceContainers: [], // Cannot easily restore exact breakdown without complex logic
            availableStock: 0,
            isExpanded: false
        };

        setCartItems([editingItem]);
        fetchStockForItem(sale.itemName);
        setIsEditModalOpen(true); // Open Modal
    };

    // --- COMBO HELPERS ---
    const fetchOptions = async (field, txt) => {
        try {
            // For Broker, we look at 'remarks' field in DB
            const dbField = field === 'broker' ? 'remarks' : field;
            const res = await getUniqueValues(dbField, txt);
            return { data: Array.isArray(res.data) ? res.data : [] };
        } catch (e) { return { data: [] }; }
    };

    // --- TOTALS ---
    const grandTotalQty = cartItems.reduce((acc, item) => acc + (parseFloat(item.quantity) || 0), 0);
    const grandTotalAmt = cartItems.reduce((acc, item) => acc + (parseFloat(item.amount) || 0), 0);


    // --- HISTORY RENDER ---
    const getFilteredHistory = () => {
        return sales.filter(s => {
            // Date Filter
            let dateMatch = true;
            if (historyFilter === 'month' && selectedMonth) {
                dateMatch = s.date.startsWith(selectedMonth);
            } else if (historyFilter === 'range' && dateRange.start && dateRange.end) {
                dateMatch = s.date >= dateRange.start && s.date <= dateRange.end;
            }

            // Search Filter
            const txt = searchTerm.toLowerCase();
            const searchMatch = !txt ||
                (s.buyerName?.toLowerCase().includes(txt)) ||
                (s.invoiceNo?.toLowerCase().includes(txt)) ||
                (s.remarks?.toLowerCase().includes(txt)) || // Broker check
                (s.itemName?.toLowerCase().includes(txt));

            return dateMatch && searchMatch;
        }).sort((a, b) => new Date(b.date) - new Date(a.date));
    };

    const getContainerInfo = (sale) => {
        if (!sale.allocations || sale.allocations.length === 0) return '-';
        const details = sale.allocations.map(a => {
            const container = a.ContainerItem?.Container;
            return container ? `${container.firm} (${container.containerNo})` : null;
        }).filter(Boolean);
        return [...new Set(details)].join(', ');
    };

    const handleExportExcel = () => {
        const filtered = getFilteredHistory();
        if (filtered.length === 0) {
            alert("No data to export");
            return;
        }

        const wb = XLSX.utils.book_new();

        // 1. Prepare Header
        const headers = ["Date", "Invoice No", "Buyer", "Broker", "Container Info", "Item", "Quantity (kg)", "Rate (Rs)", "Amount (Rs)", "HSN"];
        const dataRows = [];

        // 2. Prepare Data
        let lastInvoice = null;
        filtered.forEach(s => {
            const isSame = lastInvoice === s.invoiceNo;
            dataRows.push([
                isSame ? '' : formatDate(s.date),
                isSame ? '' : (s.invoiceNo || '-'),
                isSame ? '' : s.buyerName,
                isSame ? '' : (s.remarks || '-'), // Broker
                getContainerInfo(s),
                s.itemName,
                parseFloat(s.quantity),
                parseFloat(s.rate),
                parseFloat(s.totalAmount),
                s.hsnCode || '-'
            ]);
            if (!isSame) lastInvoice = s.invoiceNo;
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
                        fill: { fgColor: { rgb: "4F46E5" } }, // Indigo 600
                        alignment: { horizontal: "center", vertical: "center" },
                        border: { bottom: { style: "medium", color: { rgb: "FFFFFF" } } }
                    };
                }

                // Numeric Columns Alignment (Qty, Rate, Amount are indices 5, 6, 7)
                if (C >= 5 && C <= 7) {
                    ws[cell_ref].s.alignment.horizontal = "right";
                }
            }
        }

        // Adjust Column Widths
        ws['!cols'] = [
            { wch: 12 }, // Date
            { wch: 15 }, // Inv
            { wch: 25 }, // Buyer
            { wch: 15 }, // Broker
            { wch: 30 }, // Container Info
            { wch: 20 }, // Item
            { wch: 15 }, // Qty
            { wch: 12 }, // Rate
            { wch: 15 }, // Amount
            { wch: 10 }  // HSN
        ];

        XLSX.utils.book_append_sheet(wb, ws, "Sales History");
        XLSX.writeFile(wb, `Sales_Export_${historyFilter}${historyFilter === 'month' ? '_' + selectedMonth : ''}.xlsx`);
    };

    const handleDelete = (id) => {
        setModalConfig({
            isOpen: true,
            title: 'Delete Sale',
            message: 'Are you sure you want to delete this sale? Stock will be restored.',
            confirmText: 'Delete',
            confirmColor: 'bg-red-600',
            onConfirm: async () => {
                try {
                    await deleteSale(id);
                    fetchInitialData();
                    setModalConfig(prev => ({ ...prev, isOpen: false }));
                } catch (error) {
                    console.error(error);
                    alert('Failed to delete sale');
                    setModalConfig(p => ({ ...p, isOpen: false }));
                }
            }
        });
    };

    const generateInvoicePDF = async (data) => {
        const doc = new jsPDF();

        // --- THEME CONFIG ---
        const PRIMARY_COLOR = [26, 54, 93];   // #1a365d (Deep Royal Blue)
        const ACCENT_COLOR = [66, 153, 225]; // #4299e1 (Light Blue)
        const TEXT_COLOR = [45, 55, 72];   // #2d3748 (Dark Gray)
        const LIGHT_GRAY = [247, 250, 252];// #f7fafc (Very Light Gray)

        // --- HELPERS ---
        const loadImage = (url) => {
            return new Promise((resolve, reject) => {
                const img = new Image();
                img.src = url;
                img.onload = () => resolve(img);
                img.onerror = (e) => reject(e);
            });
        };

        // --- DRAWING ---

        // 1. Top Banner Line
        doc.setFillColor(...PRIMARY_COLOR);
        doc.rect(0, 0, 210, 8, 'F'); // Full width header line

        // 2. Company Identity (Left) & Invoice Title (Right)
        try {
            const logo = await loadImage('/invoice_logo.jpg');
            // Enlarged Logo (50x40 roughly for the new uploaded image aspect)
            doc.addImage(logo, 'JPEG', 14, 15, 60, 48);
        } catch (error) {
            // Fallback Logo
            doc.setFillColor(...PRIMARY_COLOR);
            doc.circle(30, 30, 15, 'F');
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(14);
            doc.setFont("helvetica", "bold");
            doc.text("PB", 30, 35, { align: "center" });
        }

        // Company Name (Moved below logo or to side? Left aligned under logo key details)
        doc.setFont("helvetica", "bold");
        doc.setFontSize(12);
        doc.setTextColor(...PRIMARY_COLOR);
        // doc.text("Power Benz Industries Pvt. Ltd.", 14, 60); // Skip text if logo is full

        // Address - Moved down
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(...TEXT_COLOR);
        doc.text("Plot 123, Industrial Est.", 14, 70);
        doc.text("Ahmedabad, GJ 380001", 14, 75);
        doc.text("contact@powerbenz.com", 14, 80);



        // Invoice Title & Big Number
        doc.setFont("helvetica", "bold");
        doc.setFontSize(32);
        doc.setTextColor(...LIGHT_GRAY);
        doc.setTextColor(200, 200, 200);
        doc.text("INVOICE", 196, 25, { align: "right" });

        doc.setTextColor(...PRIMARY_COLOR);
        doc.setFontSize(14);
        doc.text(`# ${data.invoiceNo || 'DRAFT'}`, 196, 35, { align: "right" });

        // 3. Info Bar (Dates)
        const infoY = 90;
        doc.setFillColor(...LIGHT_GRAY);
        doc.setDrawColor(230);
        doc.rect(14, infoY, 182, 18, 'FD'); // Box

        const drawLabelValue = (label, value, x) => {
            doc.setFontSize(8);
            doc.setTextColor(100);
            doc.setFont("helvetica", "bold");
            doc.text(label, x, infoY + 6);
            doc.setFontSize(10);
            doc.setTextColor(...TEXT_COLOR);
            doc.setFont("helvetica", "normal");
            doc.text(value, x, infoY + 13);
        };

        drawLabelValue("INVOICE DATE", formatDate(data.date), 20);
        drawLabelValue("DUE DATE", formatDate(data.date), 70); // Assuming immediate/same day
        drawLabelValue("BROKER / REF", data.remarks || '-', 120);

        // 4. Billing Info
        // 4. Billing Info
        const billY = 115;

        // "Bill To" Header
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...PRIMARY_COLOR);
        doc.text("BILL TO", 14, billY);

        doc.setDrawColor(200);
        doc.line(14, billY + 2, 100, billY + 2); // Underline

        // Client Details
        doc.setFontSize(11);
        doc.setTextColor(0); // Black for name
        doc.text(data.buyerName, 14, billY + 8);

        doc.setFontSize(9);
        doc.setTextColor(...TEXT_COLOR);
        doc.setFont("helvetica", "normal");
        // doc.text("Address Line 1...", 14, billY + 14); // Placeholder removed as requested

        // 5. Items Table
        // 5. Items Table
        const tableY = 140;

        const tableRows = data.items.map((item, i) => [
            { content: (i + 1).toString(), styles: { halign: 'center' } },
            { content: item.itemName, styles: { fontStyle: 'bold' } },
            { content: item.hsnCode || '-', styles: { halign: 'center' } },
            { content: parseFloat(item.quantity).toLocaleString('en-IN') + ' kg', styles: { halign: 'right' } },
            { content: parseFloat(item.rate).toFixed(2), styles: { halign: 'right' } },
            { content: (parseFloat(item.quantity) * parseFloat(item.rate)).toLocaleString('en-IN', { minimumFractionDigits: 2 }), styles: { halign: 'right' } }
        ]);

        autoTable(doc, {
            startY: tableY,
            head: [['#', 'ITEM DESCRIPTION', 'HSN', 'QUANTITY', 'RATE', 'AMOUNT']],
            body: tableRows,
            theme: 'grid',
            headStyles: {
                fillColor: PRIMARY_COLOR,
                textColor: 255,
                fontSize: 9,
                fontStyle: 'bold',
                halign: 'left',
                cellPadding: 3
            },
            bodyStyles: {
                textColor: TEXT_COLOR,
                fontSize: 9,
                cellPadding: 3,
                valign: 'middle'
            },
            alternateRowStyles: {
                fillColor: [249, 250, 251] // Very subtle gray
            },
            columnStyles: {
                0: { cellWidth: 10 },
                1: { cellWidth: 70 }, // Desc
                2: { cellWidth: 25 }, // HSN
                5: { fontStyle: 'bold', textColor: PRIMARY_COLOR }
            },
            margin: { left: 14, right: 14 }
        });

        // 6. Footer Section (Totals & Banks)
        const finalY = doc.lastAutoTable.finalY + 10;
        const totalQty = data.items.reduce((sum, i) => sum + parseFloat(i.quantity), 0);
        const totalAmt = data.items.reduce((sum, i) => sum + (parseFloat(i.quantity) * parseFloat(i.rate)), 0);

        // -- Bank Details Box Removed per request --
        // Using space for Signatory or Notes
        doc.setDrawColor(220);
        doc.setFillColor(252, 252, 252);
        doc.roundedRect(14, finalY, 100, 25, 2, 2, 'FD');

        doc.setFontSize(9);
        doc.setTextColor(...PRIMARY_COLOR);
        doc.setFont("helvetica", "bold");
        doc.text("NOTES", 20, finalY + 8);

        doc.setFontSize(8);
        doc.setTextColor(...TEXT_COLOR);
        doc.setFont("helvetica", "normal");
        doc.text("1. Interest @18% p.a. will be charged for delayed payment.", 20, finalY + 14);
        doc.text("2. Subject to Ahmedabad Jurisdiction.", 20, finalY + 19);

        // -- Totals (Right) --
        const rightX = 130;
        const valX = 196;
        let currY = finalY + 5;

        const drawTotalRow = (lbl, val, isBig) => {
            doc.setFontSize(isBig ? 12 : 10);
            doc.setFont("helvetica", isBig ? "bold" : "normal");
            doc.setTextColor(isBig ? PRIMARY_COLOR[0] : TEXT_COLOR[0], TEXT_COLOR[1], TEXT_COLOR[2]);
            doc.text(lbl, rightX, currY);
            doc.text(val, valX, currY, { align: "right" });
            currY += (isBig ? 10 : 7);
        };

        drawTotalRow("Total Quantity", `${totalQty.toLocaleString()} kg`);
        drawTotalRow("Subtotal", `Rs. ${totalAmt.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`);

        // Divider
        doc.setDrawColor(200);
        doc.line(rightX, currY - 2, valX, currY - 2);

        drawTotalRow("Grand Total", `Rs. ${totalAmt.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, true);

        // 7. Signatory
        const signY = finalY + 25;
        doc.setFontSize(9);
        doc.setTextColor(...TEXT_COLOR);
        doc.text("For, Power Benz Industries Pvt. Ltd.", 196, signY, { align: "right" });
        doc.text("Authorized Signatory", 196, signY + 20, { align: "right" });

        // 8. Bottom Footer
        const pageHeight = doc.internal.pageSize.height;
        doc.setFillColor(...PRIMARY_COLOR);
        doc.rect(0, pageHeight - 12, 210, 12, 'F');

        doc.setTextColor(255, 255, 255);
        doc.setFontSize(8);
        doc.text("Thank you for your business!", 105, pageHeight - 5, { align: "center" });

        doc.save(`Invoice_${data.invoiceNo || 'DRAFT'}.pdf`);
    };

    const handleDownloadHistoryInvoice = (sale) => {
        // We need to reconstruct the full invoice object from the individual sale items in history.
        // We group by InvoiceNo + Date + Buyer to identify the "Invoice".
        // Note: In case of duplicates, this logic assumes items with same details belong to same invoice.

        const saleDate = sale.date ? new Date(sale.date).toISOString().split('T')[0] : '';

        const invoiceItems = sales.filter(s => {
            const sDate = s.date ? new Date(s.date).toISOString().split('T')[0] : '';
            return s.invoiceNo === sale.invoiceNo &&
                sDate === saleDate &&
                s.buyerName === sale.buyerName;
        });

        const invoiceData = {
            invoiceNo: sale.invoiceNo,
            date: sale.date,
            buyerName: sale.buyerName,
            remarks: sale.remarks,
            items: invoiceItems.map(i => ({
                itemName: i.itemName,
                hsnCode: i.hsnCode, // Assuming this exists or we default
                quantity: i.quantity,
                rate: i.rate
            }))
        };

        generateInvoicePDF(invoiceData);
    };

    if (loading) return <div className="flex h-screen items-center justify-center"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div></div>;

    return (
        <div className="max-w-[1600px] mx-auto p-4 lg:p-6 bg-slate-50 min-h-screen font-sans">

            <ConfirmationModal
                isOpen={modalConfig.isOpen}
                onClose={() => setModalConfig(prev => ({ ...prev, isOpen: false }))}
                title={modalConfig.title}
                message={modalConfig.message}
                confirmText={modalConfig.confirmText}
                confirmColor={modalConfig.confirmColor}
                onConfirm={modalConfig.onConfirm}
            />

            {/* SUCCESS MODAL POPUP */}
            {successData && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200 relative">
                        {/* Close Button */}
                        <button
                            onClick={() => {
                                setSuccessData(null);
                                setCartItems([]);
                            }}
                            className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
                        >
                            <X size={20} />
                        </button>

                        <div className="p-8 text-center space-y-6">
                            {/* Icon */}
                            <div className="flex justify-center">
                                <div className="h-20 w-20 bg-green-100 rounded-full flex items-center justify-center shadow-lg shadow-green-200/50 animate-in zoom-in spin-in-12 duration-700">
                                    <CheckCircle className="text-green-600 w-10 h-10" strokeWidth={3} />
                                </div>
                            </div>

                            {/* Title */}
                            <div className="space-y-1">
                                <h1 className="text-2xl font-black text-slate-800 tracking-tight">{successData.title}</h1>
                                <p className="text-slate-500 text-sm font-medium">Recorded Successfully</p>
                            </div>

                            {/* Details Card */}
                            <div className="bg-slate-50 rounded-xl p-4 border border-slate-100/50 shadow-inner text-left space-y-3 text-sm">
                                <div className="flex justify-between items-center border-b border-slate-200/50 pb-2">
                                    <span className="text-slate-400 font-bold uppercase text-xs tracking-wider">Invoice No</span>
                                    <span className="font-mono font-bold text-slate-700">{successData.invoiceNo || 'N/A'}</span>
                                </div>
                                <div className="flex justify-between items-center border-b border-slate-200/50 pb-2">
                                    <span className="text-slate-400 font-bold uppercase text-xs tracking-wider">Buyer</span>
                                    <span className="font-bold text-slate-700 truncate max-w-[150px]">{successData.buyerName}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-slate-400 font-bold uppercase text-xs tracking-wider">Amount</span>
                                    <span className="font-black text-lg text-emerald-600">
                                        {(successData.items || []).reduce((sum, item) => sum + (parseFloat(item.quantity || 0) * parseFloat(item.rate || 0)), 0).toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}
                                    </span>
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="space-y-3">
                                <button
                                    onClick={() => generateInvoicePDF(successData)}
                                    className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-bold transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20 active:scale-95"
                                >
                                    <FileText size={18} /> Download Invoice
                                </button>

                                <div className="grid grid-cols-2 gap-3 pt-2">
                                    <button
                                        onClick={() => {
                                            setSuccessData(null);
                                            setInvoiceData(prev => ({ ...prev, invoiceNo: '', buyerName: '', broker: '' }));
                                            setCartItems([]);
                                            setActiveTab('entry');
                                        }}
                                        className="w-full bg-slate-100 hover:bg-slate-200 text-slate-600 py-3 rounded-xl font-bold text-sm transition-colors flex items-center justify-center gap-2"
                                    >
                                        <Plus size={16} /> New Sale
                                    </button>
                                    <button
                                        onClick={() => {
                                            setSuccessData(null);
                                            setInvoiceData(prev => ({ ...prev, invoiceNo: '', buyerName: '', broker: '' }));
                                            setCartItems([]);
                                            setActiveTab('history');
                                        }}
                                        className="w-full bg-slate-100 hover:bg-slate-200 text-slate-600 py-3 rounded-xl font-bold text-sm transition-colors flex items-center justify-center gap-2"
                                    >
                                        <RotateCcw size={16} /> History
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Decorative Gradient Bar */}
                        <div className="h-1.5 w-full bg-gradient-to-r from-emerald-400 to-blue-500"></div>
                    </div>
                </div>
            )}

            {/* TOP NAVIGATION */}
            <div className="flex justify-center w-full mb-8">
                <div className="bg-slate-100 p-1.5 rounded-full inline-flex items-center justify-center border border-slate-200">
                    <button
                        onClick={() => setActiveTab('entry')}
                        className={`flex items-center gap-2 px-8 py-3 rounded-full text-sm font-bold transition-all duration-200 ${activeTab === 'entry'
                            ? 'bg-white text-blue-600 shadow-sm ring-1 ring-black/5'
                            : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
                            }`}
                    >
                        <Plus size={18} className={activeTab === 'entry' ? 'text-blue-600' : 'text-slate-400'} strokeWidth={activeTab === 'entry' ? 2.5 : 2} />
                        New Sale Invoice
                    </button>
                    <button
                        onClick={() => setActiveTab('history')}
                        className={`flex items-center gap-2 px-8 py-3 rounded-full text-sm font-bold transition-all duration-200 ${activeTab === 'history'
                            ? 'bg-white text-blue-600 shadow-sm ring-1 ring-black/5'
                            : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
                            }`}
                    >
                        <FileText size={18} className={activeTab === 'history' ? 'text-blue-600' : 'text-slate-400'} strokeWidth={activeTab === 'history' ? 2.5 : 2} />
                        Sales History
                    </button>
                </div>
            </div>

            {/* SHARED FORM CONTENT */}
            {(() => {
                const entryFormContent = (
                    <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
                        {/* 1. Header Details (Combo) */}
                        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                            <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
                                <div>
                                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Invoice Date</label>
                                    <CustomDatePicker
                                        value={invoiceData.date}
                                        onChange={(e) => setInvoiceData({ ...invoiceData, date: e.target.value })}
                                    />
                                </div>
                                <div className="relative">
                                    <StringCombo
                                        label="Buyer Name"
                                        value={invoiceData.buyerName}
                                        onChange={(v) => setInvoiceData({ ...invoiceData, buyerName: v })}
                                        fetchOptions={(p) => fetchOptions('buyerName', p.search)}
                                        placeholder="Select Buyer"
                                        icon={User}
                                    />
                                </div>
                                <div className="relative">
                                    <StringCombo
                                        label="Invoice No"
                                        value={invoiceData.invoiceNo}
                                        onChange={(v) => setInvoiceData({ ...invoiceData, invoiceNo: v })}
                                        fetchOptions={(p) => fetchOptions('invoiceNo', p.search)}
                                        placeholder="e.g. 001/25-26"
                                        icon={FileText}
                                    />
                                </div>
                                <div className="relative">
                                    <StringCombo
                                        label="HSN Code"
                                        value={invoiceData.hsnCode}
                                        onChange={(v) => setInvoiceData({ ...invoiceData, hsnCode: v })}
                                        fetchOptions={(p) => fetchOptions('hsnCode', p.search)}
                                        placeholder="1234"
                                        icon={Hash}
                                    />
                                </div>
                                <div className="relative">
                                    <StringCombo
                                        label="Broker Name"
                                        value={invoiceData.broker}
                                        onChange={(v) => setInvoiceData({ ...invoiceData, broker: v })}
                                        fetchOptions={(p) => fetchOptions('broker', p.search)}
                                        placeholder="Select Broker"
                                        icon={User}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* 2. Items Cart */}
                        <div className="space-y-3">
                            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                                <FileText className="text-blue-600" size={20} /> Items to Sell
                            </h3>

                            {cartItems.length === 0 ? (
                                <div className="text-center py-12 bg-white rounded-xl border border-dashed border-slate-300">
                                    <p className="text-slate-400">No items selected. Go to <span className="font-bold text-blue-600 cursor-pointer" onClick={() => window.location.href = '/summary'}>Item Summary</span> to select items.</p>
                                </div>
                            ) : (
                                cartItems.map((item, index) => (
                                    <div key={item.id} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden transition-all duration-300">
                                        {/* Item Row Header - Clickable for Expansion */}
                                        <div
                                            className="p-4 flex flex-col md:flex-row md:items-center gap-4 bg-gradient-to-r from-white to-slate-50 cursor-pointer hover:bg-slate-50 transition-colors"
                                            onClick={() => updateCartItem(item.id, 'isExpanded', !item.isExpanded)}
                                        >

                                            {/* Item Info */}
                                            <div className="flex-1 min-w-[200px]">
                                                <div className="flex items-center gap-3">
                                                    <div className="h-8 w-8 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-sm">
                                                        {index + 1}
                                                    </div>
                                                    <div>
                                                        <h4 className="font-bold text-slate-800 text-lg">{item.itemName}</h4>
                                                        <p className="text-xs text-slate-500 font-medium">
                                                            Analyzed Available Stock: <span className="text-emerald-600 font-bold">{parseFloat(item.availableStock).toLocaleString()} kg</span>
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Inputs */}
                                            <div className="flex items-center gap-3 flex-1">
                                                <div className="flex-1">
                                                    <div className="relative">
                                                        <input
                                                            type="number"
                                                            placeholder="Qty"
                                                            className="w-full pl-3 pr-8 py-2 border border-slate-200 rounded-lg font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500/20"
                                                            value={item.quantity}
                                                            onClick={(e) => e.stopPropagation()}
                                                            onChange={(e) => updateCartItem(item.id, 'quantity', e.target.value)}
                                                        />
                                                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-bold">kg</span>
                                                    </div>
                                                </div>
                                                <div className="flex text-slate-300">x</div>
                                                <div className="flex-1">
                                                    <div className="relative">
                                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">₹</span>
                                                        <input
                                                            type="number"
                                                            placeholder="Rate"
                                                            className="w-full pl-6 pr-3 py-2 border border-slate-200 rounded-lg font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500/20"
                                                            value={item.rate}
                                                            onClick={(e) => e.stopPropagation()}
                                                            onChange={(e) => updateCartItem(item.id, 'rate', e.target.value)}
                                                        />
                                                    </div>
                                                </div>
                                                <div className="flex text-slate-300">=</div>
                                                <div className="flex-1 text-right font-bold text-slate-800">
                                                    {parseFloat(item.amount).toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}
                                                </div>
                                            </div>

                                            {/* Actions */}
                                            <div className="flex items-center gap-2 border-l border-slate-100 pl-4">
                                                {/* Expand Icon Indicator (Visual only) */}
                                                <div className={`p-2 rounded-lg transition-transform duration-300 ${item.isExpanded ? 'rotate-180 text-blue-600' : 'text-slate-400'}`}>
                                                    <ChevronDown size={20} />
                                                </div>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        removeCartItem(item.id);
                                                    }}
                                                    className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                                >
                                                    <Trash2 size={20} />
                                                </button>
                                            </div>
                                        </div>

                                        {/* Breakdown / Container Selection */}
                                        {item.isExpanded && (
                                            <div className="border-t border-slate-100 p-4 bg-slate-50/50">
                                                {loadingStockFor === item.itemName ? (
                                                    <div className="text-center py-4 text-xs text-slate-500">Loading Containers...</div>
                                                ) : (
                                                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                                                        {(containerCache[item.itemName] || []).map(group => {
                                                            const allocated = item.sourceContainers
                                                                .filter(s => s.containerNo === group.containerNo)
                                                                .reduce((sum, s) => sum + parseFloat(s.quantity || 0), 0);
                                                            return (
                                                                <div key={group.containerNo} className={`bg-white p-3 rounded-lg border ${allocated > 0 ? 'border-blue-500 ring-1 ring-blue-500/20' : 'border-slate-200'} cursor-pointer hover:border-blue-400 transition-all`}>
                                                                    <div className="flex justify-between items-center mb-2">
                                                                        <span className="text-[10px] font-bold bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">#{group.containerNo}</span>
                                                                        <span className="text-[10px] text-emerald-600 font-bold">{group.totalQty.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}kg</span>
                                                                    </div>
                                                                    <input
                                                                        type="number"
                                                                        className="w-full text-sm border-b border-slate-200 focus:border-blue-500 outline-none py-1 text-center font-bold text-blue-700 bg-transparent placeholder-slate-300"
                                                                        placeholder="0"
                                                                        value={allocated > 0 ? parseFloat(allocated.toFixed(3)) : ''}
                                                                        onChange={(e) => handleContainerSelect(item.id, group, e.target.value)}
                                                                    />
                                                                </div>
                                                            );
                                                        })}
                                                        {(!containerCache[item.itemName] || containerCache[item.itemName].length === 0) && (
                                                            <div className="col-span-full text-center text-xs text-slate-400 italic">No Stock Found</div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>

                        {/* 3. Footer Totals */}
                        {cartItems.length > 0 && (
                            <div className="sticky bottom-0 z-30 bg-white/90 backdrop-blur-md border-t border-slate-200 p-4 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] flex flex-col md:flex-row justify-between items-center animate-in slide-in-from-bottom-5">
                                <div className="flex gap-8 text-sm">
                                    <div>
                                        <span className="text-slate-500 block text-xs uppercase tracking-wider font-bold">Total Weight</span>
                                        <span className="font-bold text-xl text-slate-800">{grandTotalQty.toLocaleString()} kg</span>
                                    </div>
                                    <div>
                                        <span className="text-slate-500 block text-xs uppercase tracking-wider font-bold">Items</span>
                                        <span className="font-bold text-xl text-slate-800">{cartItems.length}</span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-6 mt-4 md:mt-0">
                                    <div className="text-right">
                                        <span className="text-slate-500 block text-xs uppercase tracking-wider font-bold">Total Amount</span>
                                        <span className="font-bold text-2xl text-emerald-700">{grandTotalAmt.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}</span>
                                    </div>
                                    <button
                                        onClick={handleSaveInvoice}
                                        className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-lg font-bold shadow-lg shadow-blue-600/20 transition-all active:scale-95 flex items-center gap-2"
                                    >
                                        <CheckCircle size={18} />
                                        {editingId ? 'Update Invoice' : 'Save Invoice'}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                );

                return (
                    <>
                        {/* TAB 1: NEW SALE ENTRY */}
                        {activeTab === 'entry' && entryFormContent}

                        {/* EDIT MODAL */}
                        {isEditModalOpen && (
                            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
                                <div className="bg-slate-50 w-full max-w-6xl max-h-[90vh] overflow-y-auto rounded-2xl shadow-2xl relative animate-in zoom-in-95 duration-200 border border-slate-200">
                                    <div className="sticky top-0 bg-white/80 backdrop-blur-md z-10 border-b border-slate-200 px-6 py-4 flex justify-between items-center">
                                        <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                                            <div className="p-2 bg-blue-100 rounded-lg text-blue-600">
                                                <Pencil size={20} />
                                            </div>
                                            Edit Sale Invoice
                                        </h2>
                                        <button
                                            onClick={() => {
                                                setIsEditModalOpen(false);
                                                setEditingId(null);
                                                setCartItems([]); // Clear cart on cancel if desired, or keep as draft? Better to clear to reset state.
                                            }}
                                            className="p-2 hover:bg-red-50 rounded-full text-slate-400 hover:text-red-500 transition-colors"
                                        >
                                            <X size={24} />
                                        </button>
                                    </div>
                                    <div className="p-6">
                                        {entryFormContent}
                                    </div>
                                </div>
                            </div>
                        )}
                    </>
                );
            })()}{/* === TAB 2: HISTORY === */}
            {activeTab === 'history' && (
                <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
                    {/* Filters Toolbar */}
                    <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col xl:flex-row justify-between items-center gap-4 animate-in slide-in-from-top-2">

                        {/* Title & Type Selector */}
                        <div className="flex items-center gap-4 w-full xl:w-auto">
                            <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl hidden md:block">
                                <History size={24} />
                            </div>
                            <div>
                                <h2 className="text-lg font-black text-slate-800 tracking-tight">Transaction History</h2>
                                <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200 mt-1 w-fit">
                                    {['month', 'range'].map((type) => (
                                        <button
                                            key={type}
                                            onClick={() => setHistoryFilter(type)}
                                            className={`px-3 py-1.5 rounded-md text-xs font-bold uppercase tracking-wider transition-all duration-200 ${historyFilter === type
                                                ? 'bg-white text-indigo-600 shadow-sm ring-1 ring-black/5'
                                                : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
                                                }`}
                                        >
                                            {type === 'range' ? 'Date Range' : type}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Controls */}
                        <div className="flex flex-col md:flex-row items-center gap-3 w-full xl:w-auto">
                            {/* Date Picker */}
                            <div className="w-full md:w-auto min-w-[200px]">
                                {historyFilter === 'month' ? (
                                    <div className="relative group">
                                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                                            <Calendar size={16} />
                                        </div>
                                        <CustomDatePicker
                                            onChange={(e) => setSelectedMonth(e.target.value.slice(0, 7))}
                                            value={`${selectedMonth}-01`}
                                            dateFormat="MMMM yyyy"
                                            showMonthYearPicker
                                            className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-semibold text-slate-700 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all shadow-sm hover:border-indigo-300"
                                        />
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-2 py-1.5 shadow-sm hover:border-indigo-300 transition-colors">
                                        <CustomDatePicker
                                            onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
                                            value={dateRange.start}
                                            placeholder="Start"
                                            className="w-24 text-xs font-semibold text-slate-700 border-none outline-none bg-transparent text-center"
                                        />
                                        <span className="text-slate-300">→</span>
                                        <CustomDatePicker
                                            onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
                                            value={dateRange.end}
                                            placeholder="End"
                                            className="w-24 text-xs font-semibold text-slate-700 border-none outline-none bg-transparent text-center"
                                        />
                                    </div>
                                )}
                            </div>

                            {/* Search */}
                            <div className="relative w-full md:w-auto">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                <input
                                    type="text"
                                    placeholder="Search Invoice..."
                                    className="w-full md:w-64 pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500/20 focus:bg-white transition-all shadow-sm focus:border-indigo-500"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>

                            <div className="hidden md:block w-px h-8 bg-slate-200 mx-1"></div>

                            {/* Export */}
                            <button
                                onClick={handleExportExcel}
                                className="flex items-center justify-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-bold shadow-sm hover:bg-slate-50 text-slate-600 transition-all active:translate-y-0.5 whitespace-nowrap"
                            >
                                <FileText size={16} className="text-green-600" />
                                <span className="hidden sm:inline">Export</span>
                            </button>
                        </div>
                    </div>

                    {/* Table */}
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50 text-xs font-bold text-slate-500 uppercase">
                                <tr>
                                    <th className="px-6 py-4">Date</th>
                                    <th className="px-6 py-4">Invoice</th>
                                    <th className="px-6 py-4">Buyer</th>
                                    <th className="px-6 py-4">Broker</th>
                                    <th className="px-6 py-4">Container</th>
                                    <th className="px-6 py-4">Item</th>
                                    <th className="px-6 py-4 text-right">Qty</th>
                                    <th className="px-6 py-4 text-right">Rate</th>
                                    <th className="px-6 py-4 text-right">Amount</th>
                                    <th className="px-6 py-4 text-center">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {getFilteredHistory().map((sale, i, arr) => {
                                    // Check if Previous Item belongs to same Invoice
                                    const isSameInvoice = i > 0 && arr[i - 1].invoiceNo === sale.invoiceNo;

                                    return (
                                        <tr key={i} className={`hover:bg-slate-50/80 transition-colors ${!isSameInvoice ? 'border-t-2 border-slate-200' : 'border-t border-slate-100'}`}>
                                            <td className="px-6 py-3 font-mono text-slate-500 whitespace-nowrap">
                                                {!isSameInvoice && formatDate(sale.date)}
                                            </td>
                                            <td className="px-6 py-3 font-medium text-slate-800">
                                                {!isSameInvoice && sale.invoiceNo}
                                            </td>
                                            <td className="px-6 py-3 text-slate-600">
                                                {!isSameInvoice && sale.buyerName}
                                            </td>
                                            <td className="px-6 py-3 text-slate-500 italic">
                                                {!isSameInvoice && (sale.remarks || '-')}
                                            </td>
                                            <td className="px-6 py-3 text-slate-600 text-xs">{getContainerInfo(sale)}</td>
                                            <td className="px-6 py-3 font-medium text-blue-600">{sale.itemName}</td>
                                            <td className="px-6 py-3 text-right font-bold text-slate-700">{parseFloat(sale.quantity).toLocaleString()}</td>
                                            <td className="px-6 py-3 text-right text-slate-500">{parseFloat(sale.rate).toFixed(2)}</td>
                                            <td className="px-6 py-3 text-right font-bold text-emerald-600">{parseFloat(sale.totalAmount).toLocaleString()}</td>
                                            <td className="px-6 py-3 text-center flex items-center justify-center gap-2">
                                                <button
                                                    onClick={() => handleDownloadHistoryInvoice(sale)}
                                                    className="text-slate-400 hover:text-green-600 transition-colors p-2 rounded-full hover:bg-green-50"
                                                    title="Download Invoice"
                                                >
                                                    <Download size={16} />
                                                </button>
                                                <button
                                                    onClick={() => handleEdit(sale)}
                                                    className="text-slate-400 hover:text-blue-600 transition-colors p-2 rounded-full hover:bg-blue-50"
                                                    title="Edit Sale"
                                                >
                                                    <Pencil size={16} />
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(sale._id || sale.id)}
                                                    className="text-slate-400 hover:text-red-600 transition-colors p-2 rounded-full hover:bg-red-50"
                                                    title="Delete Sale"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                                {getFilteredHistory().length === 0 && (
                                    <tr><td colSpan={10} className="text-center py-12 text-slate-400">No records found</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SaleEntry;
