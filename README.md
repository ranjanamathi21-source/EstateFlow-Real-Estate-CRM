# EstateFlow — Real Estate CRM

A submission-ready full-stack Real Estate CRM with a premium SaaS-style UI for the technical assignment. It supports lead management, role-based access, project/building/unit management, booking protection, dashboard reporting, validation, responsive UI, premium dashboard styling, polished login experience, loading/empty/error states and REST APIs.

## Stack
- Frontend: HTML, CSS, vanilla JavaScript
- Backend: Node.js + Express
- Database: SQLite with better-sqlite3
- Authentication: JWT + bcryptjs

## Run locally
Requirements: Node.js 22 LTS recommended.

```bash
npm install
npm start
```
Open `http://localhost:3000`.

On Windows PowerShell, if `npm` is blocked by execution policy, use `npm.cmd install` and `npm.cmd start`.

## Demo accounts
- Admin: `admin@estateflow.com` / `Admin@123`
- Sales: `priya@estateflow.com` / `Sales@123`
- Sales: `arun@estateflow.com` / `Sales@123`

## Core API overview
- `POST /api/auth/login` — login and JWT token
- `GET /api/me` — current session
- `GET/POST/PUT/DELETE /api/leads` — lead CRUD (delete is Admin-only)
- `GET/POST/PUT/DELETE /api/projects` — project CRUD (Admin-only mutations)
- `GET/POST/PUT/DELETE /api/buildings` — building CRUD (Admin-only mutations)
- `GET/POST/PUT/DELETE /api/units` — unit CRUD (Admin-only mutations)
- `GET /api/properties` — joined property/unit view
- `GET/POST /api/bookings` — booking list and protected booking creation
- `GET /api/dashboard` — sales dashboard metrics and upcoming follow-ups

## Database relationships
- Project 1 → many Buildings
- Building 1 → many Units
- Lead 1 → many Bookings over the data model, while each Unit can have at most one Booking
- User 1 → many assigned Leads / Bookings
- Foreign keys are enabled in SQLite.

## Key design decisions
1. **Vanilla frontend + Express:** keeps the assignment small, fast to run and easy to review without a frontend build pipeline.
2. **SQLite + relational foreign keys:** provides a portable local database with clear Project → Building → Unit and Lead → Booking relationships.
3. **Transactional booking protection:** booking creation checks availability, inserts the booking and marks the unit booked inside one database transaction; `bookings.unit_id` is also unique as a second guard.
4. **Role-based authorization:** Admin manages property master data and can delete leads; Sales Employees only manage leads assigned to them and can book against those leads.
5. **Responsive, state-aware UI:** search/filter tables, empty states, loading state, inline error/success feedback, mobile navigation and confirmation dialogs are included.

## Submission checklist
- Push this folder to GitHub.
- Include screenshots of Login, Dashboard, Leads, Properties and Bookings.
- Add the deployed URL if you deploy it.
- Do not commit `src/crm.db` if you want a clean repository; the app creates and seeds it automatically on first run.
## Screenshots

### Login
![Login](c:\Users\WIN\Pictures\Screenshots\Screenshot (153).pngS)

### Dashboard
![Dashboard](c:\Users\WIN\Pictures\Screenshots\Screenshot (160).png)

### Leads
![Leads](c:\Users\WIN\Pictures\Screenshots\Screenshot (158).png)

### Properties
![Properties](c:\Users\WIN\Pictures\Screenshots\Screenshot (156).png)

### Bookings
![Bookings](c:\Users\WIN\Pictures\Screenshots\Screenshot (159).png)