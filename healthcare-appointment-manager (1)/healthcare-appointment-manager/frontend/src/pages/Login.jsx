import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const user = await login(form.email, form.password);
      if (user.role === 'patient') navigate('/patient/doctors');
      else if (user.role === 'doctor') navigate('/doctor/schedule');
      else navigate('/admin/doctors');
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card auth-card">
      <h2>Log In</h2>
      {error && <div className="alert alert-error">{error}</div>}
      <form onSubmit={handleSubmit}>
        <label>Email</label>
        <input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <label>Password</label>
        <input type="password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        <button className="btn-primary" disabled={loading}>{loading ? 'Logging in...' : 'Log In'}</button>
      </form>
      <p>No account? <Link to="/register">Register as a patient</Link></p>
      <div className="hint-box">
        <b>Demo accounts (after running the seed script):</b>
        <div>Admin: admin@clinic.test / admin123</div>
        <div>Doctor: asha.mehta@clinic.test / doctor123</div>
        <div>Patient: priya.sharma@example.test / patient123</div>
      </div>
    </div>
  );
}
