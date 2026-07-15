import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/axios';

export default function DoctorSearch() {
  const navigate = useNavigate();
  const [specialisation, setSpecialisation] = useState('');
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchDoctors = async (spec) => {
    setLoading(true);
    try {
      const { data } = await api.get('/doctors', { params: spec ? { specialisation: spec } : {} });
      setDoctors(data.doctors);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDoctors('');
  }, []);

  return (
    <div className="page">
      <h2>Find a Doctor</h2>
      <div className="search-bar">
        <input
          placeholder="Search by specialisation (e.g. Cardiology)"
          value={specialisation}
          onChange={(e) => setSpecialisation(e.target.value)}
        />
        <button className="btn-primary" onClick={() => fetchDoctors(specialisation)}>Search</button>
      </div>

      {loading && <p>Loading...</p>}

      <div className="grid">
        {doctors.map((d) => (
          <div className="card" key={d._id}>
            <h3>{d.user?.name}</h3>
            <p className="muted">{d.specialisation}</p>
            <p>{d.qualifications}</p>
            <p>Slot duration: {d.slotDurationMinutes} min</p>
            {d.consultationFee > 0 && <p>Fee: ₹{d.consultationFee}</p>}
            <button className="btn-primary" onClick={() => navigate(`/patient/book/${d._id}`)}>Book Appointment</button>
          </div>
        ))}
        {!loading && doctors.length === 0 && <p>No doctors found.</p>}
      </div>
    </div>
  );
}
