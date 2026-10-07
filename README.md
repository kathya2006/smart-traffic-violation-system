# Smart Traffic Violation Reporting System

A full-stack web application for reporting, verifying, fining and analysing traffic violations.
Citizens report offences with photo or video evidence, officers verify them, fines are issued by a
stored procedure, and every step is recorded in a relational **MySQL** database with a trigger-driven audit trail.

**Stack:** Node.js 22 · Express 5 · MySQL 8 (`mysql2` pool) · vanilla JS (ES modules) · Chart.js · glassmorphism UI with electric effects (lightning, particles, neon borders).

![ER diagram](docs/er-diagram.png)

## Features

| Area | What it does |
|---|---|
| Reporting | Vehicle + offence + place + time + evidence upload (4 files, 8 MB each), live fine estimate, location radar, duplicate-report detection |
| Workflow | Pending → Under Review → Verified / Rejected → Appealed → Closed, each change written to `violation_status_history` by a trigger |
| Fines | `sp_issue_fine` computes the fine (+ ₹200 per full 10 km/h over the limit, capped at ₹2,000); 30-day due date; 10 % late fee on overdue; paying closes the violation via trigger |
| Appeals | Citizens appeal; officers accept (violation rejected, fine waived) or reject (back to Verified) |
| Roles | **citizen** (own reports, plate-based fine lookup/payment, appeals) · **officer** (review, verify, assign, decide appeals, stats) · **admin** (everything + waive fines + delete) |
| Analytics | KPIs, 30-day trend, monthly revenue, peak-hour heat strip, hotspots, zones, repeat offenders, officer workload |
| Database page | Live connection status and latency, pool, table sizes, foreign keys, views, triggers, routines and the ER diagram |
| Security | bcrypt passwords, JWT, role checks on every route, parameterised SQL, helmet CSP, rate limiting, upload MIME/size checks, output escaping |

## Quick start

Requirements: **Node 20+** and **MySQL 8** (MariaDB 10.6+ also works).

```bash
# 1. configure
cd backend
cp .env.example .env          # then set DB_PASSWORD (and JWT_SECRET)

# 2. install + create the database, tables, views, trigger, procedure and demo data
npm install
npm run db:setup

# 3. run
npm start                     # http://localhost:5000
```

Open <http://localhost:5000>. The API also serves the frontend, so there is nothing else to start.

If your MySQL user is not allowed to create triggers/procedures with binary logging enabled, run once as root:
`SET GLOBAL log_bin_trust_function_creators = 1;`

### Demo accounts

| Role | Email | Password |
|---|---|---|
| Admin | admin@stvrs.in | Admin@123 |
| Officer | officer@stvrs.in | Officer@123 |
| Citizen | citizen@stvrs.in | Citizen@123 |

The login page also has one-click buttons for these. Demo data (≈170 violations, 125 fines, payments, appeals, evidence) is fictional and generated deterministically by `backend/scripts/generate-seed.js`.

### Useful scripts (run in `backend/`)

| Command | Purpose |
|---|---|
| `npm run db:setup` | Create schema + seed (refuses to wipe a database that already has data) |
| `npm run db:reset` | Drop and recreate everything (`--force`) |
| `npm run seed:generate` | Regenerate `database/seed.sql` |
| `npm test` | 62-check end-to-end API smoke test against the running server (run it on a freshly seeded DB, then `npm run db:reset`) |
| `python3 ../docs/generate_er.py` | Rebuild the ER diagram from `schema.sql` (needs Graphviz) |

## Database design

16 tables in 3NF, InnoDB, utf8mb4, 22 foreign keys, CHECK constraints, 2 views, 4 triggers, 1 stored procedure.
Full diagram and relationship table: [`docs/ER_DIAGRAM.md`](docs/ER_DIAGRAM.md) · SQL: [`database/schema.sql`](database/schema.sql).

* **People:** `users` (login), `officers` (1:1 extension of users, belongs to a `police_stations`), `owners`
* **Vehicles:** `vehicle_types`, `vehicles` (owner, insurance/PUC validity)
* **Rulebook:** `violation_categories`, `violation_types` (base fine, points, severity, law section), `locations` (coordinates, speed limit, camera)
* **Cases:** `violations`, `violation_evidence`, `fines` (generated column `total_due = amount + late_fee`), `payments`, `appeals`, `violation_status_history`, `notifications`
* **Views:** `v_violation_details`, `v_vehicle_offence_summary`
* **Triggers:** reference number + initial history row, status-change history, payment → fine paid → violation closed
* **Procedure:** `sp_issue_fine(violation_id)`

## API overview

All routes are under `/api`, JSON, `Authorization: Bearer <token>` except health/login/register.

| Route | Notes |
|---|---|
| `POST /auth/login · /register`, `GET/PATCH /auth/me`, `POST /auth/change-password` | Accounts |
| `GET /meta` | Dropdown data (violation types, locations, vehicle types, officers) |
| `GET /violations` (filters, sort, paging) · `GET /violations/export.csv` | List / export |
| `GET /violations/:id` · `POST /violations` · `PATCH /violations/:id/status · /assign` · `POST /violations/:id/evidence` · `DELETE /violations/:id` | Cases |
| `GET /vehicles/lookup?plate=` · `GET /vehicles?search=` | Registry |
| `GET /fines` · `POST /fines/:id/pay` · `POST /fines/:id/waive` · `GET /payments` | Fines |
| `GET /appeals` · `POST /appeals` · `PATCH /appeals/:id/review` | Appeals |
| `GET /stats/dashboard` · `GET /notifications` · `GET /admin/database` · `GET /health` | Insights |

## Project structure

```
backend/    Express API (src/routes, middleware, db pool), scripts (setup, seed, smoke test), uploads/
database/   schema.sql (tables, views, triggers, procedure) and generated seed.sql
docs/       ER diagram (SVG/PNG), generator script, relationship table
frontend/   index.html, css/ (glass theme), js/ (router, pages, charts, effects), vendor/ (Chart.js)
```

## Troubleshooting

* **"Can't connect" screen:** the server is not running or cannot reach MySQL; check `DB_*` in `backend/.env`.
* **`ER_ACCESS_DENIED`:** wrong `DB_USER`/`DB_PASSWORD`; the user needs rights to create the database.
* **Trigger/function creation error:** see the `log_bin_trust_function_creators` note above.
* **Frontend on another port (e.g. Live Server):** it automatically falls back to `http://localhost:5000` for the API.

## Notes

Fine amounts and legal sections are illustrative for demonstration and are not legal advice. The payment gateway is simulated; no real money moves.
Tested against MariaDB 10.11 (MySQL-compatible); the SQL uses only features available in MySQL 8.
