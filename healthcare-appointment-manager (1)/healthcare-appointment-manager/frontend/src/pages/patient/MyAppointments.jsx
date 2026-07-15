import { useEffect, useState } from 'react';
import api from '../../api/axios';

const statusColors = {
  booked: 'blue',
  completed: 'green',
  cancelled: 'gray',
  cancelled_by_leave: 'orange',
  no_show: 'red',
};

export default function MyAppointments() {
  const [appointments, setAppointments] = useState([]);
  const [expanded, setExpanded] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    api.get('/appointments/mine').then(({ data }) => setAppointments(data.appointments)).finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const cancel = async (id) => {
    if (!confirm('Cancel this appointment?')) return;
    await api.patch(`/appointments/${id}/cancel`, { reason: 'Cancelled by patient' });
    load();
  };

  if (loading) return <p>Loading...</p>;

  return (
    <div className="page">
      <h2>My Appointments</h2>
      {appointments.length === 0 && <p>No appointments yet.</p>}
      <div className="list">
        {appointments.map((a) => (
          <div className="card" key={a._id}>
            <div className="row-between">
              <div>
                <b>{a.date} at {a.startTime}</b> with Dr. {a.doctor?.name}
                <span className={`badge badge-${statusColors[a.status] || 'gray'}`}>{a.status}</span>
              </div>
              <button className="btn-link" onClick={() => setExpanded(expanded === a._id ? null : a._id)}>
                {expanded === a._id ? 'Hide details' : 'View details'}
              </button>
            </div>

            {expanded === a._id && (
              <div className="details">
                <p><b>Specialisation:</b> {a.doctorProfile?.specialisation}</p>

                {a.symptomForm?.rawSymptoms && (
                  <div className="subcard">
                    <h4>Your symptom report</h4>
                    <p>{a.symptomForm.rawSymptoms}</p>
                    {a.symptomForm.llmSummary?.status === 'success' ? (
                      <p>AI urgency assessment: <b>{a.symptomForm.llmSummary.urgencyLevel}</b></p>
                    ) : (
                      <p className="muted">AI summary unavailable — doctor will review your symptoms directly.</p>
                    )}
                  </div>
                )}

                {a.status === 'completed' && a.postVisit?.llmPatientSummary && (
                  <div className="subcard">
                    <h4>Visit Summary</h4>
                    <p>{a.postVisit.llmPatientSummary.summaryText}</p>
                    {a.postVisit.llmPatientSummary.medicationSchedule && (
                      <>
                        <h5>Medication Schedule</h5>
                        <p>{a.postVisit.llmPatientSummary.medicationSchedule}</p>
                      </>
                    )}
                    {a.postVisit.llmPatientSummary.followUpSteps && (
                      <>
                        <h5>Follow-up</h5>
                        <p>{a.postVisit.llmPatientSummary.followUpSteps}</p>
                      </>
                    )}
                    {a.postVisit.prescription?.length > 0 && (
                      <>
                        <h5>Prescription</h5>
                        <ul>
                          {a.postVisit.prescription.map((p, i) => (
                            <li key={i}>{p.medicationName} — {p.dosage}, {p.frequencyPerDay}x/day for {p.durationDays} days ({p.instructions})</li>
                          ))}
                        </ul>
                      </>
                    )}
                  </div>
                )}

                {a.status === 'cancelled_by_leave' && (
                  <p className="alert alert-warn">This appointment was cancelled because the doctor took leave: {a.cancellationReason}</p>
                )}

                {a.status === 'booked' && (
                  <button className="btn-danger" onClick={() => cancel(a._id)}>Cancel Appointment</button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
