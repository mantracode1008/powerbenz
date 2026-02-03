import React from 'react';
import { Tag } from 'lucide-react';
import StringCombo from './StringCombo';
import { getUniqueValues } from '../services/api';

const CategoryCombo = ({ value, onChange, error, label = "Category" }) => {
    // Wrapper to fetch unique categories
    const fetchCategories = async ({ search, limit }) => {
        const defaultCategories = ['General', 'Metal', 'Plastic', 'Paper', 'Glass', 'Other'];

        try {
            const response = await getUniqueValues('category', search, limit);
            const dbCategories = response.data || [];

            // Merge defaults with DB results and unique-ify
            let merged = [...new Set([...defaultCategories, ...dbCategories])];

            // Filter defaults if search is present (DB results are already filtered)
            if (search) {
                const searchLower = search.toLowerCase();
                merged = merged.filter(c => c.toLowerCase().includes(searchLower));
            }

            return { data: merged };
        } catch (error) {
            console.error("Failed to fetch categories", error);
            // Fallback to filtered defaults
            if (search) {
                return { data: defaultCategories.filter(c => c.toLowerCase().includes(search.toLowerCase())) };
            }
            return { data: defaultCategories };
        }
    };

    return (
        <StringCombo
            label={label}
            value={value}
            onChange={onChange}
            fetchOptions={fetchCategories}
            icon={Tag}
            placeholder="Select or add category..."
            error={error}
        />
    );
};

export default CategoryCombo;
