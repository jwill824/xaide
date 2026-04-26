# Xaide Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold the Electron + React + TypeScript app with a typed IPC bridge, SQLite/Drizzle persistence, config hierarchy loading, WorkspaceManager, and a minimal shell UI — producing a runnable Electron window that can create and list workspaces.

**Architecture:** Main process owns all side effects (db, config, IPC handlers). Renderer is a pure React SPA communicating only through a typed `contextBridge` preload. SQLite (better-sqlite3 + Drizzle ORM) stores all persistent state. Config loads from a two-level YAML hierarchy (`~/.config/xaide/config.yaml` → `<repo>/.agentapp/config.yaml`) validated with Zod.

**Tech Stack:** Electron 31+, electron-vite 2+, React 18, TypeScript 5, Vite 5, Tailwind CSS v3, better-sqlite3, Drizzle ORM, TanStack React Query v5, Zod, yaml, Vitest

> **Note on git:** Run `git init` (or initialize via your Terraform workflow) before the commit steps. The project directory already exists at `xaide/`.

---

## File Structure

```
xaide/
├── package.json
├── tsconfig.json
├── tsconfig.node.json
├── tsconfig.web.json
├── electron.vite.config.ts
├── electron-builder.yml
├── vitest.config.ts
├── vitest.renderer.config.ts
├── tailwind.config.ts
├── postcss.config.js
├── src/
│   ├── main/
│   │   ├── index.ts                         # Main process entry, BrowserWindow
│   │   ├── db/
│   │   │   ├── schema.ts                    # Drizzle table definitions (all 6 tables)
│   │   │   └── client.ts                    # better-sqlite3 factory + migrations
│   │   ├── config/
│   │   │   ├── schema.ts                    # Zod schemas for global + workspace config
│   │   │   └── ConfigLoader.ts              # Reads + validates YAML at both levels
│   │   ├── workspace/
│   │   │   └── WorkspaceManager.ts          # CRUD for workspaces, composes config+db
│   │   └── ipc/
│   │       ├── index.ts                     # Re-exports all register* functions
│   │       └── workspace.ipc.ts             # ipcMain.handle bindings for workspaces
│   ├── preload/
│   │   ├── ipc-types.ts                     # Shared TypeScript contract (Window.xaide)
│   │   └── index.ts                         # contextBridge.exposeInMainWorld
│   └── renderer/
│       ├── index.html
│       └── src/
│           ├── main.tsx
│           ├── App.tsx
│           ├── index.css
│           ├── components/
│           │   ├── IconRail.tsx
│           │   ├── LeftPanel.tsx
│           │   └── MainArea.tsx
│           └── hooks/
│               └── useWorkspaces.ts
└── tests/
    ├── main/
    │   ├── db.test.ts
    │   ├── config.test.ts
    │   ├── workspace.test.ts
    │   └── workspace.ipc.test.ts
    └── renderer/
        ├── setup.ts
        └── App.test.tsx
```

---

### Task 1: Install dependencies and configure tooling

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `tsconfig.web.json`
- Create: `electron.vite.config.ts`
- Create: `electron-builder.yml`
- Create: `vitest.config.ts`
- Create: `vitest.renderer.config.ts`
- Create: `tailwind.config.ts`
- Create: `postcss.config.js`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "xaide",
  "version": "0.1.0",
  "description": "AI agent orchestration IDE",
  "main": "./out/main/index.js",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "preview": "electron-vite preview",
    "postinstall": "electron-builder install-app-deps",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:renderer": "vitest run --config vitest.renderer.config.ts",
    "test:all": "vitest run && vitest run --config vitest.renderer.config.ts",
    "lint": "tsc --noEmit"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.4.6",
    "@testing-library/react": "^16.0.0",
    "@testing-library/user-event": "^14.5.2",
    "@types/better-sqlite3": "^7.6.11",
    "@types/node": "^20.14.0",
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "@vitest/coverage-v8": "^1.6.0",
    "autoprefixer": "^10.4.19",
    "drizzle-kit": "^0.22.8",
    "electron": "^31.0.0",
    "electron-builder": "^24.13.3",
    "electron-vite": "^2.3.0",
    "jsdom": "^24.1.0",
    "postcss": "^8.4.38",
    "tailwindcss": "^3.4.4",
    "typescript": "^5.5.3",
    "vite": "^5.3.1",
    "vitest": "^1.6.0"
  },
  "dependencies": {
    "@radix-ui/react-tooltip": "^1.1.1",
    "@tanstack/react-query": "^5.45.1",
    "better-sqlite3": "^9.6.0",
    "drizzle-orm": "^0.31.4",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "yaml": "^2.4.5",
    "zod": "^3.23.8"
  }
}
```

- [ ] **Step 2: Create TypeScript configs**

Create `tsconfig.json`:
```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.node.json" },
    { "path": "./tsconfig.web.json" }
  ]
}
```

Create `tsconfig.node.json`:
```json
{
  "compilerOptions": {
    "composite": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "target": "ES2022",
    "lib": ["ES2022"],
    "strict": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "esModuleInterop": true,
    "types": ["node"]
  },
  "include": [
    "src/main/**/*",
    "src/preload/**/*",
    "tests/main/**/*",
    "electron.vite.config.ts",
    "vitest.config.ts"
  ]
}
```

Create `tsconfig.web.json`:
```json
{
  "compilerOptions": {
    "composite": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "target": "ES2020",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "strict": true,
    "skipLibCheck": true,
    "jsx": "react-jsx",
    "resolveJsonModule": true,
    "esModuleInterop": true,
    "types": ["@testing-library/jest-dom"]
  },
  "include": [
    "src/renderer/**/*",
    "tests/renderer/**/*",
    "vitest.renderer.config.ts"
  ]
}
```

- [ ] **Step 3: Create electron-vite config**

Create `electron.vite.config.ts`:
```ts
import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
      },
    },
    plugins: [react()],
  },
})
```

- [ ] **Step 4: Create Tailwind config**

Create `tailwind.config.ts`:
```ts
import type { Config } from 'tailwindcss'

export default {
  content: ['./src/renderer/**/*.{ts,tsx,html}'],
  theme: {
    extend: {},
  },
  plugins: [],
} satisfies Config
```

Create `postcss.config.js`:
```js
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

- [ ] **Step 5: Create Vitest configs**

Create `vitest.config.ts` (main process tests — Node environment):
```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/main/**/*.test.ts'],
    globals: true,
  },
})
```

Create `vitest.renderer.config.ts` (renderer tests — jsdom environment):
```ts
import { resolve } from 'path'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['tests/renderer/**/*.test.tsx'],
    globals: true,
    setupFiles: ['tests/renderer/setup.ts'],
  },
  resolve: {
    alias: {
      '@renderer': resolve('src/renderer/src'),
    },
  },
})
```

- [ ] **Step 6: Create electron-builder config**

Create `electron-builder.yml`:
```yaml
appId: com.xaide.app
productName: Xaide
directories:
  buildResources: build
  output: dist
files:
  - out/**/*
  - node_modules/**/*
  - package.json
mac:
  target:
    - target: dmg
      arch: [arm64, x64]
  category: public.app-category.developer-tools
  darkModeSupport: true
nativeRebuilder: parallel
```

- [ ] **Step 7: Install dependencies**

```bash
cd /Users/jeff.williams/Developer/personal/xaide
npm install
```

Expected: `node_modules/` populated. `package-lock.json` created. No errors (peer dep warnings are acceptable). The `postinstall` hook runs `electron-builder install-app-deps` automatically — this rebuilds `better-sqlite3` against Electron's Node ABI so it loads correctly in dev mode.

- [ ] **Step 8: Verify TypeScript accepts the configs**

```bash
npx tsc -p tsconfig.node.json --noEmit 2>&1 | head -5
```

Expected: "error TS18003: No inputs were found" or no output — both are fine at this stage (no source files yet).

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json tsconfig*.json electron.vite.config.ts \
  electron-builder.yml vitest*.config.ts tailwind.config.ts postcss.config.js
git commit -m "chore: configure electron-vite, typescript, tailwind, and vitest

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 2: Database schema and client

**Files:**
- Create: `src/main/db/schema.ts`
- Create: `src/main/db/client.ts`
- Create: `tests/main/db.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/main/db.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { createDb } from '../../src/main/db/client'

describe('createDb', () => {
  it('creates all six required tables', () => {
    const db = createDb(':memory:')
    const rows = db
      .prepare(
        `SELECT name FROM sqlite_master
         WHERE type='table' AND name NOT LIKE 'sqlite_%'
         ORDER BY name`,
      )
      .all() as Array<{ name: string }>
    const names = rows.map((r) => r.name)
    expect(names).toContain('workspaces')
    expect(names).toContain('tasks')
    expect(names).toContain('agent_sessions')
    expect(names).toContain('events')
    expect(names).toContain('mcp_servers')
    expect(names).toContain('plugins')
  })

  it('enforces the foreign key constraint from tasks to workspaces', () => {
    const db = createDb(':memory:')
    expect(() => {
      db.prepare(
        `INSERT INTO tasks (id, workspace_id, title, source_adapter)
         VALUES ('t1', 'nonexistent-ws', 'Task', 'markdown')`,
      ).run()
    }).toThrow()
  })

  it('cascades deletes from workspaces to tasks', () => {
    const db = createDb(':memory:')
    db.prepare(
      `INSERT INTO workspaces (id, name, repo_path) VALUES ('ws1', 'My WS', '/tmp')`,
    ).run()
    db.prepare(
      `INSERT INTO tasks (id, workspace_id, title, source_adapter)
       VALUES ('t1', 'ws1', 'Task 1', 'markdown')`,
    ).run()
    db.prepare(`DELETE FROM workspaces WHERE id = 'ws1'`).run()
    const tasks = db.prepare(`SELECT * FROM tasks WHERE id = 't1'`).all()
    expect(tasks).toHaveLength(0)
  })

  it('returns separate databases for separate calls', () => {
    const db1 = createDb(':memory:')
    const db2 = createDb(':memory:')
    db1.prepare(
      `INSERT INTO workspaces (id, name, repo_path) VALUES ('ws1', 'WS1', '/tmp')`,
    ).run()
    const rows = db2.prepare(`SELECT * FROM workspaces`).all()
    expect(rows).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/main/db.test.ts
```

Expected: FAIL — `Cannot find module '../../src/main/db/client'`

- [ ] **Step 3: Create Drizzle schema**

Create `src/main/db/schema.ts`:
```ts
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

export const workspaces = sqliteTable('workspaces', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  repoPath: text('repo_path').notNull(),
  configJson: text('config_json').notNull().default('{}'),
  sandboxDefaults: text('sandbox_defaults').notNull().default('{}'),
  layoutJson: text('layout_json').notNull().default('{}'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
})

export const tasks = sqliteTable('tasks', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  sourceAdapter: text('source_adapter').notNull(),
  methodologyAdapter: text('methodology_adapter'),
  prompt: text('prompt').notNull().default(''),
  status: text('status', { enum: ['pending', 'in_progress', 'done', 'blocked'] })
    .notNull()
    .default('pending'),
  baseCommit: text('base_commit'),
  parallelGroupId: text('parallel_group_id'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
})

export const agentSessions = sqliteTable('agent_sessions', {
  id: text('id').primaryKey(),
  taskId: text('task_id')
    .notNull()
    .references(() => tasks.id, { onDelete: 'cascade' }),
  agentId: text('agent_id').notNull(),
  branch: text('branch').notNull(),
  worktreePath: text('worktree_path').notNull(),
  containerId: text('container_id'),
  status: text('status', {
    enum: ['pending', 'running', 'idle', 'finished', 'failed'],
  })
    .notNull()
    .default('pending'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
})

export const events = sqliteTable('events', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').references(() => agentSessions.id, {
    onDelete: 'set null',
  }),
  type: text('type').notNull(),
  payload: text('payload').notNull().default('{}'),
  timestamp: text('timestamp').notNull().default(sql`(datetime('now'))`),
})

export const mcpServers = sqliteTable('mcp_servers', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  scope: text('scope', { enum: ['global', 'workspace'] })
    .notNull()
    .default('global'),
  configJson: text('config_json').notNull().default('{}'),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
})

export const plugins = sqliteTable('plugins', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  version: text('version').notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  configJson: text('config_json').notNull().default('{}'),
  installedAt: text('installed_at').notNull().default(sql`(datetime('now'))`),
})
```

- [ ] **Step 4: Create DB client**

Create `src/main/db/client.ts`:
```ts
import Database from 'better-sqlite3'

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS workspaces (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    repo_path TEXT NOT NULL,
    config_json TEXT NOT NULL DEFAULT '{}',
    sandbox_defaults TEXT NOT NULL DEFAULT '{}',
    layout_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    source_adapter TEXT NOT NULL,
    methodology_adapter TEXT,
    prompt TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending',
    base_commit TEXT,
    parallel_group_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS agent_sessions (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    agent_id TEXT NOT NULL,
    branch TEXT NOT NULL,
    worktree_path TEXT NOT NULL,
    container_id TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    session_id TEXT REFERENCES agent_sessions(id) ON DELETE SET NULL,
    type TEXT NOT NULL,
    payload TEXT NOT NULL DEFAULT '{}',
    timestamp TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS mcp_servers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    scope TEXT NOT NULL DEFAULT 'global',
    config_json TEXT NOT NULL DEFAULT '{}',
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS plugins (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    version TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    config_json TEXT NOT NULL DEFAULT '{}',
    installed_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`

export type RawDb = Database.Database

export function createDb(path: string): RawDb {
  const db = new Database(path)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.exec(SCHEMA_SQL)
  return db
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
npx vitest run tests/main/db.test.ts
```

Expected: PASS — 4 tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/main/db/ tests/main/db.test.ts
git commit -m "feat: add SQLite schema and database client

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 3: Config loader

**Files:**
- Create: `src/main/config/schema.ts`
- Create: `src/main/config/ConfigLoader.ts`
- Create: `tests/main/config.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/main/config.test.ts`:
```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { ConfigLoader } from '../../src/main/config/ConfigLoader'

describe('ConfigLoader', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = join(tmpdir(), `xaide-config-${Date.now()}`)
    mkdirSync(tmpDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  describe('loadGlobal', () => {
    it('returns defaults when file does not exist', () => {
      const loader = new ConfigLoader(join(tmpDir, 'nonexistent.yaml'))
      const config = loader.loadGlobal()
      expect(config.agents).toEqual([])
      expect(config.mcpServers).toEqual([])
      expect(config.sandbox.enabled).toBe(false)
      expect(config.plugins).toEqual([])
      expect(config.hooks).toEqual([])
    })

    it('parses sandbox and plugin config', () => {
      const path = join(tmpDir, 'config.yaml')
      writeFileSync(
        path,
        `
sandbox:
  enabled: true
  image: ubuntu:24.04
plugins:
  - my-plugin
`,
      )
      const config = new ConfigLoader(path).loadGlobal()
      expect(config.sandbox.enabled).toBe(true)
      expect(config.sandbox.image).toBe('ubuntu:24.04')
      expect(config.plugins).toEqual(['my-plugin'])
    })

    it('parses MCP server config', () => {
      const path = join(tmpDir, 'config.yaml')
      writeFileSync(
        path,
        `
mcpServers:
  - name: filesystem
    command: npx
    args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]
    scope: global
`,
      )
      const config = new ConfigLoader(path).loadGlobal()
      expect(config.mcpServers).toHaveLength(1)
      expect(config.mcpServers[0].name).toBe('filesystem')
      expect(config.mcpServers[0].args).toEqual(['-y', '@modelcontextprotocol/server-filesystem', '/tmp'])
    })

    it('throws ZodError for structurally invalid config', () => {
      const path = join(tmpDir, 'config.yaml')
      writeFileSync(path, `sandbox: "not-an-object"`)
      expect(() => new ConfigLoader(path).loadGlobal()).toThrow()
    })
  })

  describe('loadWorkspace', () => {
    it('returns defaults when .agentapp/config.yaml does not exist', () => {
      const config = new ConfigLoader(join(tmpDir, 'global.yaml')).loadWorkspace(tmpDir)
      expect(config.sourceAdapter).toBeUndefined()
      expect(config.methodologyAdapter).toBeUndefined()
      expect(config.hooks).toEqual([])
    })

    it('parses adapter selections', () => {
      mkdirSync(join(tmpDir, '.agentapp'))
      writeFileSync(
        join(tmpDir, '.agentapp', 'config.yaml'),
        `
sourceAdapter: github-issues
methodologyAdapter: spec-kit
`,
      )
      const config = new ConfigLoader(join(tmpDir, 'global.yaml')).loadWorkspace(tmpDir)
      expect(config.sourceAdapter).toBe('github-issues')
      expect(config.methodologyAdapter).toBe('spec-kit')
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/main/config.test.ts
```

Expected: FAIL — `Cannot find module '../../src/main/config/ConfigLoader'`

- [ ] **Step 3: Create Zod config schemas**

Create `src/main/config/schema.ts`:
```ts
import { z } from 'zod'

const SandboxConfigSchema = z.object({
  enabled: z.boolean().default(false),
  image: z.string().optional(),
  dockerfile: z.string().optional(),
  env: z.record(z.string()).default({}),
  ports: z.array(z.string()).default([]),
  keepAlive: z.boolean().default(false),
})

const AgentOverrideSchema = z.object({
  id: z.string(),
  command: z.string(),
  args: z.array(z.string()).default([]),
  enabled: z.boolean().default(true),
})

const McpServerConfigSchema = z.object({
  name: z.string(),
  command: z.string(),
  args: z.array(z.string()).default([]),
  scope: z.enum(['global', 'workspace']).default('global'),
  enabled: z.boolean().default(true),
})

const HookConfigSchema = z.object({
  event: z.string(),
  path: z.string(),
})

export const GlobalConfigSchema = z.object({
  agents: z.array(AgentOverrideSchema).default([]),
  mcpServers: z.array(McpServerConfigSchema).default([]),
  sandbox: SandboxConfigSchema.default({}),
  plugins: z.array(z.string()).default([]),
  hooks: z.array(HookConfigSchema).default([]),
})

export const WorkspaceConfigSchema = z.object({
  sourceAdapter: z.string().optional(),
  methodologyAdapter: z.string().optional(),
  sandbox: SandboxConfigSchema.partial().optional(),
  agents: z.array(AgentOverrideSchema).default([]),
  hooks: z.array(HookConfigSchema).default([]),
})

export type GlobalConfig = z.infer<typeof GlobalConfigSchema>
export type WorkspaceConfig = z.infer<typeof WorkspaceConfigSchema>
```

- [ ] **Step 4: Create ConfigLoader**

Create `src/main/config/ConfigLoader.ts`:
```ts
import { readFileSync, existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { homedir } from 'os'
import { parse } from 'yaml'
import {
  GlobalConfigSchema,
  WorkspaceConfigSchema,
  type GlobalConfig,
  type WorkspaceConfig,
} from './schema'

const DEFAULT_GLOBAL_CONFIG_PATH = join(homedir(), '.config', 'xaide', 'config.yaml')

export class ConfigLoader {
  constructor(private globalConfigPath = DEFAULT_GLOBAL_CONFIG_PATH) {}

  loadGlobal(): GlobalConfig {
    if (!existsSync(this.globalConfigPath)) {
      mkdirSync(dirname(this.globalConfigPath), { recursive: true })
      return GlobalConfigSchema.parse({})
    }
    const raw = readFileSync(this.globalConfigPath, 'utf8')
    return GlobalConfigSchema.parse(parse(raw) ?? {})
  }

  loadWorkspace(repoPath: string): WorkspaceConfig {
    const configPath = join(repoPath, '.agentapp', 'config.yaml')
    if (!existsSync(configPath)) {
      return WorkspaceConfigSchema.parse({})
    }
    const raw = readFileSync(configPath, 'utf8')
    return WorkspaceConfigSchema.parse(parse(raw) ?? {})
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
npx vitest run tests/main/config.test.ts
```

Expected: PASS — 6 tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/main/config/ tests/main/config.test.ts
git commit -m "feat: add config loader with Zod schema validation

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 4: WorkspaceManager

**Files:**
- Create: `src/main/workspace/WorkspaceManager.ts`
- Create: `tests/main/workspace.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/main/workspace.test.ts`:
```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { createDb } from '../../src/main/db/client'
import { ConfigLoader } from '../../src/main/config/ConfigLoader'
import { WorkspaceManager } from '../../src/main/workspace/WorkspaceManager'
import * as schema from '../../src/main/db/schema'

function makeManager() {
  const sqlite = createDb(':memory:')
  const db = drizzle(sqlite, { schema })
  const configLoader = new ConfigLoader('/nonexistent/config.yaml')
  return new WorkspaceManager(db, configLoader)
}

describe('WorkspaceManager', () => {
  let repoPath: string

  beforeEach(() => {
    repoPath = mkdtempSync(join(tmpdir(), 'xaide-ws-'))
  })

  afterEach(() => {
    rmSync(repoPath, { recursive: true, force: true })
  })

  it('starts with an empty list', () => {
    expect(makeManager().list()).toEqual([])
  })

  it('creates a workspace and returns it with all fields', () => {
    const ws = makeManager().create({ name: 'My App', repoPath })
    expect(ws.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(ws.name).toBe('My App')
    expect(ws.repoPath).toBe(repoPath)
    expect(ws.createdAt).toBeTruthy()
  })

  it('lists created workspaces', () => {
    const mgr = makeManager()
    mgr.create({ name: 'First', repoPath })
    mgr.create({ name: 'Second', repoPath })
    expect(mgr.list()).toHaveLength(2)
  })

  it('gets a workspace by id', () => {
    const mgr = makeManager()
    const created = mgr.create({ name: 'Test', repoPath })
    expect(mgr.get(created.id)?.name).toBe('Test')
  })

  it('returns null for a nonexistent id', () => {
    expect(makeManager().get('no-such-id')).toBeNull()
  })

  it('updates a workspace name', () => {
    const mgr = makeManager()
    const ws = mgr.create({ name: 'Old', repoPath })
    expect(mgr.update(ws.id, { name: 'New' }).name).toBe('New')
  })

  it('throws when updating a nonexistent workspace', () => {
    expect(() => makeManager().update('bad-id', { name: 'x' })).toThrow(
      'Workspace not found',
    )
  })

  it('deletes a workspace', () => {
    const mgr = makeManager()
    const ws = mgr.create({ name: 'To Delete', repoPath })
    mgr.delete(ws.id)
    expect(mgr.list()).toHaveLength(0)
  })

  it('throws when repo path does not exist', () => {
    expect(() =>
      makeManager().create({ name: 'Bad', repoPath: '/nonexistent/path/xyz' }),
    ).toThrow('Repo path does not exist')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/main/workspace.test.ts
```

Expected: FAIL — `Cannot find module '../../src/main/workspace/WorkspaceManager'`

- [ ] **Step 3: Create WorkspaceManager**

Create `src/main/workspace/WorkspaceManager.ts`:
```ts
import { randomUUID } from 'crypto'
import { existsSync } from 'fs'
import { eq } from 'drizzle-orm'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { workspaces } from '../db/schema'
import * as schema from '../db/schema'
import type { ConfigLoader } from '../config/ConfigLoader'

type DrizzleDb = BetterSQLite3Database<typeof schema>

export type Workspace = typeof workspaces.$inferSelect

export type CreateWorkspaceInput = {
  name: string
  repoPath: string
}

export class WorkspaceManager {
  constructor(
    private db: DrizzleDb,
    private configLoader: ConfigLoader,
  ) {}

  list(): Workspace[] {
    return this.db.select().from(workspaces).all()
  }

  get(id: string): Workspace | null {
    return this.db.select().from(workspaces).where(eq(workspaces.id, id)).get() ?? null
  }

  create(input: CreateWorkspaceInput): Workspace {
    if (!existsSync(input.repoPath)) {
      throw new Error(`Repo path does not exist: ${input.repoPath}`)
    }
    const wsConfig = this.configLoader.loadWorkspace(input.repoPath)
    const now = new Date().toISOString()
    return this.db
      .insert(workspaces)
      .values({
        id: randomUUID(),
        name: input.name,
        repoPath: input.repoPath,
        configJson: JSON.stringify(wsConfig),
        sandboxDefaults: '{}',
        layoutJson: '{}',
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get()
  }

  update(id: string, input: Partial<CreateWorkspaceInput>): Workspace {
    if (!this.get(id)) throw new Error(`Workspace not found: ${id}`)
    return this.db
      .update(workspaces)
      .set({ ...input, updatedAt: new Date().toISOString() })
      .where(eq(workspaces.id, id))
      .returning()
      .get()
  }

  delete(id: string): void {
    this.db.delete(workspaces).where(eq(workspaces.id, id)).run()
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/main/workspace.test.ts
```

Expected: PASS — 9 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/main/workspace/ tests/main/workspace.test.ts
git commit -m "feat: add WorkspaceManager with CRUD operations

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 5: IPC bridge (typed preload + handlers)

**Files:**
- Create: `src/preload/ipc-types.ts`
- Create: `src/preload/index.ts`
- Create: `src/main/ipc/workspace.ipc.ts`
- Create: `src/main/ipc/index.ts`
- Create: `tests/main/workspace.ipc.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/main/workspace.ipc.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { WorkspaceManager, Workspace } from '../../src/main/workspace/WorkspaceManager'

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn(),
  },
}))

describe('registerWorkspaceHandlers', () => {
  let handlers: Record<string, (...args: unknown[]) => unknown>
  let mockManager: WorkspaceManager

  beforeEach(async () => {
    vi.resetModules()
    handlers = {}

    const { ipcMain } = await import('electron')
    vi.mocked(ipcMain.handle).mockImplementation((channel, fn) => {
      handlers[channel as string] = fn as (...args: unknown[]) => unknown
    })

    const stubWs: Workspace = {
      id: 'ws1',
      name: 'Test',
      repoPath: '/tmp',
      configJson: '{}',
      sandboxDefaults: '{}',
      layoutJson: '{}',
      createdAt: '',
      updatedAt: '',
    }
    mockManager = {
      list: vi.fn(() => [stubWs]),
      create: vi.fn(() => stubWs),
      get: vi.fn(() => stubWs),
      update: vi.fn(() => stubWs),
      delete: vi.fn(),
    } as unknown as WorkspaceManager

    const { registerWorkspaceHandlers } = await import(
      '../../src/main/ipc/workspace.ipc'
    )
    registerWorkspaceHandlers(mockManager)
  })

  it('registers all five workspace IPC channels', () => {
    expect(handlers['workspace:list']).toBeDefined()
    expect(handlers['workspace:create']).toBeDefined()
    expect(handlers['workspace:get']).toBeDefined()
    expect(handlers['workspace:update']).toBeDefined()
    expect(handlers['workspace:delete']).toBeDefined()
  })

  it('workspace:list calls manager.list()', async () => {
    await handlers['workspace:list']({})
    expect(mockManager.list).toHaveBeenCalledOnce()
  })

  it('workspace:create passes input to manager.create()', async () => {
    const input = { name: 'New WS', repoPath: '/tmp' }
    await handlers['workspace:create']({}, input)
    expect(mockManager.create).toHaveBeenCalledWith(input)
  })

  it('workspace:get passes id to manager.get()', async () => {
    await handlers['workspace:get']({}, 'ws1')
    expect(mockManager.get).toHaveBeenCalledWith('ws1')
  })

  it('workspace:delete passes id to manager.delete()', async () => {
    await handlers['workspace:delete']({}, 'ws1')
    expect(mockManager.delete).toHaveBeenCalledWith('ws1')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/main/workspace.ipc.test.ts
```

Expected: FAIL — `Cannot find module '../../src/main/ipc/workspace.ipc'`

- [ ] **Step 3: Create shared IPC types**

Create `src/preload/ipc-types.ts`:
```ts
export interface Workspace {
  id: string
  name: string
  repoPath: string
  configJson: string
  sandboxDefaults: string
  layoutJson: string
  createdAt: string
  updatedAt: string
}

export interface CreateWorkspaceInput {
  name: string
  repoPath: string
}

export interface WorkspaceAPI {
  list: () => Promise<Workspace[]>
  create: (input: CreateWorkspaceInput) => Promise<Workspace>
  get: (id: string) => Promise<Workspace | null>
  update: (id: string, input: Partial<CreateWorkspaceInput>) => Promise<Workspace>
  delete: (id: string) => Promise<void>
}

export interface XaideAPI {
  workspace: WorkspaceAPI
}

declare global {
  interface Window {
    xaide: XaideAPI
  }
}
```

- [ ] **Step 4: Create contextBridge preload**

Create `src/preload/index.ts`:
```ts
import { contextBridge, ipcRenderer } from 'electron'
import type { XaideAPI, CreateWorkspaceInput } from './ipc-types'

const api: XaideAPI = {
  workspace: {
    list: () => ipcRenderer.invoke('workspace:list'),
    create: (input: CreateWorkspaceInput) =>
      ipcRenderer.invoke('workspace:create', input),
    get: (id: string) => ipcRenderer.invoke('workspace:get', id),
    update: (id: string, input: Partial<CreateWorkspaceInput>) =>
      ipcRenderer.invoke('workspace:update', id, input),
    delete: (id: string) => ipcRenderer.invoke('workspace:delete', id),
  },
}

contextBridge.exposeInMainWorld('xaide', api)
```

- [ ] **Step 5: Create IPC handlers**

Create `src/main/ipc/workspace.ipc.ts`:
```ts
import { ipcMain } from 'electron'
import type { WorkspaceManager } from '../workspace/WorkspaceManager'
import type { CreateWorkspaceInput } from '../../preload/ipc-types'

export function registerWorkspaceHandlers(manager: WorkspaceManager): void {
  ipcMain.handle('workspace:list', () => manager.list())
  ipcMain.handle('workspace:create', (_, input: CreateWorkspaceInput) =>
    manager.create(input),
  )
  ipcMain.handle('workspace:get', (_, id: string) => manager.get(id))
  ipcMain.handle(
    'workspace:update',
    (_, id: string, input: Partial<CreateWorkspaceInput>) =>
      manager.update(id, input),
  )
  ipcMain.handle('workspace:delete', (_, id: string) => manager.delete(id))
}
```

Create `src/main/ipc/index.ts`:
```ts
export { registerWorkspaceHandlers } from './workspace.ipc'
```

- [ ] **Step 6: Run test to verify it passes**

```bash
npx vitest run tests/main/workspace.ipc.test.ts
```

Expected: PASS — 5 tests pass.

- [ ] **Step 7: Run all main tests**

```bash
npx vitest run
```

Expected: PASS — all tests in `tests/main/` pass (db, config, workspace, workspace.ipc).

- [ ] **Step 8: Commit**

```bash
git add src/preload/ src/main/ipc/ tests/main/workspace.ipc.test.ts
git commit -m "feat: add typed IPC bridge and workspace IPC handlers

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 6: Main process entry and HTML bootstrap

**Files:**
- Create: `src/main/index.ts`
- Create: `src/renderer/index.html`

- [ ] **Step 1: Create main process entry**

Create `src/main/index.ts`:
```ts
import { app, BrowserWindow } from 'electron'
import { join } from 'path'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { createDb } from './db/client'
import * as schema from './db/schema'
import { ConfigLoader } from './config/ConfigLoader'
import { WorkspaceManager } from './workspace/WorkspaceManager'
import { registerWorkspaceHandlers } from './ipc'

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: '#0a0a0a',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
    win.webContents.openDevTools()
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  const sqlite = createDb(join(app.getPath('userData'), 'xaide.db'))
  const db = drizzle(sqlite, { schema })
  const configLoader = new ConfigLoader()
  const workspaceManager = new WorkspaceManager(db, configLoader)

  registerWorkspaceHandlers(workspaceManager)
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
```

- [ ] **Step 2: Create renderer HTML entry**

Create `src/renderer/index.html`:
```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Xaide</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 3: Commit**

```bash
git add src/main/index.ts src/renderer/index.html
git commit -m "feat: add main process entry and renderer HTML bootstrap

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 7: Shell UI (React renderer)

**Files:**
- Create: `src/renderer/src/index.css`
- Create: `src/renderer/src/main.tsx`
- Create: `src/renderer/src/components/IconRail.tsx`
- Create: `src/renderer/src/hooks/useWorkspaces.ts`
- Create: `src/renderer/src/components/LeftPanel.tsx`
- Create: `src/renderer/src/components/MainArea.tsx`
- Create: `src/renderer/src/App.tsx`
- Create: `tests/renderer/setup.ts`
- Create: `tests/renderer/App.test.tsx`

- [ ] **Step 1: Write the failing renderer tests**

Create `tests/renderer/setup.ts`:
```ts
import '@testing-library/jest-dom'
import type { Workspace, XaideAPI } from '../../src/preload/ipc-types'

const stubWs: Workspace = {
  id: 'mock-id',
  name: 'Mock Workspace',
  repoPath: '/tmp/mock',
  configJson: '{}',
  sandboxDefaults: '{}',
  layoutJson: '{}',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

const mockXaideApi: XaideAPI = {
  workspace: {
    list: async () => [stubWs],
    create: async (input) => ({ ...stubWs, name: input.name, repoPath: input.repoPath }),
    get: async () => stubWs,
    update: async (id, input) => ({ ...stubWs, id, ...input }),
    delete: async () => undefined,
  },
}

Object.defineProperty(window, 'xaide', {
  value: mockXaideApi,
  writable: true,
})
```

Create `tests/renderer/App.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from '../../src/renderer/src/App'

describe('App shell', () => {
  it('renders all four icon rail buttons', () => {
    render(<App />)
    expect(screen.getByTitle('Agents')).toBeInTheDocument()
    expect(screen.getByTitle('Tasks')).toBeInTheDocument()
    expect(screen.getByTitle('Extensions')).toBeInTheDocument()
    expect(screen.getByTitle('Settings')).toBeInTheDocument()
  })

  it('shows the Workspaces heading by default', () => {
    render(<App />)
    expect(screen.getByText('Workspaces')).toBeInTheDocument()
  })

  it('shows the main area placeholder', () => {
    render(<App />)
    expect(screen.getByText(/open a workspace/i)).toBeInTheDocument()
  })

  it('hides the left panel when a non-agents rail item is active', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByTitle('Tasks'))
    expect(screen.queryByText('Workspaces')).not.toBeInTheDocument()
  })

  it('re-shows the left panel when Agents is clicked again', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByTitle('Tasks'))
    await user.click(screen.getByTitle('Agents'))
    expect(screen.getByText('Workspaces')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run renderer tests to verify they fail**

```bash
npx vitest run --config vitest.renderer.config.ts tests/renderer/App.test.tsx
```

Expected: FAIL — `Cannot find module '../../src/renderer/src/App'`

- [ ] **Step 3: Create Tailwind CSS entry**

Create `src/renderer/src/index.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

* {
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', system-ui,
    sans-serif;
  -webkit-font-smoothing: antialiased;
  overflow: hidden;
}
```

- [ ] **Step 4: Create IconRail component**

Create `src/renderer/src/components/IconRail.tsx`:
```tsx
import type { FC } from 'react'

export type IconRailItem = {
  id: string
  icon: string
  label: string
  onClick: () => void
  active?: boolean
}

type Props = { items: IconRailItem[] }

export const IconRail: FC<Props> = ({ items }) => (
  <nav
    aria-label="Main navigation"
    className="flex flex-col items-center w-9 shrink-0 bg-neutral-900 border-r border-neutral-800 py-2 gap-1"
  >
    {items.map((item) => (
      <button
        key={item.id}
        title={item.label}
        aria-label={item.label}
        onClick={item.onClick}
        className={[
          'w-7 h-7 flex items-center justify-center rounded text-sm transition-colors',
          item.active
            ? 'bg-neutral-700 text-white'
            : 'text-neutral-500 hover:text-neutral-200 hover:bg-neutral-800',
        ].join(' ')}
      >
        {item.icon}
      </button>
    ))}
  </nav>
)
```

- [ ] **Step 5: Create useWorkspaces hook**

Create `src/renderer/src/hooks/useWorkspaces.ts`:
```ts
import { useQuery } from '@tanstack/react-query'
import type { Workspace } from '../../../preload/ipc-types'

export function useWorkspaces() {
  return useQuery<Workspace[]>({
    queryKey: ['workspaces'],
    queryFn: () => window.xaide.workspace.list(),
  })
}
```

- [ ] **Step 6: Create LeftPanel component**

Create `src/renderer/src/components/LeftPanel.tsx`:
```tsx
import type { FC } from 'react'
import { useWorkspaces } from '../hooks/useWorkspaces'

export const LeftPanel: FC = () => {
  const { data: workspaces = [], isLoading } = useWorkspaces()

  return (
    <aside className="w-56 shrink-0 bg-neutral-900 border-r border-neutral-800 flex flex-col">
      <div className="px-3 py-2 text-xs font-semibold text-neutral-500 uppercase tracking-wider select-none">
        Workspaces
      </div>
      {isLoading ? (
        <p className="px-3 py-2 text-xs text-neutral-600">Loading…</p>
      ) : workspaces.length === 0 ? (
        <p className="px-3 py-2 text-xs text-neutral-600">No workspaces yet</p>
      ) : (
        <ul className="flex-1 overflow-y-auto">
          {workspaces.map((ws) => (
            <li key={ws.id}>
              <button className="w-full text-left px-3 py-1.5 text-sm text-neutral-300 hover:bg-neutral-800 rounded-sm truncate">
                {ws.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  )
}
```

- [ ] **Step 7: Create MainArea component**

Create `src/renderer/src/components/MainArea.tsx`:
```tsx
import type { FC } from 'react'

export const MainArea: FC = () => (
  <main className="flex-1 min-w-0 bg-neutral-950 flex items-center justify-center">
    <p className="text-neutral-600 text-sm select-none">
      Open a workspace to get started
    </p>
  </main>
)
```

- [ ] **Step 8: Create root App component**

Create `src/renderer/src/App.tsx`:
```tsx
import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { IconRail, type IconRailItem } from './components/IconRail'
import { LeftPanel } from './components/LeftPanel'
import { MainArea } from './components/MainArea'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
})

type PanelId = 'agents' | 'tasks' | 'extensions' | 'settings'

const RAIL_DEFS: Array<{ id: PanelId; icon: string; label: string }> = [
  { id: 'agents', icon: '⬡', label: 'Agents' },
  { id: 'tasks', icon: '☰', label: 'Tasks' },
  { id: 'extensions', icon: '⊞', label: 'Extensions' },
  { id: 'settings', icon: '⚙', label: 'Settings' },
]

function AppInner() {
  const [activePanel, setActivePanel] = useState<PanelId>('agents')

  const railItems: IconRailItem[] = RAIL_DEFS.map((def) => ({
    ...def,
    active: activePanel === def.id,
    onClick: () => setActivePanel(def.id),
  }))

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-neutral-950 text-neutral-100">
      <IconRail items={railItems} />
      {activePanel === 'agents' && <LeftPanel />}
      <MainArea />
    </div>
  )
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppInner />
    </QueryClientProvider>
  )
}
```

- [ ] **Step 9: Create React entry point**

Create `src/renderer/src/main.tsx`:
```tsx
import './index.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'

const root = document.getElementById('root')
if (!root) throw new Error('#root element not found')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

- [ ] **Step 10: Run renderer tests to verify they pass**

```bash
npx vitest run --config vitest.renderer.config.ts tests/renderer/App.test.tsx
```

Expected: PASS — 5 tests pass.

- [ ] **Step 11: Run the full test suite**

```bash
npm run test:all
```

Expected: All tests pass (main + renderer). Output resembles:
```
Tests  14 passed (14)
```

- [ ] **Step 12: Verify the app runs**

```bash
npm run dev
```

Expected: Electron window opens (~2s). Shows a dark window with:
- Narrow icon rail on the left with ⬡ ☰ ⊞ ⚙ icons
- "WORKSPACES" panel next to it
- "Open a workspace to get started" in the main area

Close the window.

- [ ] **Step 13: Build to verify no compilation errors**

```bash
npm run build 2>&1 | tail -10
```

Expected: Build succeeds. `out/main/`, `out/preload/`, `out/renderer/` directories created.

- [ ] **Step 14: Commit**

```bash
git add src/renderer/ tests/renderer/
git commit -m "feat: add shell UI with icon rail, workspace panel, and main area

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Self-Review

**Spec coverage:**

| Spec requirement | Task |
|---|---|
| Electron + TypeScript | Task 1 |
| React 18 + Vite + Tailwind + Radix UI | Task 1 (installed), Task 7 (Tailwind used; Radix installed for later plans) |
| SQLite + Drizzle ORM, all 6 tables | Task 2 |
| Config hierarchy: global + workspace YAML | Task 3 |
| IPC bridge — typed, schema-validated | Tasks 4–5 |
| WorkspaceManager (CRUD) | Task 4 |
| TanStack React Query | Task 7 |
| Shell UI: icon rail + left panel + main area | Task 7 |
| Electron BrowserWindow + titleBarStyle | Task 6 |

**Out of scope for this plan (covered by sub-plans 2–8):**
- AgentOrchestrator, WorktreeManager, SandboxManager, PluginSystem, MCPRegistry, TaskAdapterSystem, ReviewWorkflow
- Terminal panes (xterm.js + node-pty)
- Browser panel
- Workspace switching / multiple tabs

**Placeholder scan:** None found. All steps have complete code or exact commands.

**Type consistency:**
- `Workspace` type defined once in `src/preload/ipc-types.ts`, imported by `useWorkspaces.ts`, `WorkspaceManager.ts` (inferred from Drizzle), and `workspace.ipc.ts`
- `CreateWorkspaceInput` defined in `ipc-types.ts`, used consistently in preload, handler, and manager
- `DrizzleDb` typed as `BetterSQLite3Database<typeof schema>` in WorkspaceManager — matches what `drizzle(sqlite, { schema })` returns in main/index.ts and tests
