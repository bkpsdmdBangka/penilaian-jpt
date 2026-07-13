import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './firebase';
import NilaiPage from './pages/NilaiPage';
import AdminLogin from './pages/AdminLogin';
import AdminDashboard from './pages/AdminDashboard';
import AdminKandidat from './pages/AdminKandidat';
import AdminPenilai from './pages/AdminPenilai';

function ProtectedRoute({ children, user, loading }) {
  if (loading) {
    return (
      <div className="loading-center" style={{ minHeight: '100vh' }}>
        <div className="spinner" />
        <span>Memverifikasi sesi...</span>
      </div>
    );
  }
  if (!user) {
    return <Navigate to="/admin" replace />;
  }
  return children;
}

export default function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoading(false);
    });
    return unsub;
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        {/* Assessor (public, token-based) */}
        <Route path="/nilai" element={<NilaiPage />} />

        {/* Admin login */}
        <Route
          path="/admin"
          element={
            !authLoading && user
              ? <Navigate to="/admin/dashboard" replace />
              : <AdminLogin />
          }
        />

        {/* Admin Dashboard */}
        <Route
          path="/admin/dashboard"
          element={
            <ProtectedRoute user={user} loading={authLoading}>
              <AdminDashboard user={user} />
            </ProtectedRoute>
          }
        />

        {/* Admin Kandidat */}
        <Route
          path="/admin/kandidat"
          element={
            <ProtectedRoute user={user} loading={authLoading}>
              <AdminKandidat user={user} />
            </ProtectedRoute>
          }
        />

        {/* Admin Penilai */}
        <Route
          path="/admin/penilai"
          element={
            <ProtectedRoute user={user} loading={authLoading}>
              <AdminPenilai user={user} />
            </ProtectedRoute>
          }
        />

        {/* Redirect root */}
        <Route path="/" element={<Navigate to="/nilai" replace />} />
        <Route path="*" element={<Navigate to="/nilai" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
