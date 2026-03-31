# PairDev - Real-Time Collaborative Coding Environment

PairDev is a web-based collaborative environment designed for real-time pair programming. It features a shared code editor, a synchronized terminal, and a drawing canvas, allowing multiple users to work together seamlessly in a shared virtual workspace.

The application uses a hybrid architecture, combining a Next.js web application for the frontend with separate Node.js servers for handling real-time WebSocket communication for the terminal (via Socket.IO) and editor synchronization (via Yjs). Redis is used for session management and persistence.

## Repository Structure

The codebase is organized into several key directories:

```
.
├── app/              # Next.js app router, pages, and components
│   ├── api/          # Backend API routes (e.g., creating rooms, running code)
│   ├── components/   # Shared React components (Editor, Terminal, Toolbar)
│   ├── hooks/        # Custom React hooks for client-side logic
│   ├── rooms/        # The main collaborative room page and its client logic
│   ├── utils/        # Utility functions used across the frontend
│   └── page.tsx      # The application landing page
├── server/           # Standalone WebSocket servers (Yjs, Socket.IO)
├── tests/            # E2E (Playwright) and Unit/Backend (Vitest) tests
├── public/           # Static assets (images, fonts)
├── docs/             # Project documentation
└── Dockerfile        # Docker configuration for the application
```

## Requirements

To run this project, you will need the following installed on your system:

*   **Node.js** (v20.x or later)
*   **pnpm** (v8.x or later)
*   **Docker** and **Docker Compose** (for running the Redis service)

## Environment Configuration

Before running the application, you must create a `.env` file in the project root. You can copy the example file to get started:

```bash
cp .env.example .env
```

You will need to fill in the `GLOT_API_TOKEN` variable. Sign up with [glot.io](https://glot.io/) and get your API token then paste in the variable.

## Running the Application

The development workflow involves running the Redis database in a Docker container and the application services (web app, terminal server, Yjs server) locally on your machine.

### Step 1: Start the Redis Service

Use Docker Compose to start the Redis container in the background.

```bash
# Start the Redis service
docker compose up -d
```

### Step 2: Run the Application Services

For local development, you need to run the Next.js app, the terminal server, and the Yjs server in three separate terminal sessions.

```bash
# Terminal 1: Run the Next.js web app
pnpm dev

# Terminal 2: Run the terminal (Socket.IO) server
pnpm dev:server

# Terminal 3: Run the editor sync (Yjs) server
pnpm dev:yjs
```

The application will now be available at `http://localhost:3000`.

## Testing

The project has both End-to-End (E2E) and Unit/Backend tests.

### Unit & Backend Tests (Vitest)

To run all unit and backend tests:

```bash
pnpm test:unit
```

To run the tests in watch mode:
```bash
pnpm test:unit:watch
```

### End-to-End Tests (Playwright)

The E2E tests simulate real user interactions in a browser.

```bash
# Make sure to install the browser dependencies first
pnpm playwright install

# Run all E2E tests
pnpm test:e2e
```

## Deployment

This project uses a hybrid deployment strategy, leveraging Vercel for the frontend, Render for backend WebSocket servers, and Redis Cloud for managed Redis.

### 1. Backend Deployment

- **Redis:** Use [Redis Cloud](https://redis.com/redis-enterprise-cloud/overview/) to provision a managed Redis instance.
- **Yjs Server:** Deploy as a background worker on Render, running `pnpm start:yjs`.
- **Terminal Server:** Deploy as a background worker on Render, running `pnpm start:server`.

After deploying the Yjs and Terminal servers, copy their public URLs and use them to configure the frontend environment variables on Vercel.

### 2. Frontend Deployment on Vercel

The Next.js frontend is deployed on Vercel. You will need to configure the following environment variables in your Vercel project settings:

*   `REDIS_URL`: The connection string for your managed Redis instance from Render.
*   `GLOT_API_TOKEN`: Your API token from [glot.io](https://glot.io/).
*   `NEXT_PUBLIC_YJS_WEBSOCKET_URL`: The public URL of your Yjs server deployed on Render.
*   `NEXT_PUBLIC_SOCKET_URL`: The public URL of your Terminal server deployed on Render.
