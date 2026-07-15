import { Routes, Route, Navigate } from 'react-router-dom';
import Navbar from './components/Navbar';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/Login';
import Register from './pages/Register';
import DoctorSearch from './pages/patient/DoctorSearch';
import BookAppointment from './pages/patient/BookAppointment';
import MyAppointments from './pages/patient/MyAppointments';
import Schedule from './pages/doctor/Schedule';
import ManageDoctors from './pages/admin/ManageDoctors';
import { useAuth } from './context/AuthContext';

function Home() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'patient') return <Navigate to="/patient/doctors" replace />;
  if (user.role === 'doctor') return <Navigate to="/doctor/schedule" replace />;
  return <Navigate to="/admin/doctors" replace />;
}

export default function App() {
  return (
    <div>
      <Navbar />
      <main className="container">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/calendar-connected" element={<p>Google Calendar connected. You can close this tab.</p>} />

          <Route path="/patient/doctors" element={<ProtectedRoute roles={['patient']}><DoctorSearch /></ProtectedRoute>} />
          <Route path="/patient/book/:profileId" element={<ProtectedRoute roles={['patient']}><BookAppointment /></ProtectedRoute>} />
          <Route path="/patient/appointments" element={<ProtectedRoute roles={['patient']}><MyAppointments /></ProtectedRoute>} />

          <Route path="/doctor/schedule" element={<ProtectedRoute roles={['doctor']}><Schedule /></ProtectedRoute>} />

          <Route path="/admin/doctors" element={<ProtectedRoute roles={['admin']}><ManageDoctors /></ProtectedRoute>} />

          <Route path="*" element={<p>Page not found.</p>} />
        </Routes>
      </main>
    </div>
  );
}
