import React, { useState, useEffect } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area } from 'recharts';
import { IndianRupee, Package, Scale, TrendingUp, Users, LayoutDashboard } from 'lucide-react';
import { getDashboardStats } from '../services/api';
import { useAuth } from '../context/AuthContext';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#6366f1', '#8b5cf6', '#ec4899'];

// Custom Hook for Count Up Animation
const useCountUp = (end, duration = 2000) => {
    const [count, setCount] = useState(0);

    useEffect(() => {
        let startTimestamp = null;
        const step = (timestamp) => {
            if (!startTimestamp) startTimestamp = timestamp;
            const progress = Math.min((timestamp - startTimestamp) / duration, 1);
            setCount(Math.floor(progress * end));
            if (progress < 1) {
                window.requestAnimationFrame(step);
            }
        };
        window.requestAnimationFrame(step);
    }, [end, duration]);

    return count;
};

const StatCard = ({ title, value, icon: Icon, color, iconColor, subtext, onClick, isCurrency = false, suffix = '' }) => {
    // Parse value to number if it's a string, removes non-numeric chars except dot
    const numValue = typeof value === 'string' ? parseFloat(value.replace(/[^0-9.-]+/g, "")) : value;
    const finalValue = isNaN(numValue) ? 0 : numValue;
    const count = useCountUp(finalValue);

    // Format the number based on type
    const formatValue = (val) => {
        if (val === 0 && finalValue === 0) return "0";
        if (isCurrency) {
            return val.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
        }
        return val.toLocaleString('en-IN', { maximumFractionDigits: 0 });
    };

    return (
        <div
            onClick={onClick}
            className={`glass-card p-6 transition-all hover:bg-slate-50 border border-slate-200 bg-white ${onClick ? 'cursor-pointer hover:scale-[1.02] active:scale-95' : ''}`}
        >
            <div className="flex justify-between items-start">
                <div>
                    <p className="text-sm font-medium text-slate-500 mb-1">{title}</p>
                    <h3 className="text-2xl font-bold text-slate-800">
                        {formatValue(count)}{suffix && ` ${suffix}`}
                    </h3>
                </div>
                <div className={`p-3 rounded-xl ${color} bg-opacity-20`}>
                    <Icon className={`w-6 h-6 ${iconColor || color.replace('bg-', 'text-')}`} />
                </div>
            </div>
            {subtext && (
                <div className="mt-4 flex items-center text-sm text-slate-500">
                    <span className="truncate">{subtext}</span>
                </div>
            )}
        </div>
    );
};

const Dashboard = () => {
    const { user, loading: authLoading } = useAuth();
    const navigate = useNavigate();
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [chartView, setChartView] = useState('monthly');

    useEffect(() => {
        fetchStats();
    }, []);

    const fetchStats = async () => {
        try {
            const response = await getDashboardStats();
            setStats(response.data);
        } catch (error) {
            console.error('Error fetching dashboard stats:', error);
        } finally {
            setLoading(false);
        }
    };

    // Protect Dashboard: If not admin and no permission, redirect to welcome
    const isAdmin = user?.role === 'Admin';
    const hasDashboardAccess = user?.permissions && user.permissions.includes('/dashboard');
    const canViewRates = isAdmin || (user?.permissions && user.permissions.includes('/rates'));

    if (!authLoading && !isAdmin && !hasDashboardAccess) {
        return <React.Fragment><Navigate to="/welcome" replace /></React.Fragment>;
    }

    // While checking auth, show spinner
    if (authLoading) return <div className="p-4">Loading...</div>;

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    const { cards, charts } = stats;
    const currentChartData = chartView === 'monthly' ? charts.monthly : charts.daily;

    return (
        <div className="space-y-8">
            {/* Header Toolbar */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col xl:flex-row justify-between items-center gap-4 animate-in slide-in-from-top-2">

                {/* Title Section */}
                <div className="flex items-center gap-4 w-full xl:w-auto">
                    <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl hidden md:block">
                        <LayoutDashboard size={24} />
                    </div>
                    <div>
                        <h1 className="text-xl font-black text-slate-800 tracking-tight">Dashboard Overview</h1>
                        <div className="flex items-center gap-2 text-slate-500 text-xs font-medium mt-0.5">
                            <span className="flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                                Live Data
                            </span>
                            <span>•</span>
                            <span>Real-time tracking of ScrapSys operations</span>
                        </div>
                    </div>
                </div>

                {/* Right Side Info */}
                <div className="flex flex-col md:flex-row items-center gap-3 w-full xl:w-auto">
                    <div className="px-4 py-2 bg-slate-50 rounded-lg border border-slate-100 text-sm font-medium text-slate-600">
                        Welcome, <span className="text-slate-900 font-bold">{user?.name || 'User'}</span>
                    </div>
                </div>
            </div>

            {/* Summary Cards */}
            <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6`}>
                <StatCard
                    title="Total Purchase Stock"
                    value={parseFloat(cards.totalPurchaseWeight) || 0}
                    suffix="kg"
                    icon={Package}
                    color="bg-blue-500"
                    iconColor="text-slate-800"
                    subtext="Total Incoming Weight"
                    onClick={() => {
                        if (isAdmin || user?.permissions?.includes('/summary')) {
                            navigate('/summary', { state: { activeTab: 'container' } });
                        }
                    }}
                />

                <StatCard
                    title="Active Stock"
                    value={parseFloat(cards.totalWeight) || 0}
                    suffix="kg"
                    icon={Scale}
                    color="bg-orange-500"
                    iconColor="text-slate-800"
                    subtext="Available Quantity"
                    onClick={() => {
                        if (isAdmin || user?.permissions?.includes('/summary')) {
                            navigate('/summary', { state: { activeTab: 'item' } });
                        }
                    }}
                />

                <StatCard
                    title="Sales Summary"
                    value={parseFloat(cards.totalSalesWeight) || 0}
                    suffix="kg"
                    icon={TrendingUp}
                    color="bg-emerald-500"
                    iconColor="text-slate-800"
                    subtext="Total Outgoing Weight"
                    onClick={() => {
                        if (isAdmin || user?.permissions?.includes('/summary')) {
                            navigate('/summary', { state: { activeTab: 'sale' } });
                        }
                    }}
                />

                <StatCard
                    title="Total Buyers"
                    value={cards.totalBuyers || 0}
                    icon={Users}
                    color="bg-pink-500"
                    iconColor="text-slate-800"
                    subtext="Unique Customers"
                    onClick={() => {
                        if (isAdmin || user?.permissions?.includes('/summary')) {
                            navigate('/summary', { state: { activeTab: 'sale' } });
                        }
                    }}
                />

                <StatCard
                    title="Total Containers"
                    value={cards.totalContainers}
                    icon={Package}
                    color="bg-purple-500"
                    iconColor="text-slate-800"
                    subtext="Total Entries"
                    onClick={() => {
                        if (isAdmin || user?.permissions?.includes('/summary')) {
                            navigate('/summary', { state: { activeTab: 'container' } });
                        }
                    }}
                />
            </div>

            {/* Charts */}
            <div className={`grid grid-cols-1 ${canViewRates ? 'lg:grid-cols-2' : ''} gap-8`}>
                {canViewRates && (
                    <div className="glass-card p-6 border border-slate-200 bg-white">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-lg font-bold text-slate-800">Purchase vs Sales Trend</h3>
                            <div className="flex bg-slate-100 rounded-lg p-1 border border-slate-200">
                                <button
                                    onClick={() => setChartView('monthly')}
                                    className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${chartView === 'monthly' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'
                                        }`}
                                >
                                    Monthly
                                </button>
                                <button
                                    onClick={() => setChartView('daily')}
                                    className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${chartView === 'daily' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'
                                        }`}
                                >
                                    Daily
                                </button>
                            </div>
                        </div>
                        <div className="h-[300px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={currentChartData.length === 1 ? [{ name: 'Start', Purchase: 0, Sales: 0 }, ...currentChartData] : currentChartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="colorPurchase" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} /> {/* Blue-500 */}
                                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                        </linearGradient>
                                        <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} /> {/* Emerald-500 */}
                                            <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                    <XAxis
                                        dataKey="name"
                                        axisLine={false}
                                        tickLine={false}
                                        tick={{ fill: '#94a3b8', fontSize: 12 }}
                                        dy={10}
                                    />
                                    <YAxis
                                        axisLine={false}
                                        tickLine={false}
                                        tick={{ fill: '#94a3b8', fontSize: 12 }}
                                    />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: '#ffffff', borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px -2px rgba(0,0,0,0.1)' }}
                                        formatter={(value) => `${value.toLocaleString('en-IN')} kg`}
                                    />
                                    <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px' }} />

                                    <Area
                                        type="monotone"
                                        dataKey="Purchase"
                                        stroke="#3b82f6"
                                        strokeWidth={3}
                                        fillOpacity={1}
                                        fill="url(#colorPurchase)"
                                        activeDot={{ r: 6, strokeWidth: 0, fill: '#3b82f6' }}
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey="Sales"
                                        stroke="#10b981"
                                        strokeWidth={3}
                                        fillOpacity={1}
                                        fill="url(#colorSales)"
                                        activeDot={{ r: 6, strokeWidth: 0, fill: '#10b981' }}
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                )}

                {/* Purchase Items Value Chart Removed as per client request */}

                {canViewRates && (
                    <div className="glass-card p-6 border border-slate-200 bg-white">
                        <h3 className="text-lg font-bold text-slate-800 mb-6">Top Sold Items by Value</h3>
                        <div className="h-[300px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={charts.salesByItem} layout="vertical" margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
                                    <defs>
                                        <linearGradient id="colorSalesItem" x1="0" y1="0" x2="1" y2="0">
                                            <stop offset="0%" stopColor="#10b981" stopOpacity={1} />
                                            <stop offset="100%" stopColor="#059669" stopOpacity={1} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#e2e8f0" opacity={0.8} />
                                    <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                                    <YAxis dataKey="name" type="category" width={100} axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                                    <Tooltip
                                        cursor={{ fill: 'rgba(0,0,0,0.05)' }}
                                        contentStyle={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', color: '#1e293b', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                        formatter={(value) => value.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}
                                    />
                                    <Bar dataKey="value" fill="url(#colorSalesItem)" radius={[0, 4, 4, 0]} barSize={20} name="Sales Value" />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                )}



                <div className="glass-card p-6 border border-slate-200 bg-white">
                    <h3 className="text-lg font-bold text-slate-800 mb-6">Item Distribution (%)</h3>
                    <div className="h-[300px] w-full">
                        {charts.distribution && charts.distribution.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={charts.distribution}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={60}
                                        outerRadius={100}
                                        paddingAngle={5}
                                        dataKey="value"
                                        nameKey="name"
                                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(2)}%`}
                                    >
                                        {charts.distribution?.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip
                                        contentStyle={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', color: '#1e293b', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                        formatter={(value, name, props) => [`${parseFloat(value).toFixed(2)} (${props.payload.sharePercent}%)`, name]}
                                    />
                                    <Legend
                                        layout="vertical"
                                        verticalAlign="middle"
                                        align="right"
                                        wrapperStyle={{ fontSize: '12px', color: '#475569' }}
                                    />
                                </PieChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="flex h-full items-center justify-center text-slate-400 text-sm">
                                No distribution data available
                            </div>
                        )}
                    </div>
                </div>

                <div className="glass-card p-6 border border-slate-200 bg-white">
                    <h3 className="text-lg font-bold text-slate-800 mb-6">Current Stock Levels</h3>
                    <div className="h-[300px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={charts.stock} margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" opacity={0.8} />
                                <XAxis
                                    dataKey="name"
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fill: '#64748b', fontSize: 10 }}
                                    interval={0}
                                    angle={-45}
                                    textAnchor="end"
                                    height={60}
                                />
                                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                                <Tooltip
                                    cursor={{ fill: 'rgba(0,0,0,0.05)' }}
                                    contentStyle={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', color: '#1e293b', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                    formatter={(value) => parseFloat(value).toFixed(2)}
                                />
                                <Bar dataKey="stock" radius={[6, 6, 0, 0]} barSize={30} name="Stock Quantity">
                                    {charts.stock?.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>
        </div >
    );
};

export default Dashboard;
