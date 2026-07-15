import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <nav className="navbar">
      <Link to="/" className="brand">Clinic Manager</Link>
      <div className="nav-links">
        {!user && (
          <>
            <Link to="/login">Login</Link>
            <Link to="/register">Register</Link>
          </>
        )}
        {user?.role === 'patient' && (
          <>
            <Link to="/patient/doctors">Find a Doctor</Link>
            <Link to="/patient/appointments">My Appointments</Link>
          </>
        )}
        {user?.role === 'doctor' && (
          <>
            <Link to="/doctor/schedule">My Schedule</Link>
          </>
        )}
        {user?.role === 'admin' && (
          <>
            <Link to="/admin/doctors">Manage Doctors</Link>
          </>
        )}
        {user && (
          <>
            <span className="user-pill">{user.name} ({user.role})</span>
            <button onClick={handleLogout} className="btn-link">Logout</button>
          </>
        )}
      </div>
    </nav>
  );
}
