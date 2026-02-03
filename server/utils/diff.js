
/**
 * Calculates the difference between two objects.
 * Returns an object containing only the keys that have changed,
 * with their 'from' and 'to' values.
 * 
 * @param {Object} oldObj - The original object (e.g., from DB)
 * @param {Object} newObj - The new data (e.g., from request body)
 * @returns {Object|null} - Object with changes or null if no changes
 */
const getDiff = (oldObj, newObj) => {
    if (!oldObj || !newObj) return null;

    const changes = {};
    let hasChanges = false;

    // Normalize comparison
    const compare = (val1, val2) => {
        // Handle null/undefined
        if (val1 === val2) return true;

        // Handle numbers vs strings (e.g. "10.00" vs 10)
        if (typeof val1 === 'number' && typeof val2 === 'string') {
            return val1 === parseFloat(val2);
        }
        if (typeof val1 === 'string' && typeof val2 === 'number') {
            return parseFloat(val1) === val2;
        }

        // Handle Date objects
        if (val1 instanceof Date && val2 instanceof Date) {
            return val1.getTime() === val2.getTime();
        }
        if (val1 instanceof Date && typeof val2 === 'string') {
            return val1.toISOString() === new Date(val2).toISOString();
        }

        return JSON.stringify(val1) === JSON.stringify(val2);
    };

    // Iterate over keys in the NEW object (since that's what we are updating)
    Object.keys(newObj).forEach(key => {
        // Skip ignored keys
        if (['updatedAt', 'createdAt', 'items'].includes(key)) return;

        // If key exists in oldObj (or we want to track new keys too)
        // For updates, usually we track changes to existing fields.
        if (Object.prototype.hasOwnProperty.call(oldObj, key)) {
            if (!compare(oldObj[key], newObj[key])) {
                changes[key] = {
                    from: oldObj[key],
                    to: newObj[key]
                };
                hasChanges = true;
            }
        }
    });

    return hasChanges ? changes : null;
};

module.exports = getDiff;
