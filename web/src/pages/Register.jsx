import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { Loader2, Mail, Lock, User, Phone, Eye, EyeOff, ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';

const Register = () => {
    const navigate = useNavigate();
    const { login } = useAuth();

    const [formData, setFormData] = useState({
        name: '',
        email: '',
        password: '',
        phone: ''
    });
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleRegister = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const res = await api.post('/auth/register', formData);
            const { token, user } = res.data;
            login(user, token);
            navigate('/');
        } catch (err) {
            setError(err.response?.data?.message || 'Registration failed. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center font-inter relative overflow-hidden">
            {/* FULL SCREEN BACKGROUND */}
            <motion.div
                initial={{ scale: 1.1 }}
                animate={{ scale: 1 }}
                transition={{ duration: 1.5, ease: "easeOut" }}
                className="absolute inset-0 z-0"
            >
                <div
                    className="absolute inset-0 bg-slate-900/40 z-10 backdrop-contrast-125" // Dark overlay for readability
                ></div>
                <div
                    className="w-full h-full bg-cover bg-center"
                    style={{
                        backgroundImage: `url('/login-new.jpg')`,
                    }}
                ></div>
            </motion.div>

            {/* Content Container */}
            <div className="relative z-20 w-full max-w-6xl mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-12">

                {/* Branding Section (Left Side) */}
                <motion.div
                    initial={{ opacity: 0, x: -50 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.8 }}
                    className="text-white hidden md:block max-w-lg"
                >
                    <div className="flex items-center gap-4 mb-6">
                        <div className="w-16 h-16 bg-blue-600/90 backdrop-blur-md rounded-2xl flex items-center justify-center shadow-2xl shadow-blue-500/20">
                            <svg className="w-10 h-10 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M12 2L2 7l10 5 10-5-10-5z" fill="currentColor" stroke="none" />
                                <path d="M2 17l10 5 10-5" />
                                <path d="M2 12l10 5 10-5" />
                            </svg>
                        </div>
                        <h1 className="text-5xl font-black tracking-tighter leading-tight drop-shadow-lg">
                            Scrap <span className="text-blue-400">System</span>
                        </h1>
                    </div>
                    <p className="text-lg text-slate-100 font-light leading-relaxed drop-shadow-md">
                        Streamline your inventory, sales, and reporting with our advanced management solution. Designed for efficiency.
                    </p>
                </motion.div>

                {/* Register Form Card */}
                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 30 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    transition={{ duration: 0.6, delay: 0.2 }}
                    className="w-full max-w-md bg-white/10 backdrop-blur-xl border border-white/20 p-8 rounded-3xl shadow-2xl shadow-black/20"
                >
                    <div className="text-center mb-8">
                        <h2 className="text-3xl font-bold tracking-tight text-white mb-2">Create Account</h2>
                        <p className="text-sm text-slate-200">Enter your details to get started</p>
                    </div>

                    {error && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            className="p-4 rounded-lg bg-red-500/20 border border-red-500/30 text-sm text-red-100 flex items-center gap-2 mb-6"
                        >
                            <div className="w-1.5 h-1.5 rounded-full bg-red-400"></div>
                            {error}
                        </motion.div>
                    )}

                    <form className="space-y-4" onSubmit={handleRegister}>
                        <div>
                            <label className="block text-sm font-medium text-slate-200 mb-1">Full Name</label>
                            <div className="relative group">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 group-focus-within:text-blue-400 transition-colors">
                                    <User size={18} />
                                </div>
                                <input
                                    type="text"
                                    name="name"
                                    required
                                    value={formData.name}
                                    onChange={handleChange}
                                    className="block w-full pl-10 pr-3 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/40 transition-all hover:bg-white/10"
                                    placeholder="Your Name"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-200 mb-1">Email</label>
                            <div className="relative group">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 group-focus-within:text-blue-400 transition-colors">
                                    <Mail size={18} />
                                </div>
                                <input
                                    type="email"
                                    name="email"
                                    required
                                    value={formData.email}
                                    onChange={handleChange}
                                    className="block w-full pl-10 pr-3 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/40 transition-all hover:bg-white/10"
                                    placeholder="name@example.com"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-200 mb-1">Phone</label>
                            <div className="relative group">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 group-focus-within:text-blue-400 transition-colors">
                                    <Phone size={18} />
                                </div>
                                <input
                                    type="tel"
                                    name="phone"
                                    value={formData.phone}
                                    onChange={handleChange}
                                    className="block w-full pl-10 pr-3 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/40 transition-all hover:bg-white/10"
                                    placeholder="+91..."
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-200 mb-1">Password</label>
                            <div className="relative group">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 group-focus-within:text-blue-400 transition-colors">
                                    <Lock size={18} />
                                </div>
                                <input
                                    type={showPassword ? "text" : "password"}
                                    name="password"
                                    required
                                    value={formData.password}
                                    onChange={handleChange}
                                    className="block w-full pl-10 pr-10 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/40 transition-all hover:bg-white/10"
                                    placeholder="Create a password"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-white transition-colors cursor-pointer"
                                >
                                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </div>
                        </div>

                        <motion.button
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            type="submit"
                            disabled={loading}
                            className="w-full flex justify-center items-center py-3.5 px-4 rounded-xl shadow-lg shadow-blue-600/30 text-sm font-bold text-white bg-blue-600 hover:bg-blue-500 transition-all mt-4"
                        >
                            {loading ? <Loader2 className="animate-spin h-5 w-5" /> : (
                                <>Create Account <ArrowRight size={18} className="ml-2" /></>
                            )}
                        </motion.button>
                    </form>

                    <div className="mt-8 text-center">
                        <p className="text-sm text-slate-300">
                            Already have an account?{' '}
                            <Link to="/login" className="font-bold text-blue-400 hover:text-blue-300 hover:underline">
                                Sign in
                            </Link>
                        </p>
                    </div>
                </motion.div>
            </div>
        </div>
    );
};

export default Register;
