import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [token, setToken] = useState(sessionStorage.getItem('token'));
    const [loading, setLoading] = useState(true);
    const [isSessionValid, setIsSessionValid] = useState(true);

    useEffect(() => {
        const initAuth = async () => {
            const storedToken = sessionStorage.getItem('token');
            const storedUser = sessionStorage.getItem('user');

            if (storedToken) {
                // Optimistically load stored user first for speed
                if (storedUser) {
                    setUser(JSON.parse(storedUser));
                }

                // Verify with server for latest permissions
                try {
                    // Use axios directly to avoid circular dependency if api.js uses context
                    // But assume we can simply fetch
                    // Note: We need to pass the header manually here as api interceptor might rely on something else
                    // or just use the token we have.
                    const response = await axios.get(`${import.meta.env.VITE_API_URL || '/api'}/auth/me`, {
                        headers: { Authorization: `Bearer ${storedToken}` }
                    });

                    // Update local state with fresh data
                    const freshUser = response.data;
                    setUser(prevUser => {
                        // Prevent unnecessary re-renders if data hasn't changed
                        if (JSON.stringify(prevUser) === JSON.stringify(freshUser)) {
                            return prevUser;
                        }
                        return freshUser;
                    });
                    setIsSessionValid(true); // Session verified
                    sessionStorage.setItem('user', JSON.stringify(freshUser));
                } catch (err) {
                    console.error('Session validation failed:', err);
                    // If 401, clear session? Maybe not immediately to prevent flicker if just network error
                    if (err.response && err.response.status === 401) {
                        logout(); // Token expired
                    }
                    if (err.response && err.response.status === 404) {
                        console.log('[AUTH] User not found (DB Cleanup), logging out...');
                        logout(); // User deleted or DB reset - Clear local storage
                    }
                }
            }
            setLoading(false);
        };
        initAuth();

        // Auto-Refresh User Data (Polling) - Frequency increased for live permission updates
        const pollInterval = setInterval(initAuth, 5000); // Check every 5 seconds

        return () => clearInterval(pollInterval);
    }, []); // Run only on mount

    const login = (userData, authToken) => {
        setUser(userData);
        setToken(authToken);
        setIsSessionValid(true);
        sessionStorage.setItem('user', JSON.stringify(userData));
        sessionStorage.setItem('token', authToken);
    };

    const logout = () => {
        setUser(null);
        setToken(null);
        setIsSessionValid(true);
        sessionStorage.removeItem('user');
        sessionStorage.removeItem('token');
        // window.location.href = '/login'; // Optional force reload
    };

    // Auto-Logout Logic (10 Minutes)
    // Auto-Logout Logic (10 Minutes)
    const isLoggedIn = !!user;
    useEffect(() => {
        if (!isLoggedIn) return; // Only track if logged in

        let timeoutId;
        const TIMEOUT_DURATION = 10 * 60 * 1000; // 10 Minutes (in ms)

        const resetTimer = () => {
            if (timeoutId) clearTimeout(timeoutId);
            timeoutId = setTimeout(() => {
                console.log('[AUTH] Auto-logout due to inactivity');
                logout();
                alert('Session expired due to inactivity. Please login again.');
            }, TIMEOUT_DURATION);
        };

        // Events to track activity
        const events = ['mousemove', 'keydown', 'click', 'scroll'];

        // Attach listeners
        const handleActivity = () => resetTimer();
        events.forEach(event => window.addEventListener(event, handleActivity));

        // Start initial timer
        resetTimer();

        // Cleanup
        return () => {
            if (timeoutId) clearTimeout(timeoutId);
            events.forEach(event => window.removeEventListener(event, handleActivity));
        };
    }, [isLoggedIn]); // Re-bind only when login status changes

    return (
        <AuthContext.Provider value={{ user, token, login, logout, loading, isSessionValid }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
