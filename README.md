# Appointment Desk (MERN)

A small clinic appointment manager: JWT authentication, role-based access, and full CRUD with search and filters.
**All data is fictional. No real patient or company information is used.**

## Features
- Register and log in (bcrypt-hashed passwords, JWT, 1 day expiry)
- Roles: `patient` (own appointments), `doctor` (own schedule), `admin` (everything)
- Create, view, edit, delete appointments
- Search by patient name; filter by status, type, doctor, date range
- Double-booking protection (same doctor, same time)
- Input validation with Zod; past dates rejected

Each appointment has: patient name, date and time, doctor, appointment type, status (plus optional notes).

## Run locally
Requirements: Node 18+, MongoDB running locally (or a MongoDB Atlas URI).

```bash
# backend
cd backend
cp .env.example .env        # then set JWT_SECRET
npm install
npm run seed                # fictional demo users and appointments
npm run dev                 # http://localhost:5000

# AI service (second terminal). Needs Python 3.10+
cd ai-service
python -m venv .venv
.venv\Scripts\activate              # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
copy .env.example .env              # add GROQ_API_KEY, and the same INTERNAL_KEY value as AI_INTERNAL_KEY in backend/.env
uvicorn app.main:app --port 8000

# frontend (third terminal)
cd frontend
npm install
npm run dev                 # http://localhost:5173
```

Demo logins (password `Password123!`): `admin@example.test`, `silva@example.test`, `patient@example.test`

## Run with Docker Compose
Requirements: Docker Desktop with Docker Compose v2.

Before starting the stack, create the environment files required by the two application services:

```bash
copy backend\.env.example backend\.env
copy ai-service\.env.example ai-service\.env
```

On macOS or Linux, use `cp backend/.env.example backend/.env` and
`cp ai-service/.env.example ai-service/.env` instead. Set a strong `JWT_SECRET` in
`backend/.env`, and make sure `AI_INTERNAL_KEY` in `backend/.env` matches
`INTERNAL_KEY` in `ai-service/.env`. Set `GROQ_API_KEY` if you want to use the AI
features.

Build and start all services from the repository root:

```bash
docker compose up --build
```

The application is then available at:

- Frontend: http://localhost:5173
- Backend API: http://localhost:5000
- MongoDB: `mongodb://localhost:27017`

The backend connects to MongoDB and the AI service using the Docker service names
configured in `docker-compose.yml`. MongoDB data is stored in the `mongo-data`
named volume. The backend and frontend wait for their dependencies to pass their
health checks before starting.

The Compose setup starts with an empty database. In a second terminal, create the
fictional demo data with:

```bash
docker compose exec backend npm run seed
```

To load the larger synthetic dataset, use
`docker compose exec backend node src/seed-bulk.js` instead. Stop the services
with `Ctrl+C`, or run:

```bash
docker compose down
```

To also remove the persisted MongoDB data, run `docker compose down --volumes`.

## Demo data
`npm run seed` creates a handful of records. `npm run seed:bulk` (in `backend`) creates **60 fictional patients and 1000 appointments** (5 doctors, about 12 months of history plus upcoming visits, with intake details and medications). It is deterministic and safe to re-run (it only replaces its own `@bulk.example.test` patients). AI summaries are *not* pre-generated; they are created on demand.
Everything is synthetic. Patterns such as the no-show rate are invented by the generator, so any model trained on this data only rediscovers those rules and says nothing about real clinics.

## Tests
```bash
cd backend && npm test          # Jest + Supertest (AI service is mocked)
cd ai-service && python -m pytest   # Groq is mocked, no key needed
```
Uses Jest, Supertest and an in-memory MongoDB (downloaded on first run), so no database setup is needed.

## API
| Method | Path | Notes |
|---|---|---|
| POST | /api/auth/register | creates a patient |
| POST | /api/auth/login | returns token |
| GET | /api/auth/me | current user |
| GET | /api/doctors | list doctors |
| POST | /api/appointments | create |
| GET | /api/appointments?q=&status=&type=&doctor=&from=&to= | list, search, filter |
| GET | /api/appointments/:id | one |
| PUT | /api/appointments/:id | edit |
| DELETE | /api/appointments/:id | delete |

## Design decisions
- Authorization is enforced in the API (the query is scoped by role), not just hidden in the UI. Out-of-scope records return 404.
- Patients can only reschedule or cancel their own *scheduled* appointments; only staff can set other statuses.
- Public registration only creates patients; doctors and admins come from the seed script.
- Search text is regex-escaped so user input cannot become a regex.
- The Groq API key (next phase) will stay in the backend `.env` and never reach the browser.

## How I used AI
_Fill this in honestly after you review the code:_ which tools and prompts you used, what the AI got wrong, how you found and fixed it, and which tests or improvements you added yourself.

## AI features
```
React -> Express (JWT, MongoDB) -> Python FastAPI AI service -> Groq
```
The browser only talks to Express. The AI service is internal (`X-Internal-Key`), and the Groq key never leaves `ai-service/.env`.
The app works fully without the AI service: AI calls fail with a clear message and nothing else breaks.

1. **Pre-visit summary** (doctor). Patients optionally enter symptoms, medications and allergies when booking. A summary (key symptoms, medications, allergies, red flags) is generated in the background and shown to the doctor. It is cleared when the intake changes and can be regenerated.
2. **Prepare for your visit** (patient). Uses past completed appointments and the medication list to suggest what to tell the doctor and what to ask. Medication concerns are always labelled "Confirm with your doctor or pharmacist". That text is set by code, not by the model.
3. **Natural language booking**. "Book a checkup with Dr. Silva next Tuesday 3pm" fills the form. The model only copies phrases; the doctor is fuzzy-matched against real doctors, the type against the allowed list, and the date is resolved in code (Asia/Colombo). Nothing is saved until the user confirms, and the normal validation and double-booking check still run.

### Safety design
- Decision support only: no diagnosis, treatment or dose advice. Disclaimer shown in the UI.
- Prompt rules **and** code checks: output is validated with Pydantic (Python) and Zod (Express); a phrase filter blocks "stop taking", dose changes, "you may have..." and "safe to take".
- Rule-based red flags (e.g. chest pain) are added regardless of what the model says.
- User text is untrusted: wrapped in tags, angle brackets stripped, and the model has no tools, so prompt injection can only change wording, not actions.
- Data minimisation: no patient name, email or ids are sent to Groq. Fictional data only.
- Temperature 0, JSON mode, 15s timeout and one retry on the provider call.

### Known AI limitations
"next Tuesday" is read as that weekday in the next calendar week; the user always reviews the pre-filled form. The red-flag list is a simple keyword list, not a clinical triage tool.

## Known limitations
No pagination, no email notifications, no refresh tokens, no time zone handling beyond the browser's local time.
