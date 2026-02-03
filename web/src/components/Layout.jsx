import React, { useState } from 'react';
import Sidebar from './Sidebar';
import { Menu } from 'lucide-react';

const Layout = ({ children }) => {
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    return (
        <div className="bg-slate-50 min-h-screen font-inter">
            {/* Desktop Sidebar (Fixed) */}
            <div className="hidden lg:block">
                <Sidebar />
            </div>

            {/* Mobile Sidebar & Overlay */}
            {isMobileMenuOpen && (
                <div className="fixed inset-0 z-50 lg:hidden">
                    <div
                        className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
                        onClick={() => setIsMobileMenuOpen(false)}
                    ></div>
                    <div className="fixed inset-y-0 left-0 w-72 bg-white shadow-2xl transform transition-transform duration-300">
                        <Sidebar />
                    </div>
                </div>
            )}

            {/* Main Content Area */}
            <main className="flex-1 flex flex-col min-h-screen lg:ml-[90px] transition-all duration-300">
                {/* Mobile Header */}
                <header className="lg:hidden bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between shadow-sm sticky top-0 z-30">
                    <div className="flex items-center gap-3">
                        <div className="bg-blue-600 p-2 rounded-lg text-white">
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M7 19a2 2 0 1 0-4 0 2 2 0 0 0 4 0Z" /><path d="M11 19a2 2 0 1 0-4 0 2 2 0 0 0 4 0Z" /><path d="M17 19a2 2 0 1 0-4 0 2 2 0 0 0 4 0Z" /><path d="M3 7h18" /><path d="M6 7v10" /><path d="M10 7v10" /><path d="M14 7v10" /><path d="M18 7v10" /></svg>
                        </div>
                        <span className="text-lg font-bold text-slate-800 tracking-tight">ScrapSys</span>
                    </div>
                    <button
                        onClick={() => setIsMobileMenuOpen(true)}
                        className="p-2 text-slate-500 hover:bg-slate-100 rounded-lg transition-colors"
                    >
                        <Menu size={24} />
                    </button>
                </header>

                {/* Content Scroll Area */}
                <div className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1920px] mx-auto w-full">
                    {children}
                </div>
            </main>
        </div>
    );
};

export default Layout;
