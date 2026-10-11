# Lunar Veil Cafe System Overview

## 1. System at a glance

**Lunar Veil Cafe** is a cafe ordering and operations system. Customers browse a menu, place and track orders, while staff manage payment confirmation, food preparation, delivery, menu items, production tasks, and staff approvals. The project also includes a dashboard, audit/activity logs, and evidence views intended to support a System Integration and Architecture presentation.

The primary implementation is a browser interface served by an Express API, with MongoDB as the persistent database. The frontend can also be opened directly as a standalone HTML file; in that mode it uses browser `localStorage` and its legacy in-page logic instead of the API/database.

## 2. Technology stack

| Layer | Technology | Use in this system |
|---|---|---|
| Frontend | HTML, CSS, vanilla JavaScript | Single-page cafe interface in `public/index.html`; no frontend framework or bundler is configured. |
| Backend | Node.js 18+ and Express 4 | HTTP server, static file hosting, JSON API routes, authentication middleware, and error handling. |
| Database | MongoDB 7 compatible server, MongoDB Node.js driver 6 | Persistent users, sessions, menu, orders, riders, tasks, and logs. |
| Authentication | Bearer token sessions; Node `crypto` | Random session tokens, password hashing with `scrypt`, and role-based authorization. |
| Testing support | Node `assert`; custom in-memory Mongo-like adapter | Business-rule tests can run without a MongoDB service. |
| Deployment options | Local MongoDB, Docker, or MongoDB Atlas | Database connection is configured through environment variables. |

Package dependencies are `express` and `mongodb` (see `package.json`).

## 3. Main user roles

- **Customer:** browse menu, place orders, and view their own orders.
- **Kitchen staff:** move paid orders through preparation and ready states.
- **Delivery rider:** accept/handle assigned deliveries and mark them delivered.
- **Restaurant staff manager:** manage menu and operations, orders, production tasks, and logs.
- **Administrator:** manager capabilities plus staff account approval and user administration.

Staff and manager accounts are pending until approved by an administrator. Customer and administrator accounts are active on creation. Administrator signup requires the `ADMIN_CODE` setup value.

## 4. Functional areas

### Menu and ordering

The seeded menu contains cafe items grouped into categories. Customers select item names and quantities and choose GCash, Card, or Cash. The API looks up item prices in the database and calculates totals itself, rather than trusting a price sent by the browser.

### Payment and order fulfillment

Order statuses follow this process:

`Pending Payment → Queued → Preparing → Ready → Out for Delivery → Delivered`

GCash and Card are treated as immediately confirmed by this project and receive a generated reference. Cash orders wait for a manager or administrator to confirm payment. Once an order is ready, the service tries to assign a free rider. Order status history is stored with each order.

**Integration limitation:** payment selection and confirmation are simulated in the application. There is no connection to a real GCash, card processor, or payment gateway in the code reviewed.

### Production tasks and asset review

Staff can create tasks under projects, submit asset version metadata, review the latest version (approve, request revision, or reject), add comments, and finalize approved work. The current asset submission records a file name/type and version metadata; it does not upload or store the actual file contents.

### Staff, logs, and dashboard

Administrators approve or reject staff accounts. The dashboard summarizes orders, revenue, delivery, and production task status. The backend records audit events, notifications, and API request logs in MongoDB.

## 5. Architecture and request flow

```text
Browser (public/index.html)
       │ fetch('/api/...') + Bearer token
       ▼
Express server (server.js)
  ├── serves public/ static files
  ├── authenticates API requests
  ├── routes requests to business services
  └── formats errors and records API activity
       ▼
Business rules (services.js)
       │ MongoDB driver operations
       ▼
MongoDB (db.js connection)
```

The frontend probes `/api/health`. When served by this server it uses the API and stores the session token in browser local storage. If opened as a file without the server, it falls back to the older local-only mode. The backend service layer is deliberately separate from Express so its rules can be exercised with the in-memory database adapter.

## 6. Data model

MongoDB collections initialized by `services.js`:

| Collection | What it stores |
|---|---|
| `users` | Username, password hash, role, and account status. |
| `sessions` | Bearer token, associated user ID, and creation time. |
| `menu` | Cafe item name, description, price, and category. |
| `orders` | Customer, total, payment and fulfillment state, rider, items, and embedded status history. |
| `riders` | Rider identifier and current busy/order marker. |
| `tasks` | Project/title/due date/status, embedded asset versions, and comments. |
| `audit_log` | Business events and actor. |
| `notifications` | System notification messages. |
| `api_log` | API method/path/result and caller metadata. |
| `counters` | Atomic numeric ID sequences. |

Indexes include unique usernames, unique menu names, and an order username lookup index.

## 7. API outline

Most endpoints require `Authorization: Bearer <token>`; health, signup, login, and menu listing are public.

| Area | Routes |
|---|---|
| Health/auth/profile | `GET /api/health`, `POST /api/auth/signup`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/me` |
| Menu | `GET /api/menu`, `POST /api/menu`, `DELETE /api/menu/:id` |
| Orders | `GET /api/orders`, `POST /api/orders`, `GET /api/orders/:id`, `PATCH /api/orders/:id/status` |
| Riders | `GET /api/riders` |
| Production tasks | `GET/POST /api/tasks`, `POST /api/tasks/:id/versions`, `POST /api/tasks/:id/review`, `POST /api/tasks/:id/finalize` |
| Users and logs | `GET /api/users`, `PATCH /api/users/:id`, `GET /api/logs`, `GET /api/api-log` |

Role checks and allowed status transitions are enforced in `services.js`. Errors are returned as JSON with an `error` field.

## 8. Local setup

Requirements: Node.js 18+ and a MongoDB instance.

```powershell
cd SIA-FINAL-PROJECT
docker run -d --name lunar-mongo -p 27017:27017 mongo:7
npm install
npm start
```

Open `http://localhost:3000`. Available environment variables:

| Variable | Default | Purpose |
|---|---|---|
| `MONGO_URL` | `mongodb://127.0.0.1:27017` | MongoDB connection string. |
| `MONGO_DB` | `lunar_veil` | Database name. |
| `PORT` | `3000` | HTTP server port. |
| `ADMIN_CODE` | `LUNAR-ADMIN` | Administrator signup code; change it outside a demo environment. |

On server startup the app initializes indexes and seeds the menu, riders, and sample tasks when the menu collection is empty.

## 9. Project file map

- `server.js` — Express application, routes, auth middleware, static hosting, and startup.
- `services.js` — business rules, role checks, workflows, persistence operations, seed records, and logging.
- `db.js` — MongoDB connection setup.
- `public/index.html` — browser UI, styles, API client, and standalone local-storage fallback.
- `test.js` — service-level business-rule checks.
- `test/memdb.js` — in-memory adapter used by `test.js`.
- `README.md` — concise run instructions and endpoint summary.
- `SYSTEM_OVERVIEW.md` — this organized SIA system reference.

## 10. Architecture notes and limitations

- This is a small monolithic application: one Express process serves both the UI and API, while the service module holds application logic.
- There is no separate frontend build system, message broker, external payment integration, or real asset storage service configured.
- The UI refreshes API data periodically while signed in; the project does not configure a WebSocket or server-sent event channel.
- Before public deployment, use HTTPS, set a strong administrator code, and add rate limiting to login as the README recommends.

## 11. Short presentation summary

“Lunar Veil Cafe is a web-based cafe ordering and operations system. Its browser interface communicates with a Node.js/Express REST API, which applies authentication, role permissions, and business rules before saving data in MongoDB. It integrates customer ordering with kitchen processing and rider dispatch, and also includes staff approval, production task review, and audit reporting. The project uses vanilla HTML/CSS/JavaScript, Express, the MongoDB driver, and Node crypto for password hashing and session tokens.”
