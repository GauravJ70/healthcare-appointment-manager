# System Design Write-up

## 1. Double-Booking Prevention

The system uses a two-layer defense so that no two patients can ever end up
with a confirmed appointment for the same doctor, date, and time slot —
even if their requests arrive at the exact same millisecond.

**Layer 1 — Slot Hold.** When a patient selects a slot, the backend inserts
a `SlotHold` document with a compound **unique index** on
`{doctor, date, startTime}`. If two patients click the same slot
concurrently, MongoDB's index enforcement (not application logic) rejects
the second insert with a duplicate-key error, which is translated into a
"slot no longer available" response. Holds expire automatically via a
**TTL index** on `expiresAt` (default 5 minutes), so an abandoned booking
flow doesn't permanently lock a slot — no cleanup cron needed.

**Layer 2 — Final Booking.** After the patient submits their symptom form,
`confirmSlot()` validates the hold still exists and belongs to them, then
inserts the real `Appointment`. The `Appointment` collection carries the
*same kind* of unique index — `{doctor, date, startTime}`, partially
filtered to `status: booked | completed` — as the ultimate source of truth.
Even if the hold layer were somehow bypassed, this index makes a true
double-booking structurally impossible at the storage layer, not just
application-checked. A race that slips past the hold still fails at insert
time and returns a clean "just booked by someone else" error rather than
corrupting data.

This avoids needing a distributed lock service (e.g. Redis locks) while
still being safe under concurrent requests, because MongoDB guarantees
atomicity of a single-document insert against a unique index.

## 2. Doctor Leave Conflict Handling

Leave days live on `DoctorProfile.leaveDays` as `{date, reason}`. Two
things happen when an admin adds a leave day:

1. **Future availability** — `getAvailableSlots()` checks `leaveDays`
   before generating candidate slots for a date, so patients can never book
   into a day the doctor has already marked off.
2. **Existing bookings** — the same admin action queries all `Appointment`s
   for that doctor/date with `status: booked`, and for each one:
   - flips status to `cancelled_by_leave` with the leave reason recorded,
   - deletes both the patient's and doctor's Google Calendar events
     (best-effort — failures are logged, never thrown),
   - queues a `leave_conflict` email to the patient via the notification
     service.

This is done synchronously within the same admin request so the response
tells the admin exactly how many patients were affected and notified,
rather than relying on a background sweep that could leave a window where
the leave day exists but patients are still unaware.

## 3. Slot Hold Mechanism

Booking is deliberately split into two API calls instead of one, precisely
to prevent a slow, LLM-and-network-heavy final booking step from becoming a
race-condition window:

- `POST /appointments/hold` — cheap, fast, immediately reserves the slot.
- `POST /appointments/confirm` — happens after the (potentially slow)
  symptom form + LLM call, and finalizes the actual `Appointment`.

Without the hold step, a patient could select a slot, spend two minutes
writing out symptoms, and lose the slot to someone else mid-flow with no
warning until submission fails. With the hold, the slot is invisible to
other patients (excluded from `getAvailableSlots`) the moment it's picked.
If the patient abandons the tab, the TTL index reclaims the slot
automatically within `SLOT_HOLD_TTL_SECONDS`, so slots don't get "stuck"
held forever — a common failure mode of hold-without-expiry designs.

## 4. Notification Failure Handling

Every outbound email — booking confirmation, reminder, cancellation,
leave-conflict notice, medication reminder — is first written to a durable
`Notification` collection with `status: pending`, then an immediate send is
attempted. If the immediate attempt fails (SMTP outage, network blip, rate
limiting), the document is **not** discarded: it's marked with
`nextRetryAt` computed via exponential backoff (`2^attempts` minutes,
capped at 60), and a background job (`emailRetryJob`, every 5 minutes by
default) sweeps for anything due and retries it, up to `maxAttempts`
(default 5). This decouples "the booking succeeded" from "the email
succeeded" — a temporarily-down email provider never blocks or rolls back
an appointment, and no notification is silently lost.

The same graceful-degradation philosophy applies to LLM and Calendar calls:
each is wrapped so failures return a structured fallback (e.g.
`{status: 'failed'}` for LLM, `null` event ID for calendar) instead of
throwing, so a third-party outage in any one integration never cascades
into a broken booking flow for the other two.
