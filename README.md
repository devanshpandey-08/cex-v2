# Mini Centralized Exchange (CEX)

A mini centralized exchange where the backend and engine communicate through Redis queues.

## Architecture

```
Frontend / API Client
        |
        v
Backend API (Express, port 3000)
        |
        v
Redis queue: backend-to-engine-broker
        |
        v
Engine process
        |
        v
Backend-specific response queue
        |
        v
Backend API Response
```

## Tech Stack

- **TypeScript** - Type-safe development
- **Bun** - Fast JavaScript runtime
- **Express** - Web framework for backend
- **Redis** - Message queue for backend-engine communication
- **Prisma/Postgres** - Database for user storage
- **JWT** - Authentication
- **Zod** - Request validation

## Project Structure

```
cex-v2/
├── backend/           # Express API server
│   ├── src/
│   │   ├── controllers/   # Request handlers
│   │   ├── routes/        # Route definitions
│   │   ├── middleware/    # Auth, error handling
│   │   ├── store/         # Pending responses
│   │   ├── types/         # TypeScript types
│   │   ├── utils/         # Auth, validators, engine client
│   │   └── index.ts       # Entry point
│   └── prisma/            # Database schema
├── engine/            # Order matching engine
│   ├── src/
│   │   ├── store/         # In-memory exchange state
│   │   ├── types/         # TypeScript types
│   │   ├── utils/         # Utilities
│   │   └── index.ts       # Entry point
└── package.json       # Workspace configuration
```

## Getting Started

### Prerequisites

- Bun installed (`curl -fsSL https://bun.sh/install | bash`)
- Redis running on localhost:6379
- PostgreSQL running on localhost:5432

### Setup

1. **Install dependencies:**
```bash
bun install
cd backend && bun install
cd ../engine && bun install
```

2. **Setup database:**
```bash
cd backend
bunx prisma migrate dev
```

3. **Start services:**

Terminal 1 - Backend:
```bash
cd backend
bun run dev
```

Terminal 2 - Engine:
```bash
cd engine
bun run dev
```

Or run both together from root:
```bash
bun run dev
```

## API Endpoints

### Authentication

#### POST /api/auth/signup
Create a new user account.

```json
// Request
{
  "username": "alice",
  "password": "password123"
}

// Response
{
  "message": "User created successfully",
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "uuid",
    "username": "alice"
  }
}
```

#### POST /api/auth/signin
Sign in and get a JWT token.

```json
// Request
{
  "username": "alice",
  "password": "password123"
}

// Response
{
  "message": "Signed in successfully",
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "uuid",
    "username": "alice"
  }
}
```

### Exchange Operations (Require JWT)

All exchange endpoints require `Authorization: Bearer <jwt-token>` header.

#### POST /api/order
Create a new order.

```json
// Request
{
  "type": "limit",
  "side": "buy",
  "symbol": "BTC",
  "price": 100,
  "qty": 10
}

// Response
{
  "orderId": "uuid",
  "status": "open",
  "filledQty": 0,
  "remainingQty": 10,
  "fills": []
}
```

#### GET /api/order/:orderId
Get order status by ID.

#### DELETE /api/order/:orderId
Cancel an order.

#### GET /api/depth/:symbol
Get market depth for a symbol.

```json
// Response
{
  "symbol": "BTC",
  "bids": [
    { "price": 100, "qty": 10 },
    { "price": 99, "qty": 5 }
  ],
  "asks": [
    { "price": 110, "qty": 4 },
    { "price": 111, "qty": 6 }
  ]
}
```

#### GET /api/balance
Get user balance.

```json
// Response
{
  "userId": "uuid",
  "balances": {
    "USD": 100000,
    "BTC": 10,
    "ETH": 100
  }
}
```

## Features

- **Order Matching**: Price-time priority matching engine
- **Limit Orders**: Buy/sell limit orders with partial fills
- **Market Depth**: Real-time order book depth
- **Balance Management**: Automatic fund locking and release
- **JWT Authentication**: Secure endpoint protection
- **Redis Messaging**: Decoupled backend-engine communication

## Order Types

- **Limit Order**: Execute at specified price or better
- **Market Order**: Execute immediately at best available price

## Order Statuses

- `open`: Order is resting on the book
- `partially_filled`: Order has been partially matched
- `filled`: Order has been completely matched
- `cancelled`: Order has been cancelled

## Matching Rules

- Buy orders match against lowest asks when `buyPrice >= askPrice`
- Sell orders match against highest bids when `sellPrice <= bidPrice`
- Price-time priority: better prices first, then earlier orders
- Partial fills supported with remaining quantity resting on book

## Environment Variables

### Backend (.env)
```
PORT=3000
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/cex_db"
REDIS_HOST=localhost
REDIS_PORT=6379
JWT_SECRET=your-secret-key
BACKEND_QUEUE_ID=backend-1
```

### Engine (.env)
```
REDIS_HOST=localhost
REDIS_PORT=6379
ENGINE_QUEUE=backend-to-engine-broker
```

## License

MIT
