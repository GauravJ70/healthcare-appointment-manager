import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../api/axios';

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export default function BookAppointment() {
  const { profileId } = useParams();
  const navigate = useNavigate();

  const [doctor, setDoctor] = useState(null);
  const [date, setDate] = useState(todayStr());
  const [slots, setSlots] = useState([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [hold, setHold] = useState(null); // { holdId, expiresAt }
  const [symptoms, setSymptoms] = useState('');
  const [error, setError] = useState('');
  const [step, setStep] = useState(1); // 1: pick slot, 2: symptom form, 3: confirmed
  const [confirmedAppt, setConfirmedAppt] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.get(`/doctors/${profileId}`).then(({ data }) => setDoctor(data.doctor));
  }, [profileId]);

  useEffect(() => {
    if (!date) return;
    setLoadingSlots(true);
    setError('');
    api
      .get(`/doctors/${profileId}/availability`, { params: { date } })
      .then(({ data }) => setSlots(data.slots))
      .catch((err) => setError(err.response?.data?.message || 'Could not load availability'))
      .finally(() => setLoadingSlots(false));
  }, [date, profileId]);

  const selectSlot = async (slot) => {
    setError('');
    try {
      const { data } = await api.post('/appointments/hold', { doctorProfileId: profileId, date, startTime: slot });
      setHold({ holdId: data.holdId, expiresAt: data.expiresAt });
      setSelectedSlot(slot);
      setStep(2);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not hold this slot');
      // Refresh availability since the slot was likely just taken
      api.get(`/doctors/${profileId}/availability`, { params: { date } }).then(({ data }) => setSlots(data.slots));
    }
  };

  const cancelHold = async () => {
    if (hold) await api.delete(`/appointments/hold/${hold.holdId}`).catch(() => {});
    setHold(null);
    setSelectedSlot(null);
    setStep(1);
  };

  const confirmBooking = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const { data } = await api.post('/appointments/confirm', {
        holdId: hold.holdId,
        doctorProfileId: profileId,
        date,
        startTime: selectedSlot,
        symptoms,
      });
      setConfirmedAppt(data.appointment);
      setStep(3);
    } catch (err) {
      setError(err.response?.data?.message || 'Booking failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (!doctor) return <p>Loading doctor...</p>;

  return (
    <div className="page">
      <h2>Book with {doctor.user?.name}</h2>
      <p className="muted">{doctor.specialisation} · {doctor.slotDurationMinutes} min slots</p>

      {error && <div className="alert alert-error">{error}</div>}

      {step === 1 && (
        <div className="card">
          <label>Select a date</label>
          <input type="date" min={todayStr()} value={date} onChange={(e) => setDate(e.target.value)} />
          {loadingSlots && <p>Loading slots...</p>}
          {!loadingSlots && slots.length === 0 && <p>No available slots on this date.</p>}
          <div className="slot-grid">
            {slots.map((s) => (
              <button key={s} className="slot-btn" onClick={() => selectSlot(s)}>{s}</button>
            ))}
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="card">
          <p>
            Slot held: <b>{date} at {selectedSlot}</b> — please complete the symptom form within a few minutes or the hold will expire.
          </p>
          <form onSubmit={confirmBooking}>
            <label>Describe your symptoms</label>
            <textarea
              required
              rows={5}
              placeholder="e.g. Persistent headache for 3 days, mild fever, sensitivity to light..."
              value={symptoms}
              onChange={(e) => setSymptoms(e.target.value)}
            />
            <div className="btn-row">
              <button type="button" className="btn-secondary" onClick={cancelHold}>Back</button>
              <button className="btn-primary" disabled={submitting}>{submitting ? 'Booking...' : 'Confirm Booking'}</button>
            </div>
          </form>
        </div>
      )}

      {step === 3 && confirmedAppt && (
        <div className="card">
          <h3>✅ Appointment Confirmed</h3>
          <p>{date} at {selectedSlot} with {doctor.user?.name}</p>
          <p>AI-assessed urgency: <b>{confirmedAppt.symptomForm?.llmSummary?.urgencyLevel}</b></p>
          <p className="muted">A confirmation email and calendar invite have been sent.</p>
          <button className="btn-primary" onClick={() => navigate('/patient/appointments')}>View My Appointments</button>
        </div>
      )}
    </div>
  );
}
