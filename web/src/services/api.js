import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || '/api';

export const api = axios.create({
    baseURL: API_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

// Request Interceptor to add Token
api.interceptors.request.use(config => {
    const token = sessionStorage.getItem('token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
}, error => Promise.reject(error));

// Response Interceptor for 401 (Auto-Logout on Invalid Token)
// api.interceptors.response.use(
//     response => response,
//     error => {
//         if (error.response && (error.response.status === 401 || error.response.status === 403)) {
//             // Token invalid or expired
//             // sessionStorage.removeItem('token');
//             // sessionStorage.removeItem('user');

//             // Only redirect if not already on login page to avoid loops
//             // if (!window.location.pathname.includes('/login')) {
//             //     window.location.href = '/login';
//             // }
//         }
//         return Promise.reject(error);
//     }
// );

// Persistent Cache Helper (LocalStorage)
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 Hours

const getCache = (key) => {
    try {
        const cached = localStorage.getItem(key);
        if (!cached) return null;

        const { data, timestamp } = JSON.parse(cached);
        const now = Date.now();

        if (now - timestamp > CACHE_DURATION) {
            localStorage.removeItem(key);
            return null;
        }
        return data;
    } catch (e) {
        return null;
    }
};

const setCache = (key, data) => {
    try {
        localStorage.setItem(key, JSON.stringify({
            data,
            timestamp: Date.now()
        }));
    } catch (e) {
        console.warn('Cache Storage Failed', e);
    }
};

const clearCache = (key) => localStorage.removeItem(key);

// Auth APIs
export const login = (data) => api.post('/auth/login', data);
export const register = (data) => api.post('/auth/register', data);
export const sendOtp = (email) => api.post('/auth/send-otp', { email });
export const getLoginUsers = () => api.get('/auth/users/login-list');

export const getContainers = (params) => api.get('/containers', { params });
export const createContainer = (data) => api.post('/containers', data);
export const updateContainer = (id, data) => api.put(`/containers/${id}`, data);
export const getContainerById = (id, params) => api.get(`/containers/${id}`, { params });
export const deleteContainer = (id, date = null) => api.delete(`/containers/${id}`, { params: { date } });
export const checkActiveContainer = (containerNo) => api.get('/containers/check-active', { params: { containerNo } });
export const getItemSummary = (params) => api.get('/containers/summary/items', { params });
export const updateContainerItem = (id, data) => api.put(`/containers/summary/items/${id}`, data);

export const getItems = async () => {
    // Disable cache to prevent stale IDs (404 errors)
    // const cached = getCache('items_master_cache');
    // if (cached) return Promise.resolve({ data: cached });

    const response = await api.get('/items');
    // setCache('items_master_cache', response.data);
    return response;
};
export const createItem = async (data) => {
    clearCache('items_master_cache');
    return api.post('/items', data);
};
export const updateItem = async (id, data) => {
    clearCache('items_master_cache');
    return api.put(`/items/${id}`, data);
};
export const bulkUpdateItemRate = async (id, rate) => {
    clearCache('items_master_cache');
    return api.put(`/items/${id}/bulk-rate`, { rate });
};
export const deleteItem = async (id) => {
    clearCache('items_master_cache');
    return api.delete(`/items/${id}`);
};
export const getAvailableContainers = (itemId, params) => api.get(`/items/${itemId}/containers`, { params });

export const updateItemsBatch = async (items) => {
    clearCache('items_master_cache');
    return api.put('/items/batch-update', { items });
};


export const getStaff = async () => {
    // Caching removed to fix "Staff not showing" (Stale Cache) issue
    // const cached = getCache('staff_master_cache');
    // if (cached) return Promise.resolve({ data: cached });

    const response = await api.get('/staff');
    // setCache('staff_master_cache', response.data);
    return response;
};
export const createStaff = async (data) => {
    clearCache('staff_master_cache');
    return api.post('/staff', data);
};
export const updateStaff = async (id, data) => {
    clearCache('staff_master_cache');
    return api.put(`/staff/${id}`, data);
};
export const deleteStaff = async (id) => {
    clearCache('staff_master_cache');
    return api.delete(`/staff/${id}`);
};

export const getAttendance = (params) => api.get('/attendance', { params });
export const markAttendance = (data) => api.post('/attendance', data);
export const getAttendanceSummary = (params) => api.get('/attendance/summary', { params });

export const getSales = (params) => api.get('/sales', { params });
export const createSale = (data) => api.post('/sales', data);
export const updateSale = (id, data) => api.put(`/sales/${id}`, data);
export const deleteSale = (id) => api.delete(`/sales/${id}`);

export const getDashboardStats = () => api.get('/dashboard/stats');

export const getStaffAttendanceStats = (staffId, params) => api.get(`/attendance/stats/${staffId}`, { params });

export const getFirms = (params) => api.get('/firms', { params });
export const createFirm = (data) => api.post('/firms', data);

export const getScrapTypes = (params) => api.get('/scrap-types', { params });
export const createScrapType = (data) => api.post('/scrap-types', data);

export const getUniqueValues = (field, search, limit = 100) => api.get('/utils/unique-values', { params: { field, search, limit } });

export const getRateHistoryLog = () => api.get('/items/history/log');
