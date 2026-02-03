import React, { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Dashboard from '../pages/Dashboard';

const HomeRedirect = () => {
    const { user, loading } = useAuth();
    const [isChecking, setIsChecking] = useState(true);

    if (loading) {
        return <div className="p-4">Loading...</div>;
    }

    if (!user) {
        return <Navigate to="/login" replace />;
    }

    // Unified Launchpad: Everyone goes to Welcome page first to select their module
    // The user requested "badha ma avu kari de" (do this for everyone)
    return <Navigate to="/welcome" replace />;
};

export default HomeRedirect;
