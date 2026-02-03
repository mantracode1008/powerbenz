import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { GoogleOAuthProvider } from '@react-oauth/google';
import Login from './pages/Login';
import Register from './pages/Register';
import ConfirmationModal from './components/ConfirmationModal'; // Keep eager
import ProtectedRoute from './components/ProtectedRoute';
import AdminGuard from './components/AdminGuard';
import HomeRedirect from './components/HomeRedirect';
import Layout from './components/Layout';

// Lazy Load Pages
const Welcome = React.lazy(() => import('./pages/Welcome'));
const Dashboard = React.lazy(() => import('./pages/Dashboard'));
const ContainerEntry = React.lazy(() => import('./pages/ContainerEntry'));
const Items = React.lazy(() => import('./pages/Items'));
const ContainerSummary = React.lazy(() => import('./pages/ContainerSummary'));
const ItemSummary = React.lazy(() => import('./pages/ItemSummary'));
const SaleEntry = React.lazy(() => import('./pages/SaleEntry'));
const SaleSummary = React.lazy(() => import('./pages/SaleSummary'));
const ExcelImport = React.lazy(() => import('./pages/ExcelImport'));
const Reports = React.lazy(() => import('./pages/Reports'));
const StaffManagement = React.lazy(() => import('./pages/StaffManagement'));
const Summary = React.lazy(() => import('./pages/Summary'));
const AuditLogs = React.lazy(() => import('./pages/AuditLogs'));
const Profile = React.lazy(() => import('./pages/Profile'));
const History = React.lazy(() => import('./pages/History'));
const RatePanel = React.lazy(() => import('./pages/RatePanel'));

const LoadingFallback = () => (
  <div className="flex justify-center items-center h-screen bg-slate-50">
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
  </div>
);

function App() {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || "YOUR_GOOGLE_CLIENT_ID_HERE";

  return (
    <GoogleOAuthProvider clientId={clientId}>
      <AuthProvider>
        <Router>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />

            {/* Protected Routes */}
            {/* Protected Routes */}
            <Route path="/welcome" element={
              <ProtectedRoute>
                <React.Suspense fallback={<LoadingFallback />}>
                  <Welcome />
                </React.Suspense>
              </ProtectedRoute>
            } />

            <Route path="/*" element={
              <ProtectedRoute>
                <Layout>
                  <React.Suspense fallback={<LoadingFallback />}>
                    <Routes>
                      <Route path="/" element={<HomeRedirect />} />
                      <Route path="/dashboard" element={<Dashboard />} />
                      <Route path="/entry" element={<ContainerEntry />} />
                      <Route path="/entry/:id" element={<ContainerEntry />} />
                      <Route path="/containers" element={<Navigate to="/history" replace />} />
                      <Route path="/history" element={<History />} />
                      <Route path="/items" element={<Items />} />
                      <Route path="/items-summary" element={<ItemSummary />} />
                      <Route path="/summary" element={<Summary />} />
                      <Route path="/sales" element={<SaleEntry />} />
                      <Route path="/import" element={<ExcelImport />} />
                      <Route path="/reports" element={<Reports />} />
                      <Route path="/staff" element={<StaffManagement />} />
                      <Route path="/logs" element={<AuditLogs />} />
                      <Route path="/rates" element={<RatePanel />} />
                      <Route path="/profile" element={<Profile />} />
                    </Routes>
                  </React.Suspense>
                </Layout>
              </ProtectedRoute>
            } />
            {/* Fallback for any unknown route -> Redirect to Login */}
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </Router>
      </AuthProvider>
    </GoogleOAuthProvider>
  );
}

export default App;
