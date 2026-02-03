import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown, Plus, Loader2, Check } from 'lucide-react';

const StringCombo = ({
    value,
    onChange,
    fetchOptions,
    label,
    placeholder,
    icon: Icon,
    error,
    disabled = false,
    wrapperClassName = '',
    ...rest
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [options, setOptions] = useState([]);
    const [loading, setLoading] = useState(false);

    // Internal state to track if we should fetch on search change
    // This prevents searching when we just clicked an option
    const [shouldFetch, setShouldFetch] = useState(false);

    const wrapperRef = useRef(null);
    const inputRef = useRef(null);

    // Initialize search term from value
    // Initialize search term from value
    useEffect(() => {
        // Only update if external value changes meaningfully and differs from local state
        // This handles form resets or programmatic updates
        if (value !== undefined && value !== searchTerm) {
            setSearchTerm(value || '');
        }
    }, [value]); // intentionally not including searchTerm to avoid loop

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
                setIsOpen(false);
                setShouldFetch(false);
                // On blur, ensure parent has latest value
                if (searchTerm !== value) {
                    onChange(searchTerm);
                }
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [value, searchTerm, onChange]);

    // Fetch options when open or search changes (and we should fetch)
    useEffect(() => {
        if (!isOpen) return;
        // If opening and the text matches the value (not actively typing a new search), 
        // show ALL options (Select-like behavior)
        const isSync = (value || '') === searchTerm;
        loadOptions(isSync ? '' : searchTerm);
    }, [isOpen]);

    // Debounced fetch for search changes
    useEffect(() => {
        if (!isOpen || !shouldFetch) return;

        const timer = setTimeout(() => {
            loadOptions();
        }, 300);

        return () => clearTimeout(timer);
    }, [searchTerm, shouldFetch]);

    const loadOptions = async (queryOverride = null) => {
        setLoading(true);
        // Use override if provided, otherwise use current searchTerm
        const query = queryOverride !== null ? queryOverride : searchTerm;
        try {
            const response = await fetchOptions({ search: query, limit: 100 });
            setOptions(Array.isArray(response.data) ? response.data : (Array.isArray(response) ? response : []));
        } catch (err) {
            console.error('Error loading options:', err);
            setOptions([]);
        } finally {
            setLoading(false);
        }
    };

    const handleSelect = (optionValue) => {
        onChange(optionValue);
        setSearchTerm(optionValue);
        setIsOpen(false);
        setShouldFetch(false);
    };

    const handleInputChange = (e) => {
        const val = e.target.value;
        setSearchTerm(val);
        onChange(val); // Update parent immediately
        setShouldFetch(true);
        if (!isOpen) setIsOpen(true);
    };

    return (
        <div className="relative" ref={wrapperRef}>
            {label && <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>}

            <div
                className={`relative flex items-center rounded-md transition-all bg-white border ${error ? 'border-red-500' : isOpen ? 'ring-2 ring-blue-500 border-blue-500' : 'border-slate-300'
                    } ${disabled ? 'opacity-60 bg-slate-50 cursor-not-allowed' : ''} ${wrapperClassName}`}
            >
                {Icon && (
                    <div className="pl-3 text-slate-500">
                        <Icon size={16} />
                    </div>
                )}

                <input
                    ref={inputRef}
                    type="text"
                    value={searchTerm}
                    onChange={handleInputChange}
                    onFocus={(e) => {
                        if (rest.onFocus) rest.onFocus(e);
                        if (!disabled) {
                            setIsOpen(true);
                            // Prevent immediate re-filtering by tokenizer
                            // Let the isOpen effect handle the initial load (which shows all if synced)
                            setShouldFetch(false);
                        }
                    }}
                    onBlur={(e) => {
                        if (rest.onBlur) rest.onBlur(e);
                        if (searchTerm && searchTerm !== value) {
                            onChange(searchTerm);
                        }
                    }}
                    disabled={disabled}
                    className={`w-full py-1.5 px-3 outline-none text-sm text-slate-800 bg-transparent placeholder:text-slate-400 rounded-md`}
                    placeholder={placeholder || "Select or type..."}
                    autoComplete="off"
                    {...rest}
                />

                <div className="pr-2 flex items-center gap-1">
                    {loading ? (
                        <Loader2 size={16} className="animate-spin text-slate-400" />
                    ) : (
                        <button
                            type="button"
                            disabled={disabled}
                            onClick={() => {
                                if (isOpen) setIsOpen(false);
                                else {
                                    setIsOpen(true);
                                    inputRef.current?.focus();
                                }
                            }}
                            className="text-slate-400 hover:text-slate-600 p-1 transition-colors"
                        >
                            <ChevronDown size={16} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                        </button>
                    )}
                </div>
            </div>

            {/* Dropdown Menu - High Z-Index to avoid clipping */}
            {isOpen && (
                <div className="absolute z-[1000] w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-xl max-h-60 overflow-auto animate-in fade-in zoom-in-95 duration-100">
                    {/* Unique Options List */}
                    {options.length > 0 ? (
                        <div className="py-1">
                            {[...new Set(options)].map((option, idx) => (
                                <button
                                    key={idx}
                                    type="button"
                                    onClick={() => handleSelect(option)}
                                    className={`w-full text-left px-4 py-2 text-sm hover:bg-slate-50 flex items-center justify-between group transition-colors ${value === option ? 'bg-blue-50 text-blue-600' : 'text-slate-700'
                                        }`}
                                >
                                    <span>{option}</span>
                                    {value === option && <Check size={14} />}
                                </button>
                            ))}
                        </div>
                    ) : (
                        !loading && searchTerm && (
                            <div className="p-3 text-center text-slate-500">
                                <p className="text-xs">
                                    No results for "{searchTerm}"
                                </p>
                            </div>
                        )
                    )}

                    {/* Explicit Add Option */}
                    {searchTerm && !options.includes(searchTerm) && (
                        <div className="p-2 border-t border-slate-200 bg-slate-50 sticky bottom-0">
                            <button
                                type="button"
                                onClick={() => handleSelect(searchTerm)}
                                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium transition-colors shadow-sm"
                            >
                                <Plus size={14} />
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

export default StringCombo;
