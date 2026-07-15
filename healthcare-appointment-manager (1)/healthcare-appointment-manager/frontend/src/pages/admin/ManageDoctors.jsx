import { useEffect, useState } from 'react';
import api from '../../api/axios';

const emptyForm = {
  name: '',
  email: '',
  password: '',
  phone: '',
  specialisation: '',
  qualifications: '',
  slotDurationMinutes: 30,
  consultationFee: 0,
  workingHours: [{ day: 1, startTime: '09:00', endTime: '17:00' }],
};

const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function ManageDoctors() {
  const [doctors, setDoctors] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');
  const [leaveDate, setLeaveDate] = useState({});

  const load = () => {
    api.get('/admin/doctors').then(({ data }) => setDoctors(data.doctors));
  };

  useEffect(() => {
    load();
  }, []);

  const updateWH = (idx, field, value) => {
    const next = [...form.workingHours];
    next[idx][field] = field === 'day' ? Number(value) : value;
    setForm({ ...form, workingHours: next });
  };
  const addWH = () => setForm({ ...form, workingHours: [...form.workingHours, { day: 1, startTime: '09:00', endTime: '17:00' }] });

  const createDoctor = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await api.post('/admin/doctors', form);
      setForm(emptyForm);
      setShowForm(false);
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create doctor');
    }
  };

  const addLeave = async (profileId) => {
    const date = leaveDate[profileId];
    if (!date) return;
    const { data } = await api.post(`/admin/doctors/${profileId}/leave`, { date, reason: 'Personal leave' });
    alert(data.message);
    load();
  };

  const removeLeave = async (profileId, date) => {
    await api.delete(`/admin/doctors/${profileId}/leave/${date}`);
    load();
  };

  return (
    <div className="page">
      <div className="row-between">
        <h2>Manage Doctors</h2>
        <button className="btn-primary" onClick={() => setShowForm(!showForm)}>{showForm ? 'Close' : '+ Add Doctor'}</button>
      </div>

      {showForm && (
        <form className="card" onSubmit={createDoctor}>
          {error && <div className="alert alert-error">{error}</div>}
          <div className="form-grid">
            <div><label>Name</label><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div><label>Email</label><input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div><label>Password</label><input type="password" required minLength={6} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>
            <div><label>Phone</label><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            <div><label>Specialisation</label><input required value={form.specialisation} onChange={(e) => setForm({ ...form, specialisation: e.target.value })} /></div>
            <div><label>Qualifications</label><input value={form.qualifications} onChange={(e) => setForm({ ...form, qualifications: e.target.value })} /></div>
            <div><label>Slot duration (min)</label><input type="number" value={form.slotDurationMinutes} onChange={(e) => setForm({ ...form, slotDurationMinutes: Number(e.target.value) })} /></div>
            <div><label>Consultation fee</label><input type="number" value={form.consultationFee} onChange={(e) => setForm({ ...form, consultationFee: Number(e.target.value) })} /></div>
          </div>

          <label>Working hours</label>
          {form.workingHours.map((wh, idx) => (
            <div className="wh-row" key={idx}>
              <select value={wh.day} onChange={(e) => updateWH(idx, 'day', e.target.value)}>
                {dayNames.map((d, i) => <option value={i} key={i}>{d}</option>)}
              </select>
              <input type="time" value={wh.startTime} onChange={(e) => updateWH(idx, 'startTime', e.target.value)} />
              <input type="time" value={wh.endTime} onChange={(e) => updateWH(idx, 'endTime', e.target.value)} />
            </div>
          ))}
          <button type="button" className="btn-link" onClick={addWH}>+ Add working hours block</button>

          <button className="btn-primary" style={{ marginTop: '1rem' }}>Create Doctor</button>
        </form>
      )}

      <div className="list">
        {doctors.map((d) => (
          <div className="card" key={d._id}>
            <h3>{d.user?.name} — {d.specialisation}</h3>
            <p className="muted">{d.user?.email} · {d.slotDurationMinutes} min slots</p>
            <p><b>Working hours:</b> {d.workingHours.map((wh) => `${dayNames[wh.day]} ${wh.startTime}-${wh.endTime}`).join(', ') || 'None set'}</p>

            <div className="subcard">
              <h4>Leave Days</h4>
              {d.leaveDays.length === 0 && <p className="muted">No leave scheduled</p>}
              <ul>
                {d.leaveDays.map((l) => (
                  <li key={l.date}>
                    {l.date} {l.reason && `— ${l.reason}`}{' '}
                    <button className="btn-link" onClick={() => removeLeave(d._id, l.date)}>remove</button>
                  </li>
                ))}
              </ul>
              <div className="btn-row">
                <input type="date" onChange={(e) => setLeaveDate({ ...leaveDate, [d._id]: e.target.value })} />
                <button className="btn-secondary" onClick={() => addLeave(d._id)}>Mark on Leave</button>
              </div>
              <p className="muted small">Marking leave on a date with existing bookings will cancel those appointments and email affected patients automatically.</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
