# Project Structure & Organization

## Root Directory Structure

```
sakura-ai/
├── src/                    # Frontend React application
├── server/                 # Backend Express application  
├── prisma/                 # Database schema and migrations
├── docs/                   # Project documentation
├── scripts/                # Build, deployment, and utility scripts
├── artifacts/              # Test execution artifacts (screenshots, videos, logs)
├── uploads/                # File uploads (Axure prototypes, etc.)
├── drivers/                # Database drivers for various systems
├── prototypes/             # HTML prototypes and examples
├── tests/                  # Test files
└── tasks/                  # Task and requirement documents
```

## Frontend Structure (`src/`)

```
src/
├── components/             # Reusable React components
│   ├── ai-generator/      # AI test case generation components
│   ├── common/            # Shared UI components
│   ├── test-case/         # Test case specific components
│   ├── test-config/       # Test configuration components
│   └── ui/                # Base UI components (buttons, modals, etc.)
├── pages/                 # Page-level components (routes)
│   ├── FunctionalTestCases/    # Main test case management
│   ├── FunctionalTestCaseGenerator.tsx  # AI generator page
│   ├── SystemManagement.tsx    # System/project management
│   ├── KnowledgeManagement.tsx # RAG knowledge base management
│   └── TestPlans/         # Test plan management
├── services/              # API client services
├── contexts/              # React contexts (Auth, Theme, etc.)
├── hooks/                 # Custom React hooks
├── types/                 # TypeScript type definitions
├── utils/                 # Utility functions
├── styles/                # Global styles and themes
└── generated/             # Generated code (Prisma client)
```

## Backend Structure (`server/`)

```
server/
├── routes/                # Express route handlers
│   ├── auth.js           # Authentication routes
│   ├── testConfig.ts     # Test configuration API
│   ├── aiBulkUpdate.js   # AI bulk update functionality
│   └── functionalTestCase.ts  # Test case CRUD operations
├── services/              # Core business logic
│   ├── aiParser.ts       # Axure HTML parsing service
│   ├── functionalTestCaseAIService.ts  # AI test generation
│   ├── testExecution.ts  # Playwright test execution
│   ├── knowledgeManagementService.ts   # RAG knowledge base
│   └── configVariableService.ts       # Configuration management
├── middleware/            # Express middleware
├── prompts/              # AI prompt templates
├── types/                # Server-side TypeScript types
├── utils/                # Server utility functions
└── knowledgeBase/        # RAG knowledge base utilities
```

## Database Structure (`prisma/`)

```
prisma/
├── schema.prisma         # Main database schema
├── migrations/           # Database migration files
└── schema.prisma.backup  # Schema backup
```

Key database models:
- `functional_test_cases` - Test case storage
- `functional_test_points` - Individual test points
- `test_executions` - Test run results
- `systems` - Project/system management
- `users` - User authentication
- `knowledge_base` - RAG knowledge storage

## Documentation Structure (`docs/`)

```
docs/
├── ARCHITECTURE.md       # System architecture overview
├── INSTALLATION.md       # Setup and installation guide
├── AI_GENERATOR.md       # AI generator detailed documentation
├── RAG_SETUP.md         # Knowledge base configuration
├── fixes/               # Bug fix documentation
└── tech-docs/           # Technical implementation details
```

## Key File Naming Conventions

### Components
- **PascalCase** for component files: `TestCaseEditor.tsx`
- **camelCase** for utility files: `testConfigService.ts`
- **kebab-case** for CSS/style files: `test-case-styles.css`

### API Routes
- **camelCase** for route files: `functionalTestCase.ts`
- RESTful URL patterns: `/api/functional-test-cases`

### Database
- **snake_case** for table names: `functional_test_cases`
- **snake_case** for column names: `created_at`, `test_points`

## Import/Export Patterns

### Frontend
```typescript
// Absolute imports from src root
import { TestCaseEditor } from '@/components/test-case/TestCaseEditor'
import { testService } from '@/services/testService'

// Relative imports for nearby files
import './TestCase.css'
```

### Backend
```typescript
// ES modules with .js extensions
import { testService } from './services/testService.js'
import type { TestCase } from './types/testCase.js'
```

## Configuration Files

- `.env` - Environment variables
- `vite.config.ts` - Frontend build configuration
- `tsconfig.json` - TypeScript configuration
- `tailwind.config.cjs` - Tailwind CSS configuration
- `package.json` - Dependencies and scripts
- `prisma/schema.prisma` - Database schema

## Special Directories

- `artifacts/` - Auto-generated test execution results (screenshots, videos, logs)
- `uploads/axure/` - Uploaded Axure prototype files
- `drivers/` - JDBC drivers for database connections
- `temp/` - Temporary files during processing
- `logs/` - Application logs