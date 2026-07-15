# LLM Prompts — Healthcare Appointment & Follow-up Manager

This document lists the exact prompts used for the two AI features in the
app, and how the system handles the LLM's response (including failures).
Both prompts are implemented in `backend/src/services/llmService.js`.

---

## 1. Pre-Visit Summary

**When it runs:** the moment a patient submits their symptom form while
confirming a booking (`POST /api/appointments/confirm`).

**Purpose:** gives the doctor a quick triage snapshot before the visit.

**Prompt template:**

```
Analyse these symptoms and return: urgency level (Low / Medium / High), chief complaint, and three suggested questions for the doctor. Symptoms: <symptoms>

Respond ONLY with valid JSON in this exact shape, no extra text:
{
  "urgencyLevel": "Low" | "Medium" | "High",
  "chiefComplaint": "string, one short sentence",
  "suggestedQuestions": ["string", "string", "string"]
}
```

`<symptoms>` is replaced with the patient's raw free-text symptom
description at request time.

**Example input:**
```
Chest pain and shortness of breath for the last 2 days, worse when lying down.
```

**Example output (parsed and stored):**
```json
{
  "urgencyLevel": "High",
  "chiefComplaint": "Chest pain and shortness of breath, worse when lying down",
  "suggestedQuestions": [
    "When did the symptoms first start, and have they been getting worse?",
    "Have you taken any medication or home remedy for this already?",
    "Do you have any relevant medical history or allergies I should know about?"
  ]
}
```

**Where it's shown:** doctor's "My Schedule" page, above the "Complete
Visit" button, before the visit happens.

---

## 2. Post-Visit Summary

**When it runs:** when the doctor submits clinical notes + prescription
(`POST /api/appointments/:id/post-visit`).

**Purpose:** turns clinical shorthand into something the patient can
actually understand.

**Prompt template:**

```
Convert these clinical notes into a patient-friendly summary with medication schedule and follow-up steps: <notes>

Respond ONLY with valid JSON in this exact shape, no extra text:
{
  "summaryText": "2-4 sentences in plain, non-clinical language",
  "medicationSchedule": "human-readable schedule, e.g. 'Take Amoxicillin 500mg three times a day after food for 5 days'",
  "followUpSteps": "what the patient should do next, in plain language"
}
```

`<notes>` is replaced with the doctor's raw clinical notes at request time.

**Example input:**
```
Pt presents URTI sx x3d. Afebrile. Rx Amoxicillin 500mg TDS x5d. Advise rest, fluids. RTC if fever >38.5C or sx worsen >7d.
```

**Example output (parsed and stored):**
```json
{
  "summaryText": "You have an upper respiratory tract infection that's been going on for about 3 days. You don't currently have a fever, and your doctor has prescribed antibiotics to help clear the infection.",
  "medicationSchedule": "Take Amoxicillin 500mg three times a day after food for 5 days.",
  "followUpSteps": "Rest and drink plenty of fluids. Come back if you develop a fever above 38.5°C or if symptoms haven't improved after 7 days."
}
```

**Where it's shown:** patient's "My Appointments" page, once the
appointment status is `completed`.

---

## Failure Handling (applies to both prompts)

The LLM call is wrapped so a failure **never blocks the booking or visit
flow**:

- Each call has a timeout (`LLM_TIMEOUT_MS`, default 8000ms).
- On failure, it retries with exponential backoff, up to `LLM_MAX_RETRIES`
  (default 2).
- If all retries fail, the function returns a structured fallback instead
  of throwing:
  - **Pre-visit failure:** `urgencyLevel` defaults to `"Medium"` (a safe
    middle ground — never silently downgraded to Low), `chiefComplaint`
    falls back to the first 100 characters of the raw symptoms, and the
    doctor's UI shows "AI summary unavailable — raw symptoms: ...".
  - **Post-visit failure:** the patient sees a generic
    "An automatic summary could not be generated. Please refer to the
    clinical notes and prescription from your doctor below." message, and
    the raw prescription list is still shown underneath.
- Every summary object also stores a `status` field (`success` / `failed`)
  and `errorMessage`, so failures are auditable in the database rather than
  silently swallowed.

---

## Provider Configuration

Set in `backend/.env`:

```
LLM_PROVIDER=mock        # mock | anthropic | openai
ANTHROPIC_API_KEY=       # only needed if LLM_PROVIDER=anthropic
OPENAI_API_KEY=          # only needed if LLM_PROVIDER=openai
LLM_TIMEOUT_MS=8000
LLM_MAX_RETRIES=2
```

`mock` (the default) runs the same two prompts through simple deterministic
rule-based logic instead of a real API call — no key needed, safe for
local dev and demos, and it exercises the exact same code path (JSON
shape, storage, failure handling) as the real providers.
