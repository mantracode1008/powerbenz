import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { login as loginApi } from '../services/api';
import { Loader2, User, Lock, ArrowRight, ShieldCheck } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const Login = () => {
    const navigate = useNavigate();
    const { login } = useAuth();

    // VIEW STATE: 'pin-login' | 'password-login'
    // Default is now 'pin-login' with manual entry, no grid.
    const [view, setView] = useState('pin-login');

    // FORM STATE
    const [formData, setFormData] = useState({
        name: '', // For PIN Login (Name or Worker No)
        pin: '',
        email: '', // For Password Login
        password: ''
    });

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
        setError('');
    };

    const handlePinLogin = async (e) => {
        e.preventDefault();
        if (!formData.name || !formData.pin) {
            setError('Please enter both Name and PIN.');
            return;
        }

        setLoading(true);
        try {
            // Send 'name' instead of 'userId'
            const res = await loginApi({ name: formData.name, pin: formData.pin });
            const { token, user } = res.data;
            login(user, token);
            navigate('/');
        } catch (err) {
            console.error(err);
            setError(err.response?.data?.message || 'Invalid Name or PIN.');
        } finally {
            setLoading(false);
        }
    };

    const handlePasswordLogin = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            const res = await loginApi({ email: formData.email, password: formData.password });
            const { token, user } = res.data;
            login(user, token);
            navigate('/');
        } catch (err) {
            setError(err.response?.data?.message || 'Login failed.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center font-inter relative overflow-hidden bg-slate-900">
            {/* BACKGROUND */}
            <div className="absolute inset-0 z-0">
                <div className="absolute inset-0 bg-slate-900/70 z-10 backdrop-blur-[2px]"></div>
                <div
                    className="w-full h-full bg-cover bg-center opacity-40"
                    style={{ backgroundImage: `url('/login-new.jpg')` }}
                ></div>
            </div>

            {/* Content Container */}
            <div className="relative z-20 w-full max-w-lg mx-auto px-4 flex flex-col items-center justify-center gap-2">

                {/* Branding - Always Visible */}
                <div className="text-center mb-4">
                    {/* Increased size and removed circle container to let logo breathe */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.8, y: -20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        transition={{ duration: 0.8, ease: "easeOut" }}
                        className="mx-auto flex justify-center mb-1"
                    >
                        <div className="w-44 h-44 bg-white rounded-full flex items-center justify-center shadow-[0_0_30px_rgba(255,255,255,0.15)] border-4 border-white/20 overflow-hidden p-4">
                            <img src="/login_brand_logo.jpg" alt="logo" className="w-full h-full object-contain" />
                        </div>
                    </motion.div>
                </div>

                <AnimatePresence mode="wait">
                    {/* VIEW 1: PIN LOGIN (Manual Entry) */}
                    {view === 'pin-login' && (
                        <motion.div
                            key="pin-login"
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="w-full bg-slate-900/60 backdrop-blur-xl border border-white/10 p-8 rounded-3xl shadow-2xl"
                        >
                            <div className="text-center mb-8">
                                <h2 className="text-xl font-bold text-white">Staff Login</h2>
                                <p className="text-slate-400 text-sm">Enter your Name and PIN</p>
                            </div>

                            {error && (
                                <div className="p-3 rounded-lg bg-red-500/20 border border-red-500/30 text-sm text-red-100 mb-6 text-center animate-pulse">
                                    {error}
                                </div>
                            )}

                            <form onSubmit={handlePinLogin} className="space-y-5">
                                <div className="space-y-1">
                                    <label className="text-slate-300 text-sm font-medium ml-1">Name or Worker No</label>
                                    <div className="relative">
                                        <User className="absolute left-4 top-3.5 text-slate-400 w-5 h-5" />
                                        <input
                                            type="text"
                                            name="name"
                                            value={formData.name}
                                            onChange={handleChange}
                                            placeholder="e.g. Admin or W-101"
                                            className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-12 pr-4 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all font-medium"
                                            autoFocus
                                        />
                                    </div>
                                </div>

                                <div className="space-y-1">
                                    <label className="text-slate-300 text-sm font-medium ml-1">PIN</label>
                                    <div className="relative">
                                        <Lock className="absolute left-4 top-3.5 text-slate-400 w-5 h-5" />
                                        <input
                                            type="password"
                                            name="pin"
                                            value={formData.pin}
                                            onChange={handleChange}
                                            placeholder="Enter 4-6 digit PIN"
                                            maxLength={6}
                                            className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-12 pr-4 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all font-mono tracking-widest text-lg"
                                        />
                                    </div>
                                </div>

                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3.5 rounded-xl shadow-lg shadow-blue-900/20 transition-all flex items-center justify-center gap-2 group"
                                >
                                    {loading ? <Loader2 className="animate-spin w-5 h-5" /> : (
                                        <>
                                            Login <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                                        </>
                                    )}
                                </button>
                            </form>

                            <div className="mt-8 text-center border-t border-white/10 pt-4">
                                <button
                                    onClick={() => { setView('password-login'); setError(''); }}
                                    className="text-slate-400 hover:text-white text-xs font-medium transition-colors"
                                >
                                    Switch to Admin/Email Login
                                </button>
                            </div>
                        </motion.div>
                    )}

                    {/* VIEW 2: PASSWORD LOGIN */}
                    {view === 'password-login' && (
                        <motion.div
                            key="password-login"
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="w-full bg-slate-900/60 backdrop-blur-xl border border-white/10 p-8 rounded-3xl shadow-2xl"
                        >
                            <div className="text-center mb-8">
                                <h2 className="text-xl font-bold text-white">Admin Login</h2>
                                <p className="text-slate-400 text-sm">Enter email credentials</p>
                            </div>

                            {error && (
                                <div className="p-3 rounded-lg bg-red-500/20 border border-red-500/30 text-sm text-red-100 mb-6 text-center animate-pulse">
                                    {error}
                                </div>
                            )}

                            <form onSubmit={handlePasswordLogin} className="space-y-5">
                                <div className="space-y-1">
                                    <label className="text-slate-300 text-sm font-medium ml-1">Email</label>
                                    <div className="relative">
                                        <User className="absolute left-4 top-3.5 text-slate-400 w-5 h-5" />
                                        <input
                                            type="email"
                                            name="email"
                                            value={formData.email}
                                            onChange={handleChange}
                                            placeholder="admin@example.com"
                                            className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-12 pr-4 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-1">
                                    <label className="text-slate-300 text-sm font-medium ml-1">Password</label>
                                    <div className="relative">
                                        <ShieldCheck className="absolute left-4 top-3.5 text-slate-400 w-5 h-5" />
                                        <input
                                            type="password"
                                            name="password"
                                            value={formData.password}
                                            onChange={handleChange}
                                            placeholder="••••••••"
                                            className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-12 pr-4 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                                        />
                                    </div>
                                </div>

                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3.5 rounded-xl shadow-lg shadow-blue-900/20 transition-all flex items-center justify-center gap-2"
                                >
                                    {loading ? <Loader2 className="animate-spin w-5 h-5" /> : 'Sign In'}
                                </button>
                            </form>

                            <div className="mt-8 text-center border-t border-white/10 pt-4">
                                <button
                                    onClick={() => { setView('pin-login'); setError(''); }}
                                    className="text-slate-400 hover:text-white text-xs font-medium transition-colors"
                                >
                                    Switch to Staff PIN Login
                                </button>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
};

export default Login;
