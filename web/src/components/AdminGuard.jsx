import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const AdminGuard = ({ children }) => {
    const { user } = useAuth();

    // Check if user is admin (Case insensitive)
    const isAdmin = user?.role?.toLowerCase() === 'admin';

    if (!isAdmin) {
        return <Navigate to="/welcome" replace />;
    }

    return children;
};

export default AdminGuard;
