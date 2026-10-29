# Full-Stack Support Desk System

A small full-stack support ticket desk for creating, assigning, searching, and updating customer support tickets. It includes public replies, internal notes, an activity timeline, dashboard counts, and a 24-hour overdue indicator.

## Stack

- **Frontend:** React 18, Vite 5
- **Backend:** Node.js, Express 4
- **Database:** SQLite via `better-sqlite3`
- **Tests:** Node's built-in `node:test` runner and `fetch`

## Requirements

- Node.js with built-in `fetch` support (Node.js 18 or newer recommended)
- npm

## Setup and run

Open two PowerShell terminals from the project root.

### Backend

```powershell
Set-Location 'E:\Full-Stack Support Desk System\backend\server'
npm install
npm run dev
```

The API listens on port **4000** by default. For a regular start without file watching, use `npm start`.

Optional backend environment variables can be set in the same PowerShell terminal before starting the server:

```powershell
$env:PORT = '4000'
$env:DB_PATH = 'E:\Full-Stack Support Desk System\backend\server\supportdesk.db'
npm run dev
```

`PORT` changes the API listening port. `DB_PATH` selects the SQLite database file; by default it is `backend\server\supportdesk.db`. Set `DB_PATH` to a writable file path. The frontend Vite proxy is configured for `http://localhost:4000`, so update [vite.config.js](./frontend/client/vite.config.js) if you change the API port.

### Frontend

In the second PowerShell terminal:

```powershell
Set-Location 'E:\Full-Stack Support Desk System\frontend\client'
npm install
npm run dev
```

Open **http://localhost:5173**. Vite serves the React app on port **5173** and proxies `/api` requests to the backend at `http://localhost:4000`.

### Run the backend tests

```powershell
Set-Location 'E:\Full-Stack Support Desk System\backend\server'
npm test
```

The integration tests launch a separate backend process with `DB_PATH` set to a temporary SQLite file. They do not use or alter the normal project database.

## Database schema

The database initializes these tables when the backend starts:

- **agents:** seeded support-agent names and IDs.
- **tickets:** subject, customer, description, priority, status, optional assignee, and creation/update timestamps.
- **comments:** public `reply` messages and internal `note` messages associated with tickets.
- **activity:** ticket creation and changes to status, priority, assignee, or ticket details, plus comment activity.

Ticket deletion cascades to its comments and activity history. If the agents table is empty, the backend seeds Asha Verma, Rohan Mehta, and Sara Khan.

## API endpoints

All endpoints are served by the backend on port 4000. JSON request bodies use `Content-Type: application/json`.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/agents` | List available agents. |
| `GET` | `/api/dashboard` | Return ticket totals, status counts, unresolved urgent tickets, and overdue tickets. |
| `GET` | `/api/tickets` | List tickets. Optional query parameters: `q` searches subject/customer; `status`, `priority`, and `assignee` filter; `assignee=unassigned` selects unassigned tickets; `sort=priority` sorts by priority (default is recent update). |
| `POST` | `/api/tickets` | Create a ticket. Required fields: `subject`, `customer`, `description`. Optional fields: `priority`, `status`, `assignee_id`, `actor`. Returns `201`. |
| `GET` | `/api/tickets/:id` | Get a ticket with its comments and activity history. |
| `PATCH` | `/api/tickets/:id` | Update any supplied ticket fields: `subject`, `customer`, `description`, `priority`, `status`, `assignee_id`; optional `actor` identifies the recorded actor. |
| `POST` | `/api/tickets/:id/comments` | Add a comment. Required fields: `type` (`reply` or `note`), `content`, and `author`. Returns `201`. |
| `DELETE` | `/api/tickets/:id` | Delete a ticket and cascade-delete its comments and activity history. Returns `204`. |

Valid statuses are `Open`, `In Progress`, `Waiting on Customer`, and `Resolved`. Valid priorities are `Low`, `Medium`, `High`, and `Urgent`. Validation failures return `400` with an `error` and a `details` object; unknown ticket IDs return `404`.

## Architecture

The React/Vite client in `frontend\client` calls the JSON API through its `/api` proxy. The Express application in `backend\server\src\index.js` mounts ticket and metadata routes. Route handlers use the shared SQLite connection and schema initializer in `backend\server\src\db.js`. Ticket mutations and their activity records are written transactionally. Dashboard counts are calculated from stored tickets when requested.

## Assumptions and current behavior

- The acting agent is selected in the UI and sent as an `actor` or `author` string. This is attribution only; it is not authentication.
- A ticket is overdue when it is more than 24 hours old and is not `Resolved`. This is a simple age rule, not a configurable SLA.
- Deleting a ticket permanently removes the ticket, comments, and activity history.
- SQLite stores the data locally at the backend's default `supportdesk.db` path unless `DB_PATH` is set.

## What works

- Create, view, edit, assign, search, filter, sort, and delete tickets.
- Update status and priority, with activity history for changes.
- Add public replies and internal notes.
- Dashboard totals for tickets by status, urgent unresolved tickets, and overdue tickets.
- SQLite persistence and validation for API inputs.
- Automated API integration tests using an isolated temporary database.

## Incomplete / not implemented

- **Login and roles:** there is no authentication or authorization; the acting-agent selector does not enforce identity or permissions.
- **Pagination:** ticket listing currently returns all matching tickets.
- **SLA management:** overdue is a fixed 24-hour age calculation; there are no configurable response/resolution targets, business hours, or escalation rules.

## Before creating a ZIP

The project `.gitignore` excludes dependencies, build output, SQLite database files, and `.env` files. They are intentionally left in place during setup and testing. From the project root, run these PowerShell commands immediately before creating a submission ZIP if you want to omit local dependencies and the local database:

```powershell
Remove-Item -Recurse -Force .\node_modules, .\backend\server\node_modules, .\frontend\client\node_modules -ErrorAction SilentlyContinue
Remove-Item -Force .\backend\server\supportdesk.db, .\backend\server\supportdesk.db-wal, .\backend\server\supportdesk.db-shm -ErrorAction SilentlyContinue
```
