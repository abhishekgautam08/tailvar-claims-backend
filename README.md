# Tailvar Claims Backend

Insurance policy and claims management backend built with Node.js, Express, and MongoDB (Mongoose).

## Mandatory Database Requirement: MongoDB Replica Set

**MongoDB multi-document transactions are strictly required for concurrent-safe claim submissions.** The backend enforces this at startup and will reject connections that do not support transactions.

- **Production**: Use **MongoDB Atlas** (all Atlas clusters run as replica sets with transaction support out of the box).
- **Local Development**:
  - Connect to a free-tier **MongoDB Atlas** replica set, OR
  - Start local mongod as a single-node replica set:
    ```bash
    mongod --replSet rs0 --dbpath <data-dir>
    # In mongosh:
    rs.initiate()
    ```
- **Automated Tests**: Handled automatically via `MongoMemoryReplSet` (single-node WiredTiger replica set).

---

## Installation & Quick Start

```bash
cd tailvar-claims-backend
npm install
```

### Environment Configuration

Configure environment variables in `.env` (refer to `.env.example`):
- `PORT`: HTTP port (default: `5000`, binds to `0.0.0.0`)
- `NODE_ENV`: `development` or `production`
- `MONGODB_URI`: MongoDB connection string (**required**, must point to a replica set or Atlas)
- `JWT_SECRET`: Secret key for JWT signing (**required**; in `production`, minimum 32 characters required)
- `JWT_EXPIRES_IN`: Token validity period (e.g. `1d`)
- `CLIENT_ORIGIN`: Comma-separated CORS allowlist (e.g. `http://localhost:3000,http://localhost:5173`)

### Database Seeding

Seed default demo accounts:
```bash
npm run seed
```
Demo accounts created:
- `customer1` / `Customer1@Demo26` (`CUSTOMER`)
- `customer2` / `Customer2@Demo26` (`CUSTOMER`)
- `admin` / `Admin@Demo26` (`ADMIN`)

To seed sample demo policies for each customer (if no policies exist yet):
```bash
npm run seed:demo
# or: node scripts/seed.js --demo
```
- `customer1`: 2026-01-01 to 2026-12-31, SI: ₹10,00,000 (`POL-0001`)
- `customer2`: 2026-01-01 to 2026-12-31, SI: ₹5,00,000 (`POL-0002`)

### Running the Server

```bash
# Development (with nodemon)
npm run dev

# Production
npm start
```

---

## 🚀 Deployment Guide (Render + MongoDB Atlas)

### 1. MongoDB Atlas Setup

1. **Create an Atlas Cluster**:
   - Log into [MongoDB Atlas](https://www.mongodb.com/cloud/atlas).
   - Create a free shared cluster (M0). All Atlas clusters are multi-node replica sets by default, fully supporting multi-document ACID transactions.
2. **Database & User**:
   - Create a database user under **Security > Database Access** (e.g. `tailvar_app_user`) with `readWriteAnyDatabase` or `readWrite` on `tailvar_claims_prod`.
   - Use a strong, URL-encoded password (avoid special characters that break URI strings or percent-encode them).
3. **Network Access**:
   - Under **Security > Network Access**, add IP Access: `0.0.0.0/0` (Allow access from anywhere). This is required because Render spins up services with dynamic outbound IPs.
4. **Connection String**:
   - In Atlas, click **Connect > Drivers (Node.js)**.
   - Format:
     ```
     mongodb+srv://<username>:<password>@<cluster-address>.mongodb.net/tailvar_claims_prod?retryWrites=true&w=majority
     ```

### 2. Render Deployment Setup

1. **Create Web Service**:
   - In [Render Dashboard](https://dashboard.render.com/), click **New > Web Service**.
   - Connect your repository and select the `tailvar-claims-backend` directory as Root Directory (or build from root).
2. **Build and Start Settings**:
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `node src/server.js` (or `npm start`)
3. **Environment Variables on Render**:
   - `NODE_ENV`: `production`
   - `MONGODB_URI`: `<your-atlas-connection-string>`
   - `JWT_SECRET`: Secure 32+ character hex string. Generate via:
     ```bash
     node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
     ```
   - `JWT_EXPIRES_IN`: `1d`
   - `CLIENT_ORIGIN`: URL of your deployed frontend (e.g. `https://tailvar-claims-frontend.onrender.com`), plus local origins if needed: `https://tailvar-claims-frontend.onrender.com,http://localhost:3000`
   - *(Note: Render automatically injects `PORT`; the backend binds to `process.env.PORT` on `0.0.0.0`)*.

### 3. Free Tier Cold-Start Behavior & Keep-Alive

- **Inactivity Spin-down**: Render's free tier spins down instances after 15 minutes of inactivity.
- **Cold-Start Duration**: Initial request to a spun-down instance can take 40–60 seconds while the container initializes and connects to Atlas.
- **Keep-Alive Solution**:
  - Set up a free external ping monitor (e.g. [UptimeRobot](https://uptimerobot.com/), [cron-job.org](https://cron-job.org/), or a scheduled GitHub Action).
  - Target the lightweight health-check endpoint:
    ```
    GET https://<your-service>.onrender.com/api/health
    ```
  - Schedule requests every **10 to 14 minutes** to prevent container suspension during demonstration hours.

---

## 🧪 Live Smoke Test Tool

Run comprehensive end-to-end integration and concurrency checks against any deployed instance or local server:

```bash
# Against local instance:
npm run smoke -- http://localhost:5000

# Against deployed Render instance:
npm run smoke -- https://tailvar-claims-backend.onrender.com
```

The smoke test verifies 12 key criteria:
1. `/api/health` returns 200 with `{ status: "ok" }`.
2. Login for `customer1`, `customer2`, and `admin`; rejects invalid password with 401.
3. Unauthenticated requests return 401.
4. Role permissions: Customer cannot create policies (403), view customers (403), or adjudicate claims (403).
5. Role permissions: Admin cannot submit claims (403).
6. Policy creation: Admin creates policy for Customer 1; Customer 1 sees it, Customer 2 gets 404.
7. Policy validation: Rejected on inverted date ranges, 0 sum insured, or negative amounts.
8. Spec Example: 6L submitted (rem 4L); 5L rejected (422); admin rejects 6L; remaining returns to 10L; 5L accepted; admin approves it; duplicate decision returns 409.
9. Incident date boundaries: Rejected outside policy range; accepted exactly on start and end dates.
10. Claim isolation: Customer 2 cannot view or fetch Customer 1 claims.
11. ACID Concurrency: 5 simultaneous claims of 4L on 10L policy -> **exactly 2 succeed and 3 reject**.
12. Reports summary with `PASS`/`FAIL` per test and exits non-zero if any test fails.

> ⚠️ **Note**: Smoke testing creates live records on fresh test policies in the target database. Use the reset tool below to return to baseline demo data.

---

## 🔄 Demo Reset Tool

To clean up test data and restore a clean baseline for demo presentations:

```bash
# Requires explicit --yes confirmation flag
npm run reset-demo -- --yes
```

**Actions performed**:
- Refuses to run without `--yes` flag.
- Deletes all claims and policies.
- Resets sequential counters so next policy is `POL-0001` and next claim is `CLM-0001`.
- Idempotently re-upserts demo user accounts (`customer1`, `customer2`, `admin`) without touching other users.
- Re-creates baseline demo policies:
  - `POL-0001` for `customer1` (SI: ₹10,00,000, 2026-01-01 to 2026-12-31)
  - `POL-0002` for `customer2` (SI: ₹5,00,000, 2026-01-01 to 2026-12-31)

---

## Automated Test Suite

```bash
npm test
```
Runs the full Jest test suite across the in-memory replica set testing ACID transactions, concurrency serialization, boundary checks, role isolation, and database reset logic.
