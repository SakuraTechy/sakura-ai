# Technology Stack & Build System

## Tech Stack

### Frontend
- **React 18.3.1** with TypeScript 5.5.3
- **Vite 5.4.2** for build tooling and dev server
- **Tailwind CSS 3.4.1** for styling
- **Ant Design 5.26.7** as primary component library
- **Zustand 4.4.7** for state management
- **React Router 6.20.1** for routing
- **Framer Motion 10.16.16** for animations

### Backend
- **Node.js >=18** with Express 4.18.0
- **TypeScript 5.5.3** for type safety
- **Prisma 6.11.1** as ORM with MySQL database
- **JWT 9.0.2** for authentication
- **WebSocket (ws 8.18.3)** for real-time communication

### AI & Automation
- **Playwright 1.56.1** for browser automation
- **MCP SDK 1.0.0** (Model Context Protocol)
- **Qdrant** vector database for RAG knowledge base
- **Aliyun Embedding API** for 1024-dim vectorization
- **OpenRouter** for multi-model AI services (GPT-4o/Claude/Gemini)

### Database & Storage
- **MySQL >=8.0** as primary database
- **Prisma** for database migrations and schema management
- **Better SQLite3** for local development/testing

## Common Commands

### Development
```bash
# Start full application (recommended)
npm run start

# Start frontend and backend separately
npm run dev:frontend    # Vite dev server on port 5173
npm run dev:server      # Express server on port 3001

# Start with visible browser (for debugging automation)
npm run dev-visible
```

### Database Operations
```bash
# Apply database migrations
npx prisma migrate deploy

# Generate Prisma client
npx prisma generate

# Reset database (development only)
npx prisma migrate reset
```

### Testing & Automation
```bash
# Install Playwright browsers
npx playwright install chromium

# Run tests
npm test

# Start MCP server for AI automation
npm run mcp:start
```

### Knowledge Base Management
```bash
# Initialize RAG knowledge collections
npm run knowledge:init

# Check knowledge base status
npm run knowledge:status

# List available systems
npm run systems:list
```

### Build & Deployment
```bash
# Build for production
npm run build

# Preview production build
npm run preview

# Lint code
npm run lint
```

## Environment Configuration

Key environment variables in `.env`:
- `DATABASE_URL` - MySQL connection string
- `JWT_SECRET` - Authentication secret
- `QDRANT_URL` - Vector database URL (optional)
- `EMBEDDING_API_KEY` - Aliyun embedding API key (optional)
- `PORT` - Backend server port (default: 3001)

## Development Notes

- Frontend runs on port 5173, backend on 3001
- Vite proxy handles API requests to `/api/*`
- Prisma generates client to `src/generated/prisma`
- WebSocket connections used for real-time test execution updates
- MCP protocol enables natural language test automation