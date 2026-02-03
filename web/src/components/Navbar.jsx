import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, PlusCircle, History, Package, FileText, Users, Shield, IndianRupee, LogOut } from 'lucide-react';

import { useAuth } from '../context/AuthContext';

const Navbar = () => {
    const { user, isSessionValid, logout } = useAuth();
    const navItems = [
        { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { path: '/entry', label: 'Assortment', icon: PlusCircle },
        { path: '/history', label: 'History', icon: History, permission: '/containers' },
        { path: '/summary', label: 'Summary', icon: Package },
        { path: '/sales', label: 'Sale', icon: FileText },
        { path: '/rates', label: 'Rate', icon: IndianRupee },
        { path: '/reports', label: 'Reports', icon: FileText },
        { path: '/staff', label: 'Staff', icon: Users },
        { path: '/logs', label: 'Audit Logs', icon: Shield },
    ];

    return (
        <nav className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-50">
            <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex justify-between items-center h-16">

                    {/* LEFT SIDE: Logo & Main Navigation */}
                    <div className="flex items-center gap-8 overflow-hidden">
                        {/* Logo */}
                        <div className="flex items-center gap-2 cursor-pointer flex-shrink-0" onClick={() => window.location.href = '/dashboard'}>
                            <div className="bg-blue-50 p-2 rounded-lg border border-blue-200">
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-600"><path d="M7 19a2 2 0 1 0-4 0 2 2 0 0 0 4 0Z" /><path d="M11 19a2 2 0 1 0-4 0 2 2 0 0 0 4 0Z" /><path d="M17 19a2 2 0 1 0-4 0 2 2 0 0 0 4 0Z" /><path d="M3 7h18" /><path d="M6 7v10" /><path d="M10 7v10" /><path d="M14 7v10" /><path d="M18 7v10" /></svg>
                            </div>
                            <span className="text-xl font-bold text-slate-800 tracking-tight hidden sm:block">
                                ScrapSys
                            </span>
                        </div>

                        {/* Session Warning */}
                        {!isSessionValid && (
                            <div
                                onClick={() => { logout(); window.location.href = '/login'; }}
                                className="flex items-center gap-2 bg-red-100 text-red-700 px-3 py-1.5 rounded-full text-xs font-bold cursor-pointer border border-red-200 animate-pulse flex-shrink-0"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" x2="12" y1="8" y2="12" /><line x1="12" x2="12.01" y1="16" y2="16" /></svg>
                                <span>Session Expired</span>
                            </div>
                        )}

                        {/* Main Navigation Links */}
                        <div className="hidden lg:flex items-center space-x-1">
                            {navItems.map((item) => {
                                if (user?.role !== 'Admin') {
                                    const allowed = user?.permissions || [];
                                    const requiredPermission = item.permission || item.path;
                                    if (!allowed.includes(requiredPermission)) return null;
                                }

                                return (
                                    <NavLink
                                        key={item.path}
                                        to={item.path}
                                        className={({ isActive }) =>
                                            `flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 whitespace-nowrap ${isActive
                                                ? 'bg-blue-50 text-blue-600 border border-blue-200 shadow-sm'
                                                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                                            }`
                                        }
                                    >
                                        <item.icon className="w-4 h-4 flex-shrink-0" />
                                        <span>{item.label}</span>
                                    </NavLink>
                                );
                            })}
                        </div>
                    </div>

                    {/* RIGHT SIDE: User Actions (Profile & Logout) */}
                    <div className="flex items-center gap-3 flex-shrink-0">
                        <NavLink
                            to="/profile"
                            className={({ isActive }) =>
                                `flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${isActive
                                    ? 'bg-slate-100 text-slate-800 ring-1 ring-slate-200'
                                    : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                                }`
                            }
                        >
                            <Users className="w-4 h-4" />
                            <span className="hidden md:inline">Profile</span>
                        </NavLink>

                        <div className="h-6 w-px bg-slate-200 hidden md:block"></div>

                        <button
                            onClick={logout}
                            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-bold text-red-600 bg-red-50 hover:bg-red-100 border border-red-100 transition-all duration-200"
                        >
                            <LogOut className="w-4 h-4" />
                            <span className="hidden md:inline">Logout</span>
                        </button>
                    </div>

                </div>
            </div>
        </nav>
    );
};

export default Navbar;
