import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LogOut, LayoutDashboard, PlusCircle, History, Package, FileText, Users, Shield, IndianRupee } from 'lucide-react';

const Welcome = () => {
    const { user, logout } = useAuth();
    const navigate = useNavigate();

    const MODULES = [
        { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard, adminOnly: true },
        { label: 'Assortment', path: '/entry', icon: PlusCircle },
        { label: 'History', path: '/history', permission: ['/containers', '/history'], icon: History },
        { label: 'Summary', path: '/summary', icon: Package },
        { label: 'Sale Entry', path: '/sales', icon: FileText },
        { label: 'Reports', path: '/reports', icon: FileText },
        { label: 'Staff Management', path: '/staff', icon: Users },
        { label: 'Audit Logs', path: '/logs', icon: Shield },
        { label: 'Rate Panel', path: '/rates', icon: IndianRupee },

    ];

    const permissions = user?.permissions || [];
    const role = user?.role;

    // Filter modules based on permission
    const allowedModules = MODULES.filter(m => {
        if (role === 'Admin') return true; // Admin sees all
        // For non-admins:
        const requiredPermission = m.permission || m.path;

        if (m.adminOnly) {
            if (Array.isArray(requiredPermission)) {
                return requiredPermission.some(p => permissions.includes(p));
            }
            return permissions.includes(requiredPermission);
        }
        if (m.alwaysShow) return true;

        if (Array.isArray(requiredPermission)) {
            return requiredPermission.some(p => permissions.includes(p));
        }
        return permissions.includes(requiredPermission);
    });

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col items-center p-6">
            <div className="w-full max-w-4xl">
                {/* Header */}
                <div
                    onClick={() => navigate('/profile')}
                    className="flex justify-between items-center mb-8 bg-white p-6 rounded-2xl shadow-sm border border-slate-200 cursor-pointer hover:shadow-md transition-shadow group"
                >
                    <div className="flex items-center gap-4">
                        <div className="bg-blue-100 p-3 rounded-full group-hover:bg-blue-200 transition-colors">
                            <span className="text-2xl">👋</span>
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-slate-800">Welcome, {user?.name || 'User'}!</h1>
                            <p className="text-slate-500 text-sm">Select a module to continue or click here for profile</p>
                        </div>
                    </div>
                    <button
                        onClick={logout}
                        className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors font-medium border border-red-100"
                    >
                        <LogOut size={16} />
                        Logout
                    </button>
                </div>

                {/* Modules Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">
                    {allowedModules.map((module) => (
                        <div
                            key={module.path}
                            onClick={() => navigate(module.path)}
                            className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 hover:shadow-md hover:border-blue-300 transition-all cursor-pointer group flex flex-col items-center text-center py-10"
                        >
                            <div className="p-4 bg-slate-50 rounded-full mb-4 group-hover:bg-blue-50 transition-colors">
                                <module.icon size={32} className="text-slate-600 group-hover:text-blue-600 transition-colors" />
                            </div>
                            <h3 className="font-semibold text-slate-800 text-lg group-hover:text-blue-600 transition-colors">{module.label}</h3>

                        </div>
                    ))}

                    {allowedModules.length === 0 && (
                        <div className="col-span-full text-center py-12 text-slate-500">
                            <p>You do not have access to any modules yet.</p>
                            <p className="text-sm">Please contact your administrator.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Welcome;
