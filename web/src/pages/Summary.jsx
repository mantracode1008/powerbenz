import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import ItemSummary from './ItemSummary';
import ContainerSummary from './ContainerSummary';
import SaleSummary from './SaleSummary';
import { Package, History, IndianRupee } from 'lucide-react';

const Summary = () => {
    const location = useLocation();
    const [activeTab, setActiveTab] = useState(location.state?.activeTab || 'item');

    return (
        <div className="space-y-6">
            <div className="flex justify-center w-full py-2 overflow-x-auto scrollbar-hide">
                <div className="bg-slate-100 p-1.5 rounded-full inline-flex items-center justify-center border border-slate-200 min-w-max">
                    <button
                        onClick={() => setActiveTab('item')}
                        className={`flex items-center gap-2 px-6 py-2 rounded-full text-sm font-bold transition-all duration-200 whitespace-nowrap ${activeTab === 'item'
                            ? 'bg-white text-blue-600 shadow-sm ring-1 ring-black/5'
                            : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
                            }`}
                    >
                        <Package size={18} className={activeTab === 'item' ? 'text-blue-600' : 'text-slate-400'} />
                        Item Summary
                    </button>
                    <button
                        onClick={() => setActiveTab('container')}
                        className={`flex items-center gap-2 px-6 py-2 rounded-full text-sm font-bold transition-all duration-200 whitespace-nowrap ${activeTab === 'container'
                            ? 'bg-white text-blue-600 shadow-sm ring-1 ring-black/5'
                            : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
                            }`}
                    >
                        <History size={18} className={activeTab === 'container' ? 'text-blue-600' : 'text-slate-400'} />
                        Container Summary
                    </button>
                    <button
                        onClick={() => setActiveTab('sale')}
                        className={`flex items-center gap-2 px-6 py-2 rounded-full text-sm font-bold transition-all duration-200 whitespace-nowrap ${activeTab === 'sale'
                            ? 'bg-white text-blue-600 shadow-sm ring-1 ring-black/5'
                            : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
                            }`}
                    >
                        <IndianRupee size={18} className={activeTab === 'sale' ? 'text-blue-600' : 'text-slate-400'} />
                        Sale Summary
                    </button>
                </div>
            </div>

            <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                {activeTab === 'item' && <ItemSummary />}
                {activeTab === 'container' && <ContainerSummary viewMode="summary" />}
                {activeTab === 'sale' && <SaleSummary />}
            </div>
        </div>
    );
};

export default Summary;
