# Stock Management & Inventory Valuation

A full-stack stock management and inventory valuation application featuring an append-only ledger and dynamic FIFO / WAC costing replay.

## Architecture

- **Backend**: Node.js, Express, `pg` (PostgreSQL client)
- **Frontend**: React (Vite, plain JavaScript)
- **Database**: PostgreSQL (Append-only `stock_ledger` and `items` master)

## Database Setup

1. Create a PostgreSQL database (e.g. `stock_management`):
   ```sql
   CREATE DATABASE stock_management;
   ```
2. Run the schema script:
   ```bash
   psql -U postgres -d stock_management -f sql/schema.sql
   ```

## Backend Setup (`server/`)

1. Navigate to the `server` directory:
   ```bash
   cd server
   ```
2. Copy environment file and configure database credentials:
   ```bash
   cp .env.example .env
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Start development server:
   ```bash
   npm run dev
   ```
   Server will run on `http://localhost:5000` with health check available at `http://localhost:5000/health`.

## Frontend Setup (`client/`)

1. Navigate to the `client` directory:
   ```bash
   cd client
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start Vite dev server:
   ```bash
   npm run dev
   ```
   Client will run on `http://localhost:3000` with requests to `/api/*` proxied to the backend at `http://localhost:5000`.

