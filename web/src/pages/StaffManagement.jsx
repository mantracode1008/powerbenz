import React, { useState, useEffect } from 'react';
import { getStaff, createStaff, updateStaff, deleteStaff } from '../services/api';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { ChevronDown, Trash2, Edit, Plus, User, FileText, X, Shield, Download, History, CheckCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const StaffManagement = () => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const [staffList, setStaffList] = useState([]);
    const [showExportMenu, setShowExportMenu] = useState(false);

    // Staff Management State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingStaff, setEditingStaff] = useState(null);
    const [formData, setFormData] = useState({
        name: '',
        role: 'Worker',
        phone: '',
        dailyWage: '',
        workerNo: '',
        email: '',
        password: '',
        pin: '',
        permissions: []
    });

    const AVAILABLE_MODULES = [
        { label: 'Dashboard', path: '/dashboard' },
        { label: 'Container Entry', path: '/entry' },
        { label: 'Container History', path: '/history' },
        { label: 'Items & Stock', path: '/summary' },
        { label: 'Sales', path: '/sales' },
        { label: 'Rate Panel', path: '/rates' },
        { label: 'Reports', path: '/reports' },
        { label: 'Staff Management', path: '/staff' },
        { label: 'Audit Logs', path: '/logs' }
    ];

    useEffect(() => {
        fetchStaff();
    }, []);

    const fetchStaff = async () => {
        try {
            const response = await getStaff();
            setStaffList(response.data);
        } catch (error) {
            console.error('Error fetching staff:', error);
        }
    };

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handlePermissionChange = (path) => {
        setFormData(prev => {
            let current = prev.permissions || [];
            if (current.includes(path)) {
                return { ...prev, permissions: current.filter(p => p !== path) };
            } else {
                return { ...prev, permissions: [...current, path] };
            }
        });
    };

    const [showSuccess, setShowSuccess] = useState(false);
    const [successMessage, setSuccessMessage] = useState('');

    const openSuccess = (msg) => {
        setSuccessMessage(msg);
        setShowSuccess(true);
    };

    const closeSuccess = () => {
        setShowSuccess(false);
        setSuccessMessage('');
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const payload = {
                ...formData,
                permissions: formData.permissions || [],
                dailyWage: formData.dailyWage === '' ? 0 : formData.dailyWage
            };

            if (editingStaff) {
                await updateStaff(editingStaff.id, payload);
                openSuccess('Staff Updated Successfully!');
            } else {
                await createStaff(payload);
                openSuccess('Staff Created Successfully!');
            }
            fetchStaff();
            closeModal();
        } catch (error) {
            console.error('Error saving staff:', error);
            alert('Failed to save staff member');
        }
    };

    const handleDelete = async (id) => {
        if (window.confirm('Are you sure you want to delete this staff member?')) {
            try {
                await deleteStaff(id);
                fetchStaff();
            } catch (error) {
                console.error('Error deleting staff:', error);
            }
        }
    };

    const openModal = (staff = null) => {
        if (staff) {
            setEditingStaff(staff);
            let safePermissions = [];
            if (Array.isArray(staff.permissions)) {
                safePermissions = staff.permissions;
            } else if (typeof staff.permissions === 'string') {
                try { safePermissions = JSON.parse(staff.permissions); } catch (e) { safePermissions = []; }
            }

            setFormData({
                name: staff.name,
                role: staff.role,
                phone: staff.phone || '',
                dailyWage: staff.dailyWage || '',
                workerNo: staff.workerNo || '',
                email: staff.email || '',
                password: '',
                pin: '',
                permissions: safePermissions
            });
        } else {
            setEditingStaff(null);
            setFormData({
                name: '',
                role: 'Worker',
                phone: '',
                dailyWage: '',
                workerNo: '',
                email: '',
                password: '',
                pin: '',
                permissions: []
            });
        }
        setIsModalOpen(true);
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setEditingStaff(null);
    };

    const viewHistory = (staffName) => {
        navigate('/logs', { state: { searchFilter: staffName } });
    };

    const exportStaffExcel = () => {
        const dataToExport = staffList.map(staff => ({
            'Worker No': staff.workerNo,
            'Name': staff.name,
            'Role': staff.role,
            'Phone': staff.phone,
            'Status': staff.isActive ? 'Active' : 'Inactive'
        }));
        const ws = XLSX.utils.json_to_sheet(dataToExport);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Staff List");
        XLSX.writeFile(wb, "Staff_List.xlsx");
    };

    const exportStaffPDF = () => {
        const doc = new jsPDF();
        doc.text("Staff List Report", 14, 20);
        const tableColumn = ["Worker No", "Name", "Role", "Phone", "Status"];
        const tableRows = staffList.map(staff => [
            staff.workerNo || '-',
            staff.name,
            staff.role,
            staff.phone || '-',
            staff.isActive ? 'Active' : 'Inactive'
        ]);
        autoTable(doc, { head: [tableColumn], body: tableRows, startY: 30 });
        doc.save("Staff_List.pdf");
    };

    return (
        <div className="p-6 space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800">Staff Management</h1>
                    <p className="text-slate-500 text-sm mt-1">Manage users, roles, and access permissions</p>
                </div>
                <div className="flex gap-2">

                    <button onClick={() => openModal()} className="bg-blue-600 text-white px-4 py-2 rounded-xl flex items-center gap-2 hover:bg-blue-700 shadow-sm transition-colors">
                        <Plus size={20} /> Add Staff
                    </button>
                </div>
            </div>

            <div className="glass-card rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <table className="min-w-full divide-y divide-slate-200">
                    <thead className="bg-slate-50">
                        <tr>
                            <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Worker No</th>
                            <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Name</th>
                            <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Role</th>
                            <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Phone</th>
                            <th className="px-6 py-4 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                        {staffList.map((staff) => (
                            <tr key={staff.id} className="hover:bg-slate-50 transition-colors group">
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600 font-medium">
                                    {staff.workerNo || '-'}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <div className="flex items-center cursor-pointer group/item" onClick={() => openModal(staff)}>
                                        <div className="flex-shrink-0 h-10 w-10 bg-blue-50 rounded-full flex items-center justify-center group-hover/item:bg-blue-100 transition-colors border border-blue-100">
                                            <span className="text-blue-600 font-bold text-sm">
                                                {staff.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
                                            </span>
                                        </div>
                                        <div className="ml-4">
                                            <div className="text-sm font-medium text-slate-800 group-hover/item:text-blue-600 transition-colors">{staff.name}</div>
                                            <div
                                                className="text-xs text-slate-500 hover:text-blue-700 flex items-center gap-1 mt-0.5 w-fit"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    viewHistory(staff.name);
                                                }}
                                            >
                                                <History size={10} /> View History
                                            </div>
                                        </div>
                                    </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <span className="px-2 py-1 text-xs font-medium rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                                        {staff.role}
                                    </span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">{staff.phone || '-'}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                    <div className="flex justify-end gap-2">
                                        {(!staff.isActive) && (
                                            <button
                                                onClick={async () => {
                                                    if (window.confirm(`Approve access for ${staff.name}?`)) {
                                                        await updateStaff(staff.id, { isActive: true });
                                                        fetchStaff();
                                                    }
                                                }}
                                                className="text-green-600 hover:text-green-800 bg-green-50 hover:bg-green-100 px-3 py-1 rounded text-xs font-bold transition-colors border border-green-200"
                                            >
                                                Approve
                                            </button>
                                        )}
                                        <button onClick={() => viewHistory(staff.name)} className="text-slate-400 hover:text-blue-600 transition-colors" title="View History">
                                            <Shield size={18} />
                                        </button>
                                        <button onClick={() => openModal(staff)} className="text-slate-400 hover:text-blue-600 transition-colors">
                                            <Edit size={18} />
                                        </button>
                                        <button onClick={() => handleDelete(staff.id)} className="text-slate-400 hover:text-red-600 transition-colors">
                                            <Trash2 size={18} />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                        {staffList.length === 0 && (
                            <tr>
                                <td colSpan="5" className="px-6 py-12 text-center text-slate-500">
                                    <User className="w-12 h-12 mx-auto text-slate-400 mb-3" />
                                    <p>No staff members found.</p>
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Success Modal (Popup Card) */}
            {showSuccess && (
                <div className="fixed inset-0 bg-slate-900/40 z-[60] backdrop-blur-sm flex items-center justify-center animate-in fade-in duration-300">
                    <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-full text-center border border-slate-100 animate-in zoom-in-95 duration-300">
                        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <CheckCircle className="w-8 h-8 text-green-600" strokeWidth={3} />
                        </div>
                        <h2 className="text-xl font-bold text-slate-800 mb-2">{successMessage}</h2>
                        <p className="text-slate-500 mb-6 text-sm">Changes saved successfully.</p>

                        <button
                            onClick={closeSuccess}
                            className="bg-slate-900 text-white w-full py-2.5 rounded-xl font-semibold hover:bg-slate-800 transition-colors"
                        >
                            Continue
                        </button>
                    </div>
                </div>
            )}

            {/* Add/Edit Modal (Large Popup) */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-slate-900/60 z-50 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white w-full max-w-5xl rounded-2xl shadow-2xl flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200 overflow-hidden">
                        <div className="flex justify-between items-center p-6 border-b border-slate-100 shrink-0">
                            <h2 className="text-xl font-bold text-slate-800">{editingStaff ? 'Edit Staff' : 'Add New Staff'}</h2>
                            <button onClick={closeModal} className="text-slate-400 hover:text-slate-600 transition-colors">
                                <X size={24} />
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto bg-slate-50 p-6 md:p-8">
                            <div className="max-w-full mx-auto">
                                <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">

                                    {/* Column 1: Personal Info */}
                                    <div className="space-y-6">
                                        <h3 className="text-lg font-bold text-slate-800 border-b pb-2 mb-4">Personal Details</h3>
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-1">Name</label>
                                            <input
                                                type="text"
                                                name="name"
                                                value={formData.name}
                                                onChange={handleInputChange}
                                                required
                                                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 placeholder-slate-400 font-medium"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-1">Role</label>
                                            <select
                                                name="role"
                                                value={formData.role}
                                                onChange={handleInputChange}
                                                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800"
                                            >
                                                <option value="Worker">Worker</option>
                                                <option value="Supervisor">Supervisor</option>
                                                <option value="Manager">Manager</option>
                                                <option value="Driver">Driver</option>
                                                <option value="Admin">Admin</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-1">Phone</label>
                                            <input
                                                type="tel"
                                                name="phone"
                                                value={formData.phone}
                                                onChange={handleInputChange}
                                                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 placeholder-slate-400"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-1">Worker No</label>
                                            <input
                                                type="text"
                                                name="workerNo"
                                                value={formData.workerNo}
                                                onChange={handleInputChange}
                                                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 placeholder-slate-400"
                                            />
                                        </div>
                                    </div>

                                    {/* Column 2: Account & Permissions */}
                                    <div className="space-y-6">
                                        <h3 className="text-lg font-bold text-slate-800 border-b pb-2 mb-4">Account & Access</h3>
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-1">Email (For Login)</label>
                                            <input
                                                type="email"
                                                name="email"
                                                value={formData.email}
                                                onChange={handleInputChange}
                                                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 placeholder-slate-400"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-1">Login PIN</label>
                                            <input
                                                type="text"
                                                name="pin"
                                                value={formData.pin || ''}
                                                onChange={(e) => {
                                                    const val = e.target.value.replace(/[^0-9]/g, '').slice(0, 6);
                                                    setFormData(prev => ({ ...prev, pin: val }));
                                                }}
                                                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 placeholder-slate-400 font-mono text-center tracking-widest text-lg"
                                                placeholder="Enter New PIN"
                                            />
                                            <p className="text-xs text-slate-500 mt-1">4-6 digit numeric PIN for login.</p>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-2">Access Permissions</label>
                                            <div className="grid grid-cols-2 gap-3 max-h-48 overflow-y-auto p-3 bg-slate-50 rounded-xl border border-slate-200 custom-scrollbar">
                                                {AVAILABLE_MODULES.map((module) => (
                                                    <label key={module.path} className="flex items-center space-x-2 p-2 rounded-lg hover:bg-white transition-colors cursor-pointer border border-transparent hover:border-slate-200 group">
                                                        <input
                                                            type="checkbox"
                                                            checked={(formData.permissions || []).includes(module.path)}
                                                            onChange={() => handlePermissionChange(module.path)}
                                                            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4"
                                                        />
                                                        <span className="text-sm text-slate-700 group-hover:text-slate-900 font-medium">{module.label}</span>
                                                    </label>
                                                ))}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Action Buttons (Full Width at Bottom) */}
                                    <div className="md:col-span-2 pt-6 flex justify-end gap-4 border-t border-slate-100 mt-4">
                                        <button
                                            type="button"
                                            onClick={closeModal}
                                            className="px-6 py-3 text-slate-600 hover:bg-white rounded-xl font-bold border border-slate-200 transition-colors"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            type="submit"
                                            className="px-8 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 font-bold shadow-lg shadow-blue-200 transition-all hover:scale-[1.02] active:scale-[0.98]"
                                        >
                                            {editingStaff ? 'Update Staff Member' : 'Create Staff Member'}
                                        </button>
                                    </div>

                                </form>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default StaffManagement;
