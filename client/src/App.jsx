import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './auth/AuthContext.jsx';
import Layout from './components/Layout.jsx';

import Splash from './pages/Splash.jsx';
import Login from './pages/Login.jsx';
import Signup from './pages/Signup.jsx';
import Dashboard from './pages/Dashboard.jsx';
import FindRide from './pages/FindRide.jsx';
import OfferRide from './pages/OfferRide.jsx';
import Vehicles from './pages/Vehicles.jsx';
import MyTrips from './pages/MyTrips.jsx';
import TripDetail from './pages/TripDetail.jsx';
import Wallet from './pages/Wallet.jsx';
import RideHistory from './pages/RideHistory.jsx';
import SavedPlaces from './pages/SavedPlaces.jsx';
import AdminDashboard from './pages/AdminDashboard.jsx';

function Protected({ children, adminOnly }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="p-10 text-center text-slate-500">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (adminOnly && !user.isAdmin) return <Navigate to="/app" replace />;
  return children;
}

function AppHome() {
  const { user } = useAuth();
  return user?.isAdmin ? <AdminDashboard /> : <Dashboard />;
}

export default function App() {
  const { user, loading } = useAuth();

  return (
    <Routes>
      <Route path="/" element={loading ? null : user ? <Navigate to="/app" replace /> : <Splash />} />
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />

      <Route path="/app" element={<Protected><Layout /></Protected>}>
        <Route index element={<AppHome />} />
        <Route path="find" element={<FindRide />} />
        <Route path="offer" element={<OfferRide />} />
        <Route path="vehicles" element={<Vehicles />} />
        <Route path="trips" element={<MyTrips />} />
        <Route path="trips/:id" element={<TripDetail />} />
        <Route path="wallet" element={<Wallet />} />
        <Route path="history" element={<RideHistory />} />
        <Route path="places" element={<SavedPlaces />} />
        <Route path="admin" element={<Protected adminOnly><AdminDashboard /></Protected>} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
