# 📋 VaultLens - Complete File Index

## 📂 Project Structure

```
vaultlens/
├── src/                                    # Source code directory
│   ├── server/                             # Backend (Node.js + Express)
│   │   ├── index.ts                        # Express server setup & API endpoints
│   │   ├── agent.ts                        # Claude AI agent with tool definitions
│   │   └── execution-engine.ts             # MCP server orchestration layer
│   └── client/                             # Frontend (React + TypeScript)
│       ├── main.tsx                        # React entry point
│       ├── App.tsx                         # Main chat component
│       └── App.css                         # Styling (dark/light mode)
│
├── Configuration Files
│   ├── package.json                        # NPM dependencies & scripts
│   ├── tsconfig.json                       # TypeScript configuration
│   ├── vite.config.ts                      # Vite build configuration
│   └── .env.example                        # Environment variable template
│
├── HTML & Scripts
│   ├── index.html                          # HTML entry point
│   └── start.sh                            # Quick start bash script
│
├── Documentation
│   ├── README.md                           # Main project documentation
│   ├── GETTING_STARTED.md                  # Quick start guide ⭐ START HERE
│   ├── SETUP_COMPLETE.md                   # Detailed setup instructions
│   ├── PROJECT_SUMMARY.md                  # This project overview
│   ├── ARCHITECTURE.md                     # System design & diagrams
│   ├── MCP_CONNECTION.md                   # How to connect MCP servers
│   └── FILES_INDEX.md                      # This file
│
├── .git/                                   # Git repository
├── .gitignore                              # Git ignores
├── LICENSE                                 # Project license
└── node_modules/                           # Dependencies (after npm install)

```

## 📄 File Descriptions

### Backend Files

#### `src/server/index.ts` (60 lines)
Express server setup and REST API endpoints:
- **GET /health** - Health check endpoint
- **POST /query** - Execute natural language query via Claude agent
- **GET /history** - Get query history
- **POST /history/clear** - Clear conversation history
- Middleware setup (CORS, JSON parsing)
- Port configuration via environment variables

#### `src/server/agent.ts` (280 lines) ⭐ Core Logic
Claude AI agent implementation:
- System prompt defining agent behavior ("You are VaultLens...")
- 4 tool definitions with input schemas:
  - `search_audit_events` - Search audit logs with filters
  - `aggregate_audit_events` - Count events by dimension
  - `trace_request` - Trace specific request
  - `vault_operation` - Perform Vault operations
- Multi-turn conversation with Claude
- Tool call parsing and execution loop
- Result synthesis and response generation
- Conversation history management

#### `src/server/execution-engine.ts` (140 lines)
Tool execution orchestration:
- Routes tools to correct MCP server (audit vs vault)
- Currently has mock implementations
- Framework ready for real MCP connections
- `executeAuditTool()` - For audit log queries
- `executeVaultTool()` - For Vault operations
- Plan execution with failure handling
- Error handling and logging

### Frontend Files

#### `src/client/main.tsx` (15 lines)
React entry point:
- Mounts React app to #root DOM element
- Strict mode enabled

#### `src/client/App.tsx` (200 lines) ⭐ UI Component
Main React component - chat interface:
- **State Management**: Messages, input, loading, error states
- **Auto-scroll**: Scrolls to latest message
- **Form Handling**: Submit query, clear history
- **Message Display**: User/assistant messages with timestamps
- **Tool Visualization**: Expandable tool calls and results
- **Error Handling**: Try/catch with user-friendly errors
- **API Integration**: Fetch to /api/query endpoint
- **Keyboard Shortcuts**: Cmd+Enter / Ctrl+Enter to send

#### `src/client/App.css` (400+ lines)
Complete styling:
- **Color Scheme**: Dark and light mode support
- **Flexbox Layouts**: App container, messages, input area
- **Chat Styling**: Message bubbles with roles
- **Details Panels**: Tool calls and results expandable
- **Responsive**: Works on all screen sizes
- **Animations**: Loading spinner, smooth scrolling
- **Typography**: Font sizing and weights
- **Scrollbar Styling**: Custom themed scrollbar

### Configuration Files

#### `package.json`
NPM package configuration:
- **Name**: vaultlens
- **Scripts**:
  - `npm run dev` - Start dev server (frontend + backend)
  - `npm run dev:server` - TypeScript server in watch mode
  - `npm run build` - Build for production
  - `npm run type-check` - Type checking without building
- **Dependencies** (10 core):
  - @anthropic-ai/sdk - Claude API
  - express, cors - Backend framework
  - dotenv - Environment variables
- **DevDependencies** (13):
  - React, Vite, TypeScript, tsx

#### `tsconfig.json`
TypeScript compiler options:
- **Target**: ES2020
- **Lib**: ES2020 + DOM APIs
- **Module**: ESNext
- **Strict Mode**: Enabled
- **Out Dir**: ./dist (for compiled server)

#### `vite.config.ts`
Vite build tool configuration:
- **React Plugin**: For JSX support
- **Dev Server**: Port 3000 with proxy to backend
- **Build Output**: dist/client directory
- **API Proxy**: /api → http://localhost:3001

#### `.env.example`
Environment variable template:
- ANTHROPIC_API_KEY (empty - needs to be filled)
- VAULT_MCP_URL (default: http://localhost:8080)
- VAULT_AUDIT_MCP_URL (default: http://localhost)
- API_PORT (default: 3001)
- VITE_PORT (default: 5173)

### HTML & Scripts

#### `index.html`
HTML page template:
- UTF-8 encoding
- Viewport meta tags
- Page title: "VaultLens"
- Root div for React mounting
- References Vite script entry point

#### `start.sh` (80 lines)
Bash startup script:
- Checks Node.js version (18+)
- Checks npm installed
- Creates .env from template if missing
- Checks for ANTHROPIC_API_KEY
- Installs dependencies if needed
- Runs type check
- Starts dev server
- User-friendly status messages

### Documentation Files

#### `README.md` (320 lines) ⭐ MAIN DOCS
Complete project documentation:
- Project overview and features
- Architecture diagram
- Prerequisites and installation
- Development and production setup
- Usage examples and features
- API endpoint documentation
- Project structure explanation
- Tool integration details
- Troubleshooting guide
- Next steps and roadmap
- License

#### `GETTING_STARTED.md` (280 lines) ⭐ BEST STARTING POINT
Quick start guide - **READ THIS FIRST**:
- Project setup completion summary
- 5-minute quick start
- Technology stack overview
- Command reference
- Environment variables guide
- Key features explanation
- Architecture overview
- Next immediate steps
- Troubleshooting quick reference

#### `SETUP_COMPLETE.md`
Initial setup guide:
- Project structure overview
- Key features implemented
- Step-by-step setup instructions
- Quick start commands
- Important MCP connections section
- Architecture overview

#### `PROJECT_SUMMARY.md` (350 lines)
Comprehensive project overview:
- What has been created
- Project files structure
- 4-step getting started
- Documentation guide
- MCP server connection next steps
- Key features for users and developers
- Technology stack table
- Project statistics
- What users will see
- Performance metrics
- Security considerations
- Scalability overview
- Testing strategy
- Deployment options
- FAQ
- Implementation checklist

#### `ARCHITECTURE.md` (280 lines)
System design and data flow:
- System overview diagram
- Query execution flow (complete walkthrough)
- Tool definition to execution flow
- ASCII diagrams showing:
  - Component interactions
  - Data transformations
  - Request/response cycles

#### `MCP_CONNECTION.md` (320 lines)
Integration guide for MCP servers:
- Current state explanation
- Option 1: Stdio-based MCP (recommended)
  - Vault Audit MCP implementation
  - Code examples
- Option 2: Direct Vault API
  - HTTP-based approach
  - Code examples
- Option 3: MCP SDK Integration
  - Official SDK usage
  - Code examples
- Implementation steps (4 steps)
- Debugging tips
- Health check endpoints
- Common issues and solutions

#### `FILES_INDEX.md`
This file - complete file index and descriptions

## 📊 Statistics

| Metric | Count |
|--------|-------|
| **Total Files Created** | 18 |
| **TypeScript Files** | 5 |
| **Configuration Files** | 4 |
| **Documentation Files** | 7 |
| **Lines of Code** | 500+ |
| **Lines of Documentation** | 1500+ |
| **API Endpoints** | 3 |
| **Claude Agent Tools** | 4 |
| **React Components** | 1 (monolithic) |
| **npm Dependencies** | 10 |
| **npm Dev Dependencies** | 13 |

## 🚀 How to Use Each File

### To Get Started
1. Read: **GETTING_STARTED.md** - Quick overview
2. Read: **README.md** - Full documentation
3. Follow: **start.sh** - Automatic setup

### To Build
- Use: **package.json** scripts
- Configure: **tsconfig.json** and **vite.config.ts**
- Setup: **.env.example** → **.env**

### To Code
- Backend entry: **src/server/index.ts**
- Agent logic: **src/server/agent.ts**
- Tool execution: **src/server/execution-engine.ts**
- Frontend: **src/client/App.tsx**
- Styling: **src/client/App.css**

### To Deploy
- Build: `npm run build`
- Output: **dist/** directory
- Run: `node dist/server/index.js`
- Serve: **dist/client/** with web server

### To Understand Architecture
1. **ARCHITECTURE.md** - System design
2. **MCP_CONNECTION.md** - How to connect servers
3. **README.md** - Project structure

### To Debug
- Check: **start.sh** for initialization issues  
- Review: **src/server/execution-engine.ts** for tool execution
- See: **src/client/App.tsx** for frontend state
- Read: **MCP_CONNECTION.md** for integration issues

## 🔄 File Dependencies

```
index.html
    └─> src/client/main.tsx
        └─> src/client/App.tsx
            ├─> src/client/App.css
            └─> API calls to http://localhost:3001

package.json (dependencies)
    ├─> src/server/index.ts
    │   ├─> src/server/agent.ts
    │   │   ├─> @anthropic-ai/sdk
    │   │   └─> src/server/execution-engine.ts
    │   └─> express, cors
    │
    └─> vite.config.ts
        └─> src/client/**

tsconfig.json
    └─> All TypeScript files

.env
    └─> src/server/index.ts (ANTHROPIC_API_KEY)
```

## 📝 File Modification Guide

### To Add a New Tool
1. Edit: **src/server/agent.ts** (TOOLS array)
2. Edit: **src/server/execution-engine.ts** (executeTool methods)

### To Change Frontend
- Edit: **src/client/App.tsx** (component logic)
- Edit: **src/client/App.css** (styling)

### To Add API Endpoints
- Edit: **src/server/index.ts** (add routes)

### To Change Claude Behavior
- Edit: **src/server/agent.ts** (system prompt and tool definitions)

### To Update Build Configuration
- Edit: **vite.config.ts** (Vite settings)
- Edit: **tsconfig.json** (TypeScript settings)
- Edit: **package.json** (dependencies)

## ✅ Checklist for Getting Started

- [ ] Read GETTING_STARTED.md
- [ ] Install Node.js 18+
- [ ] Run `npm install`
- [ ] Run `./start.sh` (or manually set up .env)
- [ ] Add ANTHROPIC_API_KEY to .env
- [ ] Run `npm run dev`
- [ ] Open http://localhost:3000
- [ ] Test with a sample query
- [ ] Read MCP_CONNECTION.md
- [ ] Implement MCP server connections
- [ ] Test real tool execution
- [ ] Deploy to production

## 🎯 Quick Reference

**Start here**: GETTING_STARTED.md  
**Full docs**: README.md  
**System design**: ARCHITECTURE.md  
**Integration**: MCP_CONNECTION.md  
**Build commands**: package.json  
**Auto setup**: start.sh  

**Backend**: src/server/  
**Frontend**: src/client/  
**Config**: Top level (package.json, tsconfig.json, vite.config.ts)  
**Docs**: *.md files in root  

---

**Next Step**: Run `npm install` and follow the instructions in GETTING_STARTED.md! 🚀
