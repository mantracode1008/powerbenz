import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, PlusCircle, History, Package, FileText, Users, Shield, IndianRupee, LogOut, TrendingUp, RefreshCw } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const Sidebar = ({ isMobile = false }) => {
    const { user, isSessionValid, logout } = useAuth();

    const navItems = [
        { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { path: '/entry', label: 'Assortment', icon: PlusCircle },
        { path: '/history', label: 'History', icon: History, permission: ['/containers', '/history'] },
        { path: '/summary', label: 'Summary', icon: Package },
        { path: '/sales', label: 'Sale', icon: TrendingUp },
        { path: '/rates', label: 'Rate', icon: IndianRupee },
        { path: '/reports', label: 'Reports', icon: FileText },
        { path: '/staff', label: 'Staff', icon: Users },
        { path: '/logs', label: 'Audit Logs', icon: Shield },
    ];

    return (
        <aside className={`${isMobile ? 'h-full w-full' : 'fixed inset-y-0 left-0 z-40 w-[90px] hover:w-72 border-r border-slate-200'} bg-white flex flex-col transition-all duration-300 group font-inter shadow-xl hover:shadow-2xl overflow-hidden`}>
            {/* Logo Section */}
            <div className="h-24 flex items-center border-b border-slate-100 whitespace-nowrap overflow-hidden px-6">
                <div className="flex items-center w-full justify-center lg:group-hover:justify-start cursor-pointer transition-all duration-300" onClick={() => window.location.href = '/dashboard'}>
                    {/* Collapsed State: Logo Badge */}
                    <div className={`shrink-0 ${isMobile ? 'hidden' : 'group-hover:hidden'} flex items-center justify-center w-10 h-10`}>
                        <img src="/project_main_logo.jpg" alt="Logo" className="w-full h-full object-contain rounded-lg shadow-lg shadow-slate-900/20" />
                    </div>

                    {/* Expanded State: Logo + Text */}
                    <div className={`${isMobile ? 'flex' : 'hidden group-hover:flex'} items-center gap-3`}>
                        <img src="/project_main_logo.jpg" alt="Logo" className="h-10 w-10 object-contain" />
                        <div>
                            <h1 className="text-lg font-black text-slate-800 tracking-tight leading-none">POWERBENZ</h1>
                            <p className="text-[10px] font-bold text-slate-500 tracking-wider">INDUSTRIES PVT. LTD.</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Session Warning */}
            {!isSessionValid && (
                <div className="px-6 py-4">
                    <div
                        onClick={() => { logout(); window.location.href = '/login'; }}
                        className="flex items-center gap-4 bg-red-50 text-red-600 px-3 py-3 rounded-xl text-xs font-bold cursor-pointer border border-red-100 hover:bg-red-100 transition-colors animate-pulse whitespace-nowrap overflow-hidden"
                    >
                        <div className="bg-red-200 p-1.5 rounded-full shrink-0">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" x2="12" y1="8" y2="12" /><line x1="12" x2="12.01" y1="16" y2="16" /></svg>
                        </div>
                        <div className={`${isMobile ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity duration-300`}>
                            <p className="uppercase tracking-wide text-[10px]">Warning</p>
                            <p className="text-sm">Session Expired</p>
                        </div>
                    </div>
                </div>
            )}

            {/* Navigation Items */}
            <div className="flex-1 overflow-y-auto px-3 py-6 space-y-2 scrollbar-hide overflow-x-hidden">
                <div className={`px-6 mb-2 text-xs font-bold text-slate-400 uppercase tracking-widest ${isMobile ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity duration-300 whitespace-nowrap`}>Main Menu</div>
                {navItems.map((item) => {
                    if (user?.role !== 'Admin') {
                        const allowed = user?.permissions || [];
                        const requiredPermission = item.permission || item.path;

                        if (Array.isArray(requiredPermission)) {
                            // If any of the required permissions are present
                            const hasAccess = requiredPermission.some(p => allowed.includes(p));
                            if (!hasAccess) return null;
                        } else {
                            if (!allowed.includes(requiredPermission)) return null;
                        }
                    }

                    return (
                        <NavLink
                            key={item.path}
                            to={item.path}
                            title={item.label}
                            className={({ isActive }) =>
                                `flex items-center gap-4 px-6 py-3.5 rounded-xl text-sm font-bold transition-all duration-200 whitespace-nowrap ${isActive
                                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-200'
                                    : 'text-slate-500 hover:bg-slate-50 hover:text-blue-600'
                                }`
                            }
                        >
                            {({ isActive }) => (
                                <>
                                    <item.icon className="w-6 h-6 shrink-0" strokeWidth={2.5} />
                                    <span className={`${isMobile ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity duration-300 delay-75`}>
                                        {item.label}
                                    </span>
                                </>
                            )}
                        </NavLink>
                    );
                })}
            </div>

            {/* Footer / Profile Section */}
            <div className="p-0 mt-auto border-t border-slate-100 bg-slate-50/50 whitespace-nowrap overflow-hidden">
                <NavLink to="/profile" className="flex items-center gap-4 px-6 py-4 hover:bg-white hover:shadow-sm border-y border-transparent hover:border-slate-200 transition-all duration-200 group">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-sm shadow-md shrink-0 transition-transform duration-300 group-hover:scale-105">
                        {user?.name ? user.name.charAt(0).toUpperCase() : 'U'}
                    </div>
                    <div className={`${isMobile ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity duration-300`}>
                        <p className="text-sm font-bold text-slate-800 truncate">{user?.name || 'User'}</p>
                        <p className="text-xs font-medium text-slate-500 truncate">{user?.role || 'Guest'}</p>
                    </div>
                </NavLink>

                <button
                    onClick={logout}
                    className="w-full flex items-center gap-4 px-6 py-4 text-sm font-bold text-red-600 hover:bg-red-50 transition-all duration-200"
                >
                    <LogOut className="w-6 h-6 shrink-0" strokeWidth={2.5} />
                    <span className={`${isMobile ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity duration-300`}>Logout</span>
                </button>
            </div>
        </aside>
    );
};

export default Sidebar;
