import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown, Plus, Search, X, Loader2, Check } from 'lucide-react';

const MasterCombo = ({
    value,
    onChange,
    fetchOptions,
    createOption,
    label,
    placeholder,
    icon: Icon,
    error,
    dataKey = 'name', // Key to display/search
    className = '',
    inputClassName = '',
    wrapperClassName = ''
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [options, setOptions] = useState([]);
    const [loading, setLoading] = useState(false);
    const [creating, setCreating] = useState(false);

    const wrapperRef = useRef(null);
    const inputRef = useRef(null);

    // Initialize search term from value
    useEffect(() => {
        if (value && !isOpen) {
            setSearchTerm(value);
        }
    }, [value, isOpen]);

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
                setIsOpen(false);
                // Reset search term to selected value if closed without selection
                if (value) setSearchTerm(value);
                else setSearchTerm('');
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [value]);

    // Fetch options when open or search changes
    useEffect(() => {
        if (!isOpen) return;

        const timer = setTimeout(() => {
            loadOptions();
        }, 300);

        return () => clearTimeout(timer);
    }, [isOpen, searchTerm]);

    const loadOptions = async () => {
        setLoading(true);
        try {
            // Assume fetchOptions returns { rows: [], ... } or just [] or { firms: [] }
            // We need to standardize this or handle different responses.
            // The API returns { firms: [], ... } or { scrapTypes: [], ... }
            // Let's assume the API function returns the axios response
            const response = await fetchOptions({ search: searchTerm, limit: 10 });

            // Extract array from response data
            const data = response.data;
            let list = [];
            if (Array.isArray(data)) list = data;
            else if (data.firms) list = data.firms;
            else if (data.scrapTypes) list = data.scrapTypes;
            else if (data.rows) list = data.rows;

            setOptions(list);
        } catch (err) {
            console.error('Error loading options:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleSelect = (option) => {
        onChange({ name: option[dataKey], id: option.id });
        setSearchTerm(option[dataKey]);
        setIsOpen(false);
    };

    const handleCreate = async () => {
        if (!searchTerm.trim()) return;

        setCreating(true);
        try {
            const response = await createOption({ [dataKey]: searchTerm });
            const newOption = response.data;
            handleSelect(newOption);
        } catch (err) {
            console.error('Error creating option:', err);
            alert(err.response?.data?.message || 'Failed to create option');
        } finally {
            setCreating(false);
        }
    };

    return (
        <div className={`relative ${className}`} ref={wrapperRef}>
            {label && <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>}

            <div
                className={`relative flex items-center rounded-md transition-all bg-white border ${error ? 'border-red-500' : isOpen ? 'ring-2 ring-blue-500 border-blue-500' : 'border-slate-300'
                    } ${
                    // Add glass-input styling if not open/error (or just keep consistent base styles)
                    // The user's other inputs use: rounded-md glass-input ... border-slate-300
                    'glass-input'
                    } ${wrapperClassName}`}
            >
                {Icon && (
                    <div className="pl-3 text-slate-500">
                        <Icon size={18} />
                    </div>
                )}

                <input
                    ref={inputRef}
                    type="text"
                    value={searchTerm}
                    onChange={(e) => {
                        setSearchTerm(e.target.value);
                        if (!isOpen) setIsOpen(true);
                    }}
                    onFocus={() => setIsOpen(true)}
                    className={`w-full px-3 outline-none text-sm text-slate-800 bg-transparent placeholder:text-slate-400 rounded-lg ${inputClassName || 'h-9 py-1.5'}`}
                    placeholder={placeholder || "Select or type to add..."}
                    autoComplete="off"
                />

                <div className="pr-2 flex items-center gap-1">
                    {loading ? (
                        <Loader2 size={16} className="animate-spin text-slate-400" />
                    ) : (
                        <button
                            type="button"
                            onClick={() => {
                                if (isOpen) setIsOpen(false);
                                else {
                                    setIsOpen(true);
                                    inputRef.current?.focus();
                                }
                            }}
                            className="text-slate-500 hover:text-slate-800 p-1 transition-colors"
                        >
                            <ChevronDown size={16} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                        </button>
                    )}
                </div>
            </div>

            {/* Dropdown Menu */}
            {isOpen && (
                <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-xl max-h-60 overflow-auto animate-in fade-in zoom-in-95 duration-100">
                    {options.length > 0 ? (
                        <div className="py-1">
                            {options.map((option) => (
                                <button
                                    key={option.id}
                                    type="button"
                                    onClick={() => handleSelect(option)}
                                    className={`w-full text-left px-4 py-2 text-sm hover:bg-slate-50 flex items-center justify-between group transition-colors ${value === option[dataKey] ? 'bg-blue-50 text-blue-600' : 'text-slate-700'
                                        }`}
                                >
                                    <span>{option[dataKey]}</span>
                                    {value === option[dataKey] && <Check size={14} />}
                                </button>
                            ))}
                        </div>
                    ) : (
                        !loading && (
                            <div className="p-3 text-center text-slate-500">
                                <p className="text-xs">
                                    {searchTerm ? `No results for "${searchTerm}"` : "No options available"}
                                </p>
                            </div>
                        )
                    )}

                    {/* Add New Option */}
                    {searchTerm && !options.some(o => o[dataKey].toLowerCase() === searchTerm.toLowerCase()) && (
                        <div className="p-2 border-t border-slate-200 bg-slate-50 sticky bottom-0">
                            <button
                                type="button"
                                onClick={handleCreate}
                                disabled={creating}
                                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium transition-colors disabled:opacity-50 shadow-sm"
                            >
                                {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                                Add "{searchTerm}"
                            </button>
                        </div>
                    )}
                </div>
            )}

            {error && <p className="mt-1 text-sm text-red-500">{error}</p>}
        </div>
    );
};

export default MasterCombo;
