import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { updateStaff, getStaff } from '../services/api';
import {
    User,
    Phone,
    Mail,
    Lock,
    Save,
    Loader2,
    LogOut,
    Camera
} from 'lucide-react';
import { motion } from 'framer-motion';

const Profile = () => {
    const { user, login, logout } = useAuth();

    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState({ type: '', text: '' });

    const [formData, setFormData] = useState({
        name: '',
        email: '',
        phone: '',
        password: '',
        confirmPassword: ''
    });

    useEffect(() => {
        if (user) {
            setFormData(prev => ({
                ...prev,
                name: user.name || '',
                email: user.email || '',
                phone: user.phone || '',
                // Only reset password fields if we are switching users (which shouldn't happen often)
                // or on initial load. We use functional update to preserve typed passwords if this unexpectedly runs?
                // Actually, just relying on user.id is safest for "Load Once".
                password: '',
                confirmPassword: ''
            }));
            fetchFreshData();
        }
    }, [user?.id]);

    const fetchFreshData = async () => {
        try {
            const res = await getStaff();
            const myData = res.data.find(u => u.id === user.id);
            if (myData) {
                setFormData(prev => ({
                    ...prev,
                    name: myData.name,
                    email: myData.email,
                    phone: myData.phone || ''
                }));
            }
        } catch (err) {
            console.error("Failed to fetch profile data", err);
        }
    };

    const handleChange = (e) => {
        const { name, value } = e.target;
        if (name === 'phone') {
            const numericValue = value.replace(/[^0-9]/g, '').slice(0, 10);
            setFormData({ ...formData, [name]: numericValue });
        } else {
            setFormData({ ...formData, [name]: value });
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setMessage({ type: '', text: '' });

        if (formData.password && formData.password !== formData.confirmPassword) {
            setMessage({ type: 'error', text: 'Passwords do not match!' });
            return;
        }

        setSaving(true);
        try {
            const payload = {
                name: formData.name,
                email: formData.email,
                phone: formData.phone
            };

            if (formData.password) {
                payload.password = formData.password;
            }

            await updateStaff(user.id, payload);

            const token = localStorage.getItem('token');
            login({ ...user, name: formData.name, email: formData.email }, token);

            setMessage({ type: 'success', text: 'Profile updated successfully!' });
            setFormData(prev => ({ ...prev, password: '', confirmPassword: '' }));
        } catch (err) {
            setMessage({ type: 'error', text: 'Failed to update profile.' });
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="max-w-6xl mx-auto p-4 md:p-8 font-inter">
            {/* Header / Title Section */}
            <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-8"
            >
                <h1 className="text-3xl font-bold text-slate-800">Account Settings</h1>
                <p className="text-slate-500 mt-1">Manage your profile details and security preferences.</p>
            </motion.div>

            <div className="flex flex-col md:flex-row gap-8 items-start">

                {/* Left Card: Profile Overview */}
                <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1 }}
                    className="w-full md:w-1/3 bg-white rounded-3xl p-6 shadow-xl shadow-slate-200/50 border border-slate-100 flex flex-col items-center text-center"
                >
                    <div className="relative group mb-6">
                        <div className="w-32 h-32 rounded-full bg-slate-100 p-1 ring-4 ring-white shadow-lg overflow-hidden flex items-center justify-center">
                            {user?.name ? (
                                <div className="w-full h-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-4xl font-bold text-white">
                                    {user.name.charAt(0).toUpperCase()}
                                </div>
                            ) : (
                                <User size={48} className="text-slate-400" />
                            )}
                        </div>
                        <button className="absolute bottom-1 right-1 p-2 bg-white rounded-full shadow-md text-slate-600 hover:text-blue-600 transition-colors border border-slate-200">
                            <Camera size={16} />
                        </button>
                    </div>

                    <h2 className="text-xl font-bold text-slate-900">{user?.name || 'User'}</h2>
                    <span className="px-3 py-1 my-2 bg-blue-50 text-blue-700 text-xs font-bold uppercase tracking-wider rounded-full border border-blue-100">
                        {user?.role || 'Member'}
                    </span>
                    <p className="text-slate-500 text-sm mb-6">{user?.email}</p>

                    <button
                        type="button"
                        onClick={logout}
                        className="w-full py-3 rounded-xl border border-red-100 text-red-600 bg-red-50 hover:bg-red-100 transition-all font-bold flex items-center justify-center gap-2 group"
                    >
                        <LogOut size={18} className="group-hover:translate-x-1 transition-transform" />
                        Sign Out
                    </button>
                </motion.div>

                {/* Right Card: Edit Form */}
                <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.2 }}
                    className="w-full md:w-2/3 bg-white rounded-3xl p-8 shadow-xl shadow-slate-200/50 border border-slate-100"
                >
                    <div className="flex items-center justify-between mb-8 pb-4 border-b border-slate-100">
                        <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                            <User className="text-blue-600" size={20} />
                            Edit Profile
                        </h3>
                        {message.text && (
                            <motion.div
                                initial={{ opacity: 0, x: 10 }}
                                animate={{ opacity: 1, x: 0 }}
                                className={`text-sm px-4 py-1.5 rounded-full font-semibold ${message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}
                            >
                                {message.text}
                            </motion.div>
                        )}
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-8">
                        {/* Section 1: Personal Info */}
                        <div className="space-y-4">
                            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Personal Information</h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <InputField label="Full Name" name="name" icon={User} value={formData.name} onChange={handleChange} placeholder="Your name" />
                                <InputField label="Email Address" name="email" icon={Mail} value={formData.email} onChange={handleChange} placeholder="email@example.com" />
                                <InputField label="Phone Number" name="phone" icon={Phone} value={formData.phone} onChange={handleChange} placeholder="Mobile number" />
                            </div>
                        </div>

                        {/* Section 2: Security */}
                        <div className="space-y-4 pt-4">
                            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Security & Password</h4>
                            <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <PasswordInput label="New Password" name="password" value={formData.password} onChange={handleChange} placeholder="Leave blank to keep current" />
                                    <PasswordInput label="Confirm Password" name="confirmPassword" value={formData.confirmPassword} onChange={handleChange} placeholder="Confirm new password" />
                                </div>
                            </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="pt-4 flex justify-end">
                            <button
                                type="submit"
                                disabled={saving}
                                className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 px-8 rounded-xl shadow-lg shadow-blue-600/20 transition-all active:scale-[0.98] flex items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                            >
                                {saving ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
                                Save Changes
                            </button>
                        </div>
                    </form>
                </motion.div>
            </div>
        </div>
    );
};

export default Profile;

/* -------------------- Reusable Components -------------------- */

const InputField = ({ label, icon: Icon, value, onChange, placeholder, name, type = "text" }) => (
    <div className="space-y-1.5">
        <label className="block text-sm font-semibold text-slate-700">{label}</label>
        <div className="relative group">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 group-focus-within:text-blue-500 transition-colors">
                <Icon size={18} />
            </div>
            <input
                type={type}
                name={name}
                value={value}
                onChange={onChange}
                placeholder={placeholder}
                className="block w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all font-medium"
            />
        </div>
    </div>
);

const PasswordInput = ({ label, value, onChange, placeholder, name }) => (
    <div className="space-y-1.5">
        <label className="block text-sm font-semibold text-slate-700">{label}</label>
        <div className="relative group">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 group-focus-within:text-blue-500 transition-colors">
                <Lock size={18} />
            </div>
            <input
                type="password"
                name={name}
                value={value}
                onChange={onChange}
                placeholder={placeholder}
                className="block w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all font-medium"
            />
        </div>
    </div>
);
