import { useEffect, useState } from 'react';
import api from '../../api/axios';

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export default function Schedule() {
  const [date, setDate] = useState(todayStr());
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeAppt, setActiveAppt] = useState(null); // appointment being written up
  const [notes, setNotes] = useState('');
  const [followUp, setFollowUp] = useState('');
  const [prescription, setPrescription] = useState([{ medicationName: '', dosage: '', frequencyPerDay: 2, durationDays: 5, instructions: '' }]);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);

  const load = () => {
    setLoading(true);
    api.get('/appointments/mine', { params: { date } }).then(({ data }) => setAppointments(data.appointments)).finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  const openWriteUp = (appt) => {
    setActiveAppt(appt);
    setNotes('');
    setFollowUp('');
    setPrescription([{ medicationName: '', dosage: '', frequencyPerDay: 2, durationDays: 5, instructions: '' }]);
    setResult(null);
  };

  const updateMed = (idx, field, value) => {
    const next = [...prescription];
    next[idx][field] = value;
    setPrescription(next);
  };

  const addMedRow = () => setPrescription([...prescription, { medicationName: '', dosage: '', frequencyPerDay: 2, durationDays: 5, instructions: '' }]);

  const submitPostVisit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const { data } = await api.post(`/appointments/${activeAppt._id}/post-visit`, {
        clinicalNotes: notes,
        followUp,
        prescription: prescription.filter((p) => p.medicationName.trim() !== ''),
      });
      setResult(data.appointment.postVisit.llmPatientSummary);
      load();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="page">
      <h2>My Schedule</h2>
      <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />

      {loading && <p>Loading...</p>}
      {!loading && appointments.length === 0 && <p>No appointments on this date.</p>}

      <div className="list">
        {appointments.map((a) => (
          <div className="card" key={a._id}>
            <div className="row-between">
              <b>{a.startTime} — {a.patient?.name}</b>
              <span className={`badge`}>{a.status}</span>
            </div>

            {a.symptomForm?.rawSymptoms && (
              <div className="subcard">
                <h4>Pre-visit AI Summary</h4>
                {a.symptomForm.llmSummary?.status === 'success' ? (
                  <>
                    <p><b>Urgency:</b> {a.symptomForm.llmSummary.urgencyLevel}</p>
                    <p><b>Chief complaint:</b> {a.symptomForm.llmSummary.chiefComplaint}</p>
                    <p><b>Suggested questions:</b></p>
                    <ul>{a.symptomForm.llmSummary.suggestedQuestions?.map((q, i) => <li key={i}>{q}</li>)}</ul>
                  </>
                ) : (
                  <p className="muted">AI summary unavailable — raw symptoms: {a.symptomForm.rawSymptoms}</p>
                )}
              </div>
            )}

            {a.status === 'booked' && (
              <button className="btn-primary" onClick={() => openWriteUp(a)}>Complete Visit</button>
            )}
          </div>
        ))}
      </div>

      {activeAppt && (
        <div className="modal-backdrop" onClick={() => setActiveAppt(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Post-Visit Notes — {activeAppt.patient?.name}</h3>
            {!result ? (
              <form onSubmit={submitPostVisit}>
                <label>Clinical notes</label>
                <textarea required rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} />

                <label>Prescription</label>
                {prescription.map((p, idx) => (
                  <div className="med-row" key={idx}>
                    <input placeholder="Medication" value={p.medicationName} onChange={(e) => updateMed(idx, 'medicationName', e.target.value)} />
                    <input placeholder="Dosage e.g. 500mg" value={p.dosage} onChange={(e) => updateMed(idx, 'dosage', e.target.value)} />
                    <input type="number" placeholder="x/day" value={p.frequencyPerDay} onChange={(e) => updateMed(idx, 'frequencyPerDay', Number(e.target.value))} />
                    <input type="number" placeholder="days" value={p.durationDays} onChange={(e) => updateMed(idx, 'durationDays', Number(e.target.value))} />
                    <input placeholder="Instructions" value={p.instructions} onChange={(e) => updateMed(idx, 'instructions', e.target.value)} />
                  </div>
                ))}
                <button type="button" className="btn-link" onClick={addMedRow}>+ Add medication</button>

                <label>Follow-up instructions</label>
                <textarea rows={2} value={followUp} onChange={(e) => setFollowUp(e.target.value)} />

                <div className="btn-row">
                  <button type="button" className="btn-secondary" onClick={() => setActiveAppt(null)}>Cancel</button>
                  <button className="btn-primary" disabled={submitting}>{submitting ? 'Saving...' : 'Save & Generate Summary'}</button>
                </div>
              </form>
            ) : (
              <div>
                <h4>Patient-friendly summary generated:</h4>
                <p>{result.summaryText}</p>
                <p><b>Medication schedule:</b> {result.medicationSchedule}</p>
                <p><b>Follow-up:</b> {result.followUpSteps}</p>
                <button className="btn-primary" onClick={() => setActiveAppt(null)}>Done</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
