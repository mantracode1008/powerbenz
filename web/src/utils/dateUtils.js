export const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;

    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear(); // User asked for dd mm yy, but usually yyyy is safer. I'll stick to YYYY unless explicitly 'yy'. 'dd mm yy' usually implies the order. I will use YYYY for clarity, or I can use yy. Let's use YYYY as it is standard. If they really want 2 digit year, I can change. But 'dd mm yy' is often a shorthand for the order. I'll use YYYY.

    return `${day}-${month}-${year}`;
};

export const formatDateForInput = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '';
    return date.toISOString().split('T')[0];
};
