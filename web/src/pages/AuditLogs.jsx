import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { Shield, Clock, Search, RefreshCw, AlertCircle, X } from 'lucide-react';

import { useLocation } from 'react-router-dom';

const AuditLogs = () => {
    const location = useLocation();
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState(location.state?.searchFilter || '');
    const [error, setError] = useState(null);

    useEffect(() => {
        const initialQuery = location.state?.searchFilter || '';
        if (location.state?.searchFilter) {
            setSearchTerm(initialQuery);
        }
        fetchLogs(initialQuery);
    }, [location.state]);

    const fetchLogs = async (query = '') => {
        setLoading(true);
        setError(null);
        try {
            const params = {};
            // If query is provided, use it. If not, check if searchTerm state exists (optional, mostly for refresh)
            const searchQuery = typeof query === 'string' ? query : searchTerm;
            if (searchQuery) params.search = searchQuery;

            const res = await api.get('/logs', { params });
            setLogs(res.data);
        } catch (error) {
            console.error('Failed to fetch logs', error);
            if (error.response && error.response.status === 403) {
                setError('Access Denied: You do not have permission to view audit logs.');
            } else {
                setError('Failed to load logs. Please try again.');
            }
        } finally {
            setLoading(false);
        }
    };

    const handleSearch = () => {
        fetchLogs(searchTerm);
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
            handleSearch();
        }
    };

    const [selectedLog, setSelectedLog] = useState(null);

    // Removed client-side filtering in favor of server-side search

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                        <Shield className="text-blue-600" />
                        System Audit Logs
                    </h1>
                    <p className="text-slate-500 text-sm">Track system access and changes</p>
                </div>
                <div className="flex gap-2 w-full md:w-auto">
                    <div className="relative flex-1 md:w-64">
                        <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Search logs (Press Enter)..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            onKeyDown={handleKeyDown}
                            className="pl-9 w-full p-2 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                    </div>
                    <button
                        onClick={() => fetchLogs(searchTerm)}
                        className="p-2 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                        title="Refresh Logs"
                    >
                        <RefreshCw size={20} className={`text-slate-600 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50 border-b border-slate-200 text-xs uppercase text-slate-500 font-semibold">
                                <th className="p-4">Time</th>
                                <th className="p-4">User</th>
                                <th className="p-4">Action</th>
                                <th className="p-4">Type</th>
                                <th className="p-4">Details</th>
                                <th className="p-4">IP Address</th>
                                <th className="p-4">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {error ? (
                                <tr>
                                    <td colSpan="7" className="p-8 text-center text-red-500 font-medium bg-red-50">
                                        <AlertCircle className="w-6 h-6 mx-auto mb-2 text-red-500" />
                                        {error}
                                    </td>
                                </tr>
                            ) : loading ? (
                                <tr>
                                    <td colSpan="7" className="p-8 text-center text-slate-500">Loading logs...</td>
                                </tr>
                            ) : logs.length === 0 ? (
                                <tr>
                                    <td colSpan="7" className="p-8 text-center text-slate-500">No logs found.</td>
                                </tr>
                            ) : (
                                logs.map(log => (
                                    <tr key={log.id} className="hover:bg-slate-50 transition-colors text-sm">
                                        <td className="p-4 text-slate-500 whitespace-nowrap">
                                            {new Date(log.createdAt).toLocaleString()}
                                        </td>
                                        <td className="p-4 font-medium text-slate-800">
                                            {log.staffName || 'Unknown'}
                                        </td>
                                        <td className="p-4">
                                            <span className={`px-2 py-1 rounded text-xs font-bold ${log.action === 'LOGIN' ? 'bg-green-100 text-green-700' :
                                                log.action === 'REGISTER' ? 'bg-blue-100 text-blue-700' :
                                                    'bg-slate-100 text-slate-700'
                                                }`}>
                                                {log.action}
                                            </span>
                                        </td>
                                        <td className="p-4 text-slate-600">{log.entityType}</td>
                                        <td className="p-4 text-slate-500 max-w-xs truncate" title={log.details}>
                                            {log.details ? (log.details.length > 30 ? log.details.substring(0, 30) + '...' : log.details) : '-'}
                                        </td>
                                        <td className="p-4 text-slate-400 text-xs font-mono">
                                            {log.ipAddress || '-'}
                                        </td>
                                        <td className="p-4">
                                            <button
                                                onClick={() => setSelectedLog(log)}
                                                className="text-blue-600 hover:text-blue-800 text-xs font-medium"
                                            >
                                                View
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Log Details Modal (Full Screen) */}
            {selectedLog && (
                <div className="fixed inset-0 bg-slate-900/50 z-50 backdrop-blur-sm">
                    <div className="fixed inset-0 bg-white shadow-2xl w-full h-full flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">

                        {/* Header */}
                        <div className="p-6 border-b border-slate-200 bg-slate-50 flex justify-between items-center shrink-0">
                            <div>
                                <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                                    <Shield className="text-blue-600 w-6 h-6" />
                                    Audit Log Details
                                </h3>
                                <p className="text-sm text-slate-500 mt-1">Transaction ID: {selectedLog.id}</p>
                            </div>
                            <button
                                onClick={() => setSelectedLog(null)}
                                className="p-2 bg-white rounded-full text-slate-400 hover:text-red-500 hover:bg-red-50 border border-slate-200 transition-all"
                            >
                                <X size={24} />
                            </button>
                        </div>

                        {/* Scrollable Content */}
                        <div className="flex-1 overflow-y-auto p-8 bg-slate-50/50">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                                <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm">
                                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">Action Type</label>
                                    <p className="text-lg font-bold text-blue-600">{selectedLog.action}</p>
                                </div>
                                <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm">
                                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">Performed By</label>
                                    <p className="text-lg font-medium text-slate-800 flex items-center gap-2">
                                        <div className="w-2 h-2 rounded-full bg-green-500"></div>
                                        {selectedLog.staffName || 'System'}
                                    </p>
                                </div>
                                <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm">
                                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">Timestamp</label>
                                    <p className="text-lg font-mono text-slate-700">{new Date(selectedLog.createdAt).toLocaleString()}</p>
                                </div>
                            </div>

                            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden h-full min-h-[400px] flex flex-col">
                                <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                                    <label className="text-sm font-bold text-slate-700 uppercase tracking-wider">Change Details (Diff)</label>
                                    <span className="text-xs text-slate-400 font-mono">JSON Format</span>
                                </div>
                                <div className="flex-1 p-0 overflow-hidden relative">
                                    <textarea
                                        readOnly
                                        className="w-full h-full p-6 font-mono text-sm text-slate-700 resize-none focus:outline-none bg-slate-50"
                                        value={typeof selectedLog.details === 'object' ? JSON.stringify(selectedLog.details, null, 4) : selectedLog.details}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="p-6 border-t border-slate-200 bg-white text-right shrink-0">
                            <button
                                onClick={() => setSelectedLog(null)}
                                className="px-6 py-2.5 bg-slate-800 text-white rounded-xl font-medium hover:bg-slate-900 transition-shadow shadow-lg shadow-slate-200"
                            >
                                Close Details
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AuditLogs;
