# Tailvar Claims Backend

Insurance policy and claims management backend built with Node.js, Express, and MongoDB (Mongoose).

## Prerequisites & Database Requirements

- **Node.js**: v18+ (tested on Node.js v24)
- **MongoDB**: 
  - **Transactions Support**: Multi-document transactions (used for concurrent-safe claim submissions) require a **MongoDB Replica Set** (e.g. MongoDB Atlas cluster, local replica set with `--replSet`, or `MongoMemoryReplSet` in tests). Standalone local `mongod` instances without `--replSet` do not support MongoDB transactions.

## Installation

```bash
cd tailvar-claims-backend
npm install
```

## Running Tests

```bash
npm test
```
The test suite utilizes `MongoMemoryReplSet` (single-node replica set) to test ACID transactions, concurrent claim submissions, and compare-and-set decision atomicity.

## Seeding Demo Users

```bash
npm run seed
```
Demo accounts:
- `customer1` / `Customer1@Demo26` (CUSTOMER)
- `customer2` / `Customer2@Demo26` (CUSTOMER)
- `admin` / `Admin@Demo26` (ADMIN)

## Running the Server

Development mode:
```bash
npm run dev
```

Production mode:
```bash
npm start
```

