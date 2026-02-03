import React from 'react';
import DatePicker from 'react-datepicker';
import "react-datepicker/dist/react-datepicker.css";
import { Calendar } from 'lucide-react';

const CustomDatePicker = ({ value, onChange, placeholder = "Select Date", className, name, required, ...props }) => {
    // Convert YYYY-MM-DD string to Date object
    // Fix: Parse YYYY-MM-DD manually to prevent timezone shifts (UTC vs Local)
    const selectedDate = React.useMemo(() => {
        if (!value) return null;
        if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
            const [y, m, d] = value.split('-').map(Number);
            return new Date(y, m - 1, d);
        }
        return new Date(value);
    }, [value]);

    const handleDateChange = (date) => {
        if (!date) {
            // Handle clearing if needed, or send empty string
            onChange({ target: { name, value: '' } });
            return;
        }

        // Convert Date object back to YYYY-MM-DD string
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const dateString = `${year}-${month}-${day}`;

        // Simulate an event object so it fits into existing handleInputChange patterns
        onChange({ target: { name, value: dateString } });
    };

    return (
        <div className="relative w-full">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 z-10 pointer-events-none text-slate-500">
                <Calendar size={16} />
            </div>
            <DatePicker
                selected={selectedDate}
                onChange={handleDateChange}
                dateFormat="dd-MM-yyyy"
                placeholderText={placeholder}
                isClearable
                className={`w-full pl-10 pr-8 h-9 py-1.5 rounded-md border border-slate-300 bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm shadow-sm transition-all ${className}`}
                wrapperClassName="w-full"
                required={required}
                showMonthDropdown
                showYearDropdown
                dropdownMode="select"
                {...props}
            />
        </div>
    );
};

export default CustomDatePicker;
