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

## Installation

```bash
cd tailvar-claims-backend
npm install
```

## Environment Configuration

Configure environment variables in `.env` (refer to `.env.example`):
- `PORT`: HTTP port (default: 5000)
- `NODE_ENV`: `development` or `production`
- `MONGODB_URI`: MongoDB connection string (**required**, must point to a replica set or Atlas)
- `JWT_SECRET`: Secret key for JWT signing (**required**; in `production`, minimum 32 characters required)
- `JWT_EXPIRES_IN`: Token validity period (e.g. `1d`)
- `CLIENT_ORIGIN`: Comma-separated CORS allowlist (e.g. `http://localhost:3000,http://localhost:5173`)

## Database Seeding

Seed default demo accounts:
```bash
npm run seed
```
Demo accounts created:
- `customer1` / `Customer1@Demo26` (`CUSTOMER`)
- `customer2` / `Customer2@Demo26` (`CUSTOMER`)
- `admin` / `Admin@Demo26` (`ADMIN`)

To additionally seed sample demo policies for each customer (if no policies exist yet):
```bash
npm run seed -- --demo
```
- `customer1`: 2026-01-01 to 2026-12-31, SI: ₹10,00,000 (`POL-0001`)
- `customer2`: 2026-01-01 to 2026-12-31, SI: ₹5,00,000 (`POL-0002`)

## Running the Server

```bash
# Development (with nodemon)
npm run dev

# Production
npm start
```

## Running Tests

```bash
npm test
```
Runs the full Jest test suite across in-memory replica set testing ACID transactions, concurrency serialization, boundary checks, and role isolation.
