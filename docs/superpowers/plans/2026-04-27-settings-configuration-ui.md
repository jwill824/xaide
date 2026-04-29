# Settings & Configuration UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a full-panel Settings view (replacing MainArea when active) with three sections — Agent Config, Hooks, and MCP Servers — each with global + per-workspace scopes, backed by new DB tables and a settings IPC bridge.

**Architecture:** Follow the established 4-layer pattern: Manager class (DB/file I/O) → `settings.ipc.ts` (handlers) → preload bridge → React Query hooks → section components. `App.tsx` already has a `settings` panel ID in `RAIL_DEFS`; we add `<SettingsView />` as the conditional render. Agent configs read/write real files (`CLAUDE.md`, `.github/copilot-instructions.md`) using `<!-- xaide:start -->`/`<!-- xaide:end -->` markers to preserve existing user content. Hooks fire via `execSync` in `HookManager.fire()`. MCP servers persist to `.mcp.json` (Claude) and `.vscode/mcp.json` (Copilot) on demand.

**Tech Stack:** better-sqlite3 (raw DDL in `client.ts`), Drizzle ORM, Electron IPC, React Query v5, Zustand, React, TypeScript, Tailwind CSS, Vitest

---

## File Map

### New — main process
- `src/main/settings/AgentConfigManager.ts` — CRUD `agent_configs` table + read/write CLAUDE.md and `.github/copilot-instructions.md`
- `src/main/settings/HookManager.ts` — CRUD `hooks` table + `fire(event)` via `execSync`
- `src/main/settings/McpManager.ts` — CRUD `mcp_servers` table + write `.mcp.json` / `.vscode/mcp.json`
- `src/main/ipc/settings.ipc.ts` — `registerSettingsHandlers(agentConfigManager, hookManager, mcpManager)`

### Modified — main process
- `src/main/db/client.ts` — add `hooks` + `agent_configs` tables to `SCHEMA_SQL`
- `src/main/db/schema.ts` — add `hooks` + `agentConfigs` Drizzle table definitions; add both to `dbSchema`
- `src/main/ipc/index.ts` — export `registerSettingsHandlers`
- `src/main/index.ts` — instantiate managers, call `registerSettingsHandlers`

### Modified — preload
- `src/preload/ipc-types.ts` — add `SETTINGS_CHANNELS`, all record/input types, `SettingsAPI`; extend `XaideAPI`
- `src/preload/index.ts` — add `settings` binding to `contextBridge`

### New — renderer
- `src/renderer/src/components/SettingsView.tsx` — full-panel shell with inner left nav + section router
- `src/renderer/src/components/SettingsNav.tsx` — three-item sidebar nav (Agent Config | Hooks | MCP Servers)
- `src/renderer/src/components/AgentConfigSection.tsx` — global + workspace system-prompt editor with file-write buttons
- `src/renderer/src/components/HooksSection.tsx` — hook list with inline add form and delete/toggle controls
- `src/renderer/src/components/McpServersSection.tsx` — MCP server list with inline add form and write-config buttons
- `src/renderer/src/hooks/useAgentConfig.ts` — React Query hooks for agent config + file I/O
- `src/renderer/src/hooks/useHooks.ts` — React Query hooks for hooks CRUD
- `src/renderer/src/hooks/useMcpServers.ts` — React Query hooks for MCP servers CRUD

### Modified — renderer
- `src/renderer/src/App.tsx` — render `<SettingsView />` instead of `<MainArea />` when `activePanel === 'settings'`
- `tests/renderer/setup.ts` — add `settings` mock to `window.xaide`

### New — tests
- `tests/main/agent-config-manager.test.ts`
- `tests/main/hook-manager.test.ts`
- `tests/main/mcp-manager.test.ts`
- `tests/renderer/SettingsView.test.tsx`
- `tests/renderer/HooksSection.test.tsx`
- `tests/renderer/McpServersSection.test.tsx`

---

## Task 1: DB schema additions and settings managers

**Files:**
- Modify: `src/main/db/client.ts`
- Modify: `src/main/db/schema.ts`
- Create: `src/main/settings/AgentConfigManager.ts`
- Create: `src/main/settings/HookManager.ts`
- Create: `src/main/settings/McpManager.ts`
- Create: `tests/main/agent-config-manager.test.ts`
- Create: `tests/main/hook-manager.test.ts`
- Create: `tests/main/mcp-manager.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/main/agent-config-manager.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { createDb } from '../../src/main/db/client'
import { dbSchema } from '../../src/main/db/schema'
import { AgentConfigManager } from '../../src/main/settings/AgentConfigManager'
import { writeFile, rm, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'

let manager: AgentConfigManager
let workspaceId: string
let tmpDir: string

beforeEach(async () => {
  const raw = createDb(':memory:')
  const db = drizzle(raw, { schema: dbSchema })
  manager = new AgentConfigManager(db)
  tmpDir = join(tmpdir(), randomUUID())
  await mkdir(tmpDir, { recursive: true })

  const ws = await db
    .insert(dbSchema.workspaces)
    .values({ id: 'ws-1', name: 'WS', repoPath: tmpDir, configJson: '{}', sandboxDefaults: '{}', layoutJson: '{}' })
    .returning()
  workspaceId = ws[0].id
})

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true })
})

describe('AgentConfigManager', () => {
  it('returns null when no global config exists', async () => {
    expect(await manager.getGlobal()).toBeNull()
  })

  it('upsert creates a new global config', async () => {
    const cfg = await manager.upsert({ scope: 'global', systemPromptAdditions: 'Be concise.' })
    expect(cfg.scope).toBe('global')
    expect(cfg.systemPromptAdditions).toBe('Be concise.')
  })

  it('upsert updates existing global config', async () => {
    await manager.upsert({ scope: 'global', systemPromptAdditions: 'First.' })
    const updated = await manager.upsert({ scope: 'global', systemPromptAdditions: 'Second.' })
    expect(updated.systemPromptAdditions).toBe('Second.')
    expect(await manager.getGlobal()).not.toBeNull()
  })

  it('upsert creates per-workspace config', async () => {
    const cfg = await manager.upsert({ scope: 'workspace', workspaceId, systemPromptAdditions: 'WS only.' })
    expect(cfg.workspaceId).toBe(workspaceId)
  })

  it('readClaudeConfig returns empty when CLAUDE.md missing', async () => {
    const result = await manager.readClaudeConfig(tmpDir)
    expect(result).toEqual({ external: '', xaideManaged: '' })
  })

  it('writeClaudeConfig creates CLAUDE.md with markers', async () => {
    await manager.writeClaudeConfig(tmpDir, 'My xaide content.')
    const result = await manager.readClaudeConfig(tmpDir)
    expect(result.xaideManaged).toBe('My xaide content.')
    expect(result.external).toBe('')
  })

  it('writeClaudeConfig preserves existing external content', async () => {
    await writeFile(join(tmpDir, 'CLAUDE.md'), '# Existing content\n\nKeep this.\n', 'utf-8')
    await manager.writeClaudeConfig(tmpDir, 'Xaide additions.')
    const result = await manager.readClaudeConfig(tmpDir)
    expect(result.external).toContain('Keep this.')
    expect(result.xaideManaged).toBe('Xaide additions.')
  })

  it('writeCopilotConfig creates .github/copilot-instructions.md', async () => {
    await manager.writeCopilotConfig(tmpDir, 'Copilot instructions.')
    const result = await manager.readCopilotConfig(tmpDir)
    expect(result.xaideManaged).toBe('Copilot instructions.')
  })
})
```

Create `tests/main/hook-manager.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { createDb } from '../../src/main/db/client'
import { dbSchema } from '../../src/main/db/schema'
import { HookManager } from '../../src/main/settings/HookManager'

let manager: HookManager
let workspaceId: string

beforeEach(async () => {
  const raw = createDb(':memory:')
  const db = drizzle(raw, { schema: dbSchema })
  manager = new HookManager(db)
  const ws = await db
    .insert(dbSchema.workspaces)
    .values({ id: 'ws-1', name: 'WS', repoPath: '/tmp', configJson: '{}', sandboxDefaults: '{}', layoutJson: '{}' })
    .returning()
  workspaceId = ws[0].id
})

describe('HookManager', () => {
  it('lists empty when no hooks exist', async () => {
    expect(await manager.list()).toHaveLength(0)
  })

  it('creates a global hook', async () => {
    const hook = await manager.create({ scope: 'global', event: 'agent.start', command: 'echo start' })
    expect(hook.scope).toBe('global')
    expect(hook.event).toBe('agent.start')
    expect(hook.command).toBe('echo start')
    expect(hook.enabled).toBe(true)
  })

  it('list() with workspaceId returns global + workspace hooks', async () => {
    await manager.create({ scope: 'global', event: 'agent.start', command: 'echo global' })
    await manager.create({ scope: 'workspace', workspaceId, event: 'agent.stop', command: 'echo ws' })
    const hooks = await manager.list(workspaceId)
    expect(hooks).toHaveLength(2)
  })

  it('list() without workspaceId returns only global hooks', async () => {
    await manager.create({ scope: 'global', event: 'agent.start', command: 'echo global' })
    await manager.create({ scope: 'workspace', workspaceId, event: 'agent.stop', command: 'echo ws' })
    const hooks = await manager.list()
    expect(hooks).toHaveLength(1)
    expect(hooks[0].scope).toBe('global')
  })

  it('update changes command and enabled', async () => {
    const hook = await manager.create({ scope: 'global', event: 'agent.start', command: 'echo old' })
    const updated = await manager.update(hook.id, { command: 'echo new', enabled: false })
    expect(updated.command).toBe('echo new')
    expect(updated.enabled).toBe(false)
  })

  it('delete removes hook', async () => {
    const hook = await manager.create({ scope: 'global', event: 'agent.start', command: 'echo x' })
    await manager.delete(hook.id)
    expect(await manager.list()).toHaveLength(0)
  })

  it('throws when deleting nonexistent hook', async () => {
    await expect(manager.delete('no-such-id')).rejects.toThrow('Hook not found: no-such-id')
  })
})
```

Create `tests/main/mcp-manager.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { createDb } from '../../src/main/db/client'
import { dbSchema } from '../../src/main/db/schema'
import { McpManager } from '../../src/main/settings/McpManager'
import { rm, mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'

let manager: McpManager
let workspaceId: string
let tmpDir: string

beforeEach(async () => {
  const raw = createDb(':memory:')
  const db = drizzle(raw, { schema: dbSchema })
  manager = new McpManager(db)
  tmpDir = join(tmpdir(), randomUUID())
  await mkdir(tmpDir, { recursive: true })
  const ws = await db
    .insert(dbSchema.workspaces)
    .values({ id: 'ws-1', name: 'WS', repoPath: tmpDir, configJson: '{}', sandboxDefaults: '{}', layoutJson: '{}' })
    .returning()
  workspaceId = ws[0].id
})

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true })
})

describe('McpManager', () => {
  it('lists empty when no servers', async () => {
    expect(await manager.list()).toHaveLength(0)
  })

  it('creates a global MCP server', async () => {
    const srv = await manager.create({
      name: 'my-mcp',
      scope: 'global',
      config: { command: 'npx', args: ['my-mcp-server'] },
    })
    expect(srv.name).toBe('my-mcp')
    expect(srv.scope).toBe('global')
  })

  it('update changes name and enabled', async () => {
    const srv = await manager.create({ name: 'old', scope: 'global', config: { command: 'cmd' } })
    const updated = await manager.update(srv.id, { name: 'new', enabled: false })
    expect(updated.name).toBe('new')
    expect(updated.enabled).toBe(false)
  })

  it('delete removes server', async () => {
    const srv = await manager.create({ name: 'x', scope: 'global', config: { command: 'cmd' } })
    await manager.delete(srv.id)
    expect(await manager.list()).toHaveLength(0)
  })

  it('writeClaudeMcpConfig writes .mcp.json', async () => {
    await manager.create({ name: 'my-tool', scope: 'global', config: { command: 'npx', args: ['my-tool'] } })
    await manager.writeClaudeMcpConfig(tmpDir, workspaceId)
    const raw = await readFile(join(tmpDir, '.mcp.json'), 'utf-8')
    const parsed = JSON.parse(raw)
    expect(parsed.mcpServers['my-tool']).toBeDefined()
  })

  it('writeCopilotMcpConfig writes .vscode/mcp.json', async () => {
    await manager.create({ name: 'my-tool', scope: 'global', config: { url: 'http://localhost:3000' } })
    await manager.writeCopilotMcpConfig(tmpDir, workspaceId)
    const raw = await readFile(join(tmpDir, '.vscode', 'mcp.json'), 'utf-8')
    const parsed = JSON.parse(raw)
    expect(parsed.servers['my-tool']).toBeDefined()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
export PATH="/Users/jeff.williams/.vfox/cache/nodejs/v-22.22.2/nodejs-22.22.2/bin:$PATH"
cd /Users/jeff.williams/Developer/personal/xaide
npx vitest run --config vitest.config.ts tests/main/agent-config-manager.test.ts tests/main/hook-manager.test.ts tests/main/mcp-manager.test.ts
```

Expected: FAIL — `Cannot find module '../../src/main/settings/AgentConfigManager'`

- [ ] **Step 3: Add new tables to SCHEMA_SQL**

In `src/main/db/client.ts`, append to the `SCHEMA_SQL` string (before the closing backtick):

```sql
  CREATE TABLE IF NOT EXISTS agent_configs (
    id TEXT PRIMARY KEY,
    scope TEXT NOT NULL DEFAULT 'global'
      CHECK(scope IN ('global','workspace')),
    workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE,
    agent_type TEXT NOT NULL DEFAULT 'all'
      CHECK(agent_type IN ('claude','copilot','all')),
    system_prompt_additions TEXT NOT NULL DEFAULT '',
    config_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS hooks (
    id TEXT PRIMARY KEY,
    scope TEXT NOT NULL DEFAULT 'global'
      CHECK(scope IN ('global','workspace')),
    workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE,
    event TEXT NOT NULL
      CHECK(event IN ('agent.start','agent.stop','agent.commit','agent.error')),
    command TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_agent_configs_workspace_id
    ON agent_configs(workspace_id);

  CREATE INDEX IF NOT EXISTS idx_hooks_workspace_id
    ON hooks(workspace_id);
```

- [ ] **Step 4: Add new tables to Drizzle schema**

In `src/main/db/schema.ts`, add after the `worktrees` table definition:

```typescript
export const agentConfigs = sqliteTable(
  'agent_configs',
  {
    id: text('id').primaryKey(),
    scope: text('scope', { enum: ['global', 'workspace'] }).notNull().default('global'),
    workspaceId: text('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }),
    agentType: text('agent_type', { enum: ['claude', 'copilot', 'all'] }).notNull().default('all'),
    systemPromptAdditions: text('system_prompt_additions').notNull().default(''),
    configJson: text('config_json').notNull().default('{}'),
    createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
    updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
  },
  (t) => [index('idx_agent_configs_workspace_id').on(t.workspaceId)],
)

export const hooks = sqliteTable(
  'hooks',
  {
    id: text('id').primaryKey(),
    scope: text('scope', { enum: ['global', 'workspace'] }).notNull().default('global'),
    workspaceId: text('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }),
    event: text('event', {
      enum: ['agent.start', 'agent.stop', 'agent.commit', 'agent.error'],
    }).notNull(),
    command: text('command').notNull(),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
    createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  },
  (t) => [index('idx_hooks_workspace_id').on(t.workspaceId)],
)
```

Also update `dbSchema` export at the bottom of `schema.ts` to include both new tables:

```typescript
export const dbSchema = {
  workspaces,
  tasks,
  agentSessions,
  events,
  mcpServers,
  plugins,
  worktrees,
  agentConfigs,
  hooks,
}
```

- [ ] **Step 5: Implement AgentConfigManager**

Create `src/main/settings/AgentConfigManager.ts`:

```typescript
import { randomUUID } from 'node:crypto'
import { eq, and, isNull } from 'drizzle-orm'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { DrizzleDb } from '../db/schema'
import { agentConfigs } from '../db/schema'

export type AgentConfig = typeof agentConfigs.$inferSelect

const XAIDE_START = '<!-- xaide:start -->'
const XAIDE_END = '<!-- xaide:end -->'

export class AgentConfigManager {
  constructor(private db: DrizzleDb) {}

  async getGlobal(): Promise<AgentConfig | null> {
    const rows = await this.db
      .select()
      .from(agentConfigs)
      .where(and(eq(agentConfigs.scope, 'global'), isNull(agentConfigs.workspaceId)))
      .limit(1)
    return rows[0] ?? null
  }

  async getForWorkspace(workspaceId: string): Promise<AgentConfig | null> {
    const rows = await this.db
      .select()
      .from(agentConfigs)
      .where(and(eq(agentConfigs.scope, 'workspace'), eq(agentConfigs.workspaceId, workspaceId)))
      .limit(1)
    return rows[0] ?? null
  }

  async upsert(input: {
    scope: 'global' | 'workspace'
    workspaceId?: string
    agentType?: 'claude' | 'copilot' | 'all'
    systemPromptAdditions?: string
    configJson?: string
  }): Promise<AgentConfig> {
    const now = new Date().toISOString()
    const existing =
      input.scope === 'global'
        ? await this.getGlobal()
        : await this.getForWorkspace(input.workspaceId!)

    if (existing) {
      const rows = await this.db
        .update(agentConfigs)
        .set({
          agentType: input.agentType ?? existing.agentType,
          systemPromptAdditions: input.systemPromptAdditions ?? existing.systemPromptAdditions,
          configJson: input.configJson ?? existing.configJson,
          updatedAt: now,
        })
        .where(eq(agentConfigs.id, existing.id))
        .returning()
      return rows[0]
    }

    const rows = await this.db
      .insert(agentConfigs)
      .values({
        id: randomUUID(),
        scope: input.scope,
        workspaceId: input.workspaceId ?? null,
        agentType: input.agentType ?? 'all',
        systemPromptAdditions: input.systemPromptAdditions ?? '',
        configJson: input.configJson ?? '{}',
        createdAt: now,
        updatedAt: now,
      })
      .returning()
    return rows[0]
  }

  async readClaudeConfig(repoPath: string): Promise<{ external: string; xaideManaged: string }> {
    const path = join(repoPath, 'CLAUDE.md')
    if (!existsSync(path)) return { external: '', xaideManaged: '' }
    const content = await readFile(path, 'utf-8')
    return this._parseMarkers(content)
  }

  async writeClaudeConfig(repoPath: string, xaideContent: string): Promise<void> {
    const { external } = await this.readClaudeConfig(repoPath)
    const parts = [...(external ? [external] : []), XAIDE_START, xaideContent, XAIDE_END]
    await writeFile(join(repoPath, 'CLAUDE.md'), parts.join('\n\n') + '\n', 'utf-8')
  }

  async readCopilotConfig(repoPath: string): Promise<{ external: string; xaideManaged: string }> {
    const path = join(repoPath, '.github', 'copilot-instructions.md')
    if (!existsSync(path)) return { external: '', xaideManaged: '' }
    const content = await readFile(path, 'utf-8')
    return this._parseMarkers(content)
  }

  async writeCopilotConfig(repoPath: string, xaideContent: string): Promise<void> {
    const { external } = await this.readCopilotConfig(repoPath)
    await mkdir(join(repoPath, '.github'), { recursive: true })
    const parts = [...(external ? [external] : []), XAIDE_START, xaideContent, XAIDE_END]
    await writeFile(
      join(repoPath, '.github', 'copilot-instructions.md'),
      parts.join('\n\n') + '\n',
      'utf-8',
    )
  }

  private _parseMarkers(content: string): { external: string; xaideManaged: string } {
    const startIdx = content.indexOf(XAIDE_START)
    const endIdx = content.indexOf(XAIDE_END)
    if (startIdx === -1 || endIdx === -1) return { external: content.trim(), xaideManaged: '' }
    const external = content.slice(0, startIdx).trim()
    const xaideManaged = content.slice(startIdx + XAIDE_START.length, endIdx).trim()
    return { external, xaideManaged }
  }
}
```

- [ ] **Step 6: Implement HookManager**

Create `src/main/settings/HookManager.ts`:

```typescript
import { randomUUID } from 'node:crypto'
import { eq, isNull, or } from 'drizzle-orm'
import { execSync } from 'node:child_process'
import type { DrizzleDb } from '../db/schema'
import { hooks } from '../db/schema'

export type Hook = typeof hooks.$inferSelect
export type HookEvent = 'agent.start' | 'agent.stop' | 'agent.commit' | 'agent.error'

export class HookManager {
  constructor(private db: DrizzleDb) {}

  async list(workspaceId?: string): Promise<Hook[]> {
    if (workspaceId) {
      return this.db
        .select()
        .from(hooks)
        .where(or(isNull(hooks.workspaceId), eq(hooks.workspaceId, workspaceId)))
    }
    return this.db.select().from(hooks).where(isNull(hooks.workspaceId))
  }

  async create(input: {
    scope: 'global' | 'workspace'
    workspaceId?: string
    event: HookEvent
    command: string
  }): Promise<Hook> {
    const rows = await this.db
      .insert(hooks)
      .values({
        id: randomUUID(),
        scope: input.scope,
        workspaceId: input.workspaceId ?? null,
        event: input.event,
        command: input.command,
        enabled: true,
        createdAt: new Date().toISOString(),
      })
      .returning()
    return rows[0]
  }

  async update(id: string, input: { command?: string; enabled?: boolean }): Promise<Hook> {
    const rows = await this.db
      .update(hooks)
      .set(input)
      .where(eq(hooks.id, id))
      .returning()
    if (rows.length === 0) throw new Error(`Hook not found: ${id}`)
    return rows[0]
  }

  async delete(id: string): Promise<void> {
    const result = await this.db.delete(hooks).where(eq(hooks.id, id)).returning()
    if (result.length === 0) throw new Error(`Hook not found: ${id}`)
  }

  async fire(event: HookEvent, workspaceId?: string): Promise<void> {
    const applicable = (await this.list(workspaceId)).filter(
      (h) => h.event === event && h.enabled,
    )
    for (const hook of applicable) {
      try {
        execSync(hook.command, { stdio: 'ignore', timeout: 10_000 })
      } catch {
        // hook failure is non-fatal
      }
    }
  }
}
```

- [ ] **Step 7: Implement McpManager**

Create `src/main/settings/McpManager.ts`:

```typescript
import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { DrizzleDb } from '../db/schema'
import { mcpServers } from '../db/schema'

export type McpServer = typeof mcpServers.$inferSelect

export interface McpServerConfig {
  command?: string
  url?: string
  args?: string[]
  env?: Record<string, string>
  workspaceId?: string
}

export class McpManager {
  constructor(private db: DrizzleDb) {}

  async list(workspaceId?: string): Promise<McpServer[]> {
    const all = await this.db.select().from(mcpServers)
    if (!workspaceId) return all.filter((s) => s.scope === 'global')
    return all.filter(
      (s) =>
        s.scope === 'global' ||
        (s.scope === 'workspace' &&
          (JSON.parse(s.configJson) as McpServerConfig).workspaceId === workspaceId),
    )
  }

  async create(input: {
    name: string
    scope: 'global' | 'workspace'
    config: McpServerConfig
  }): Promise<McpServer> {
    const rows = await this.db
      .insert(mcpServers)
      .values({
        id: randomUUID(),
        name: input.name,
        scope: input.scope,
        configJson: JSON.stringify(input.config),
        enabled: true,
        createdAt: new Date().toISOString(),
      })
      .returning()
    return rows[0]
  }

  async update(
    id: string,
    input: { name?: string; config?: McpServerConfig; enabled?: boolean },
  ): Promise<McpServer> {
    const existing = await this.db
      .select()
      .from(mcpServers)
      .where(eq(mcpServers.id, id))
      .limit(1)
    if (!existing[0]) throw new Error(`MCP server not found: ${id}`)
    const rows = await this.db
      .update(mcpServers)
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.config !== undefined ? { configJson: JSON.stringify(input.config) } : {}),
        ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
      })
      .where(eq(mcpServers.id, id))
      .returning()
    return rows[0]
  }

  async delete(id: string): Promise<void> {
    const result = await this.db.delete(mcpServers).where(eq(mcpServers.id, id)).returning()
    if (result.length === 0) throw new Error(`MCP server not found: ${id}`)
  }

  async writeClaudeMcpConfig(repoPath: string, workspaceId: string): Promise<void> {
    const servers = (await this.list(workspaceId)).filter((s) => s.enabled)
    const mcpConfig: Record<string, unknown> = {}
    for (const s of servers) {
      const cfg = JSON.parse(s.configJson) as McpServerConfig
      mcpConfig[s.name] = cfg.url
        ? { type: 'sse', url: cfg.url, ...(cfg.env ? { env: cfg.env } : {}) }
        : {
            type: 'stdio',
            command: cfg.command!,
            args: cfg.args ?? [],
            ...(cfg.env ? { env: cfg.env } : {}),
          }
    }
    await writeFile(
      join(repoPath, '.mcp.json'),
      JSON.stringify({ mcpServers: mcpConfig }, null, 2),
      'utf-8',
    )
  }

  async writeCopilotMcpConfig(repoPath: string, workspaceId: string): Promise<void> {
    const servers = (await this.list(workspaceId)).filter((s) => s.enabled)
    const inputs: Record<string, unknown> = {}
    for (const s of servers) {
      const cfg = JSON.parse(s.configJson) as McpServerConfig
      inputs[s.name] = cfg.url
        ? { type: 'sse', url: cfg.url }
        : { type: 'stdio', command: cfg.command!, args: cfg.args ?? [] }
    }
    await mkdir(join(repoPath, '.vscode'), { recursive: true })
    await writeFile(
      join(repoPath, '.vscode', 'mcp.json'),
      JSON.stringify({ servers: inputs }, null, 2),
      'utf-8',
    )
  }
}
```

- [ ] **Step 8: Run tests to verify they pass**

```bash
export PATH="/Users/jeff.williams/.vfox/cache/nodejs/v-22.22.2/nodejs-22.22.2/bin:$PATH"
cd /Users/jeff.williams/Developer/personal/xaide
npx vitest run --config vitest.config.ts tests/main/agent-config-manager.test.ts tests/main/hook-manager.test.ts tests/main/mcp-manager.test.ts
```

Expected: `24 tests passed` (9 + 8 + 7)

- [ ] **Step 9: Run full main suite to verify no regressions**

```bash
export PATH="/Users/jeff.williams/.vfox/cache/nodejs/v-22.22.2/nodejs-22.22.2/bin:$PATH"
cd /Users/jeff.williams/Developer/personal/xaide
npm test
```

- [ ] **Step 10: Commit**

```bash
cd /Users/jeff.williams/Developer/personal/xaide
git add src/main/db/client.ts \
        src/main/db/schema.ts \
        src/main/settings/AgentConfigManager.ts \
        src/main/settings/HookManager.ts \
        src/main/settings/McpManager.ts \
        tests/main/agent-config-manager.test.ts \
        tests/main/hook-manager.test.ts \
        tests/main/mcp-manager.test.ts
git commit -m "feat: add agent_configs and hooks tables + settings managers

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 2: Settings IPC bridge

**Files:**
- Create: `src/main/ipc/settings.ipc.ts`
- Modify: `src/main/ipc/index.ts`
- Modify: `src/main/index.ts`
- Modify: `src/preload/ipc-types.ts`
- Modify: `src/preload/index.ts`
- Modify: `tests/renderer/setup.ts`

- [ ] **Step 1: Add types to ipc-types.ts**

In `src/preload/ipc-types.ts`, add after the existing `TASK_CHANNELS` block:

```typescript
export const SETTINGS_CHANNELS = {
  AGENT_CONFIG_GET_GLOBAL: 'settings:agent-config:get-global',
  AGENT_CONFIG_GET_WORKSPACE: 'settings:agent-config:get-workspace',
  AGENT_CONFIG_UPSERT: 'settings:agent-config:upsert',
  AGENT_CONFIG_READ_CLAUDE: 'settings:agent-config:read-claude',
  AGENT_CONFIG_WRITE_CLAUDE: 'settings:agent-config:write-claude',
  AGENT_CONFIG_READ_COPILOT: 'settings:agent-config:read-copilot',
  AGENT_CONFIG_WRITE_COPILOT: 'settings:agent-config:write-copilot',
  HOOKS_LIST: 'settings:hooks:list',
  HOOKS_CREATE: 'settings:hooks:create',
  HOOKS_UPDATE: 'settings:hooks:update',
  HOOKS_DELETE: 'settings:hooks:delete',
  MCP_LIST: 'settings:mcp:list',
  MCP_CREATE: 'settings:mcp:create',
  MCP_UPDATE: 'settings:mcp:update',
  MCP_DELETE: 'settings:mcp:delete',
  MCP_WRITE_CLAUDE: 'settings:mcp:write-claude',
  MCP_WRITE_COPILOT: 'settings:mcp:write-copilot',
} as const

export interface AgentConfigRecord {
  id: string
  scope: 'global' | 'workspace'
  workspaceId: string | null
  agentType: 'claude' | 'copilot' | 'all'
  systemPromptAdditions: string
  configJson: string
  createdAt: string
  updatedAt: string
}

export interface UpsertAgentConfigInput {
  scope: 'global' | 'workspace'
  workspaceId?: string
  agentType?: 'claude' | 'copilot' | 'all'
  systemPromptAdditions?: string
  configJson?: string
}

export interface AgentFileContent {
  external: string
  xaideManaged: string
}

export interface HookRecord {
  id: string
  scope: 'global' | 'workspace'
  workspaceId: string | null
  event: 'agent.start' | 'agent.stop' | 'agent.commit' | 'agent.error'
  command: string
  enabled: boolean
  createdAt: string
}

export interface CreateHookInput {
  scope: 'global' | 'workspace'
  workspaceId?: string
  event: 'agent.start' | 'agent.stop' | 'agent.commit' | 'agent.error'
  command: string
}

export interface UpdateHookInput {
  command?: string
  enabled?: boolean
}

export interface McpServerRecord {
  id: string
  name: string
  scope: 'global' | 'workspace'
  configJson: string
  enabled: boolean
  createdAt: string
}

export interface McpServerConfigInput {
  command?: string
  url?: string
  args?: string[]
  env?: Record<string, string>
  workspaceId?: string
}

export interface CreateMcpServerInput {
  name: string
  scope: 'global' | 'workspace'
  config: McpServerConfigInput
}

export interface UpdateMcpServerInput {
  name?: string
  config?: McpServerConfigInput
  enabled?: boolean
}

export interface SettingsAPI {
  getGlobalAgentConfig: () => Promise<AgentConfigRecord | null>
  getWorkspaceAgentConfig: (workspaceId: string) => Promise<AgentConfigRecord | null>
  upsertAgentConfig: (input: UpsertAgentConfigInput) => Promise<AgentConfigRecord>
  readClaudeConfig: (repoPath: string) => Promise<AgentFileContent>
  writeClaudeConfig: (repoPath: string, xaideContent: string) => Promise<void>
  readCopilotConfig: (repoPath: string) => Promise<AgentFileContent>
  writeCopilotConfig: (repoPath: string, xaideContent: string) => Promise<void>
  listHooks: (workspaceId?: string) => Promise<HookRecord[]>
  createHook: (input: CreateHookInput) => Promise<HookRecord>
  updateHook: (id: string, input: UpdateHookInput) => Promise<HookRecord>
  deleteHook: (id: string) => Promise<void>
  listMcpServers: (workspaceId?: string) => Promise<McpServerRecord[]>
  createMcpServer: (input: CreateMcpServerInput) => Promise<McpServerRecord>
  updateMcpServer: (id: string, input: UpdateMcpServerInput) => Promise<McpServerRecord>
  deleteMcpServer: (id: string) => Promise<void>
  writeMcpConfigClaude: (repoPath: string, workspaceId: string) => Promise<void>
  writeMcpConfigCopilot: (repoPath: string, workspaceId: string) => Promise<void>
}
```

Also add `settings: SettingsAPI` to the `XaideAPI` interface.

- [ ] **Step 2: Create settings.ipc.ts**

Create `src/main/ipc/settings.ipc.ts`:

```typescript
import { ipcMain } from 'electron'
import { SETTINGS_CHANNELS } from '../../preload/ipc-types'
import type { AgentConfigManager } from '../settings/AgentConfigManager'
import type { HookManager } from '../settings/HookManager'
import type { McpManager } from '../settings/McpManager'

export function registerSettingsHandlers(
  agentConfigManager: AgentConfigManager,
  hookManager: HookManager,
  mcpManager: McpManager,
): void {
  ipcMain.handle(SETTINGS_CHANNELS.AGENT_CONFIG_GET_GLOBAL, () =>
    agentConfigManager.getGlobal(),
  )
  ipcMain.handle(SETTINGS_CHANNELS.AGENT_CONFIG_GET_WORKSPACE, (_e, workspaceId: string) =>
    agentConfigManager.getForWorkspace(workspaceId),
  )
  ipcMain.handle(SETTINGS_CHANNELS.AGENT_CONFIG_UPSERT, (_e, input) =>
    agentConfigManager.upsert(input),
  )
  ipcMain.handle(SETTINGS_CHANNELS.AGENT_CONFIG_READ_CLAUDE, (_e, repoPath: string) =>
    agentConfigManager.readClaudeConfig(repoPath),
  )
  ipcMain.handle(
    SETTINGS_CHANNELS.AGENT_CONFIG_WRITE_CLAUDE,
    (_e, repoPath: string, content: string) => agentConfigManager.writeClaudeConfig(repoPath, content),
  )
  ipcMain.handle(SETTINGS_CHANNELS.AGENT_CONFIG_READ_COPILOT, (_e, repoPath: string) =>
    agentConfigManager.readCopilotConfig(repoPath),
  )
  ipcMain.handle(
    SETTINGS_CHANNELS.AGENT_CONFIG_WRITE_COPILOT,
    (_e, repoPath: string, content: string) => agentConfigManager.writeCopilotConfig(repoPath, content),
  )
  ipcMain.handle(SETTINGS_CHANNELS.HOOKS_LIST, (_e, workspaceId?: string) =>
    hookManager.list(workspaceId),
  )
  ipcMain.handle(SETTINGS_CHANNELS.HOOKS_CREATE, (_e, input) => hookManager.create(input))
  ipcMain.handle(SETTINGS_CHANNELS.HOOKS_UPDATE, (_e, id: string, input) =>
    hookManager.update(id, input),
  )
  ipcMain.handle(SETTINGS_CHANNELS.HOOKS_DELETE, (_e, id: string) => hookManager.delete(id))
  ipcMain.handle(SETTINGS_CHANNELS.MCP_LIST, (_e, workspaceId?: string) =>
    mcpManager.list(workspaceId),
  )
  ipcMain.handle(SETTINGS_CHANNELS.MCP_CREATE, (_e, input) => mcpManager.create(input))
  ipcMain.handle(SETTINGS_CHANNELS.MCP_UPDATE, (_e, id: string, input) =>
    mcpManager.update(id, input),
  )
  ipcMain.handle(SETTINGS_CHANNELS.MCP_DELETE, (_e, id: string) => mcpManager.delete(id))
  ipcMain.handle(
    SETTINGS_CHANNELS.MCP_WRITE_CLAUDE,
    (_e, repoPath: string, workspaceId: string) =>
      mcpManager.writeClaudeMcpConfig(repoPath, workspaceId),
  )
  ipcMain.handle(
    SETTINGS_CHANNELS.MCP_WRITE_COPILOT,
    (_e, repoPath: string, workspaceId: string) =>
      mcpManager.writeCopilotMcpConfig(repoPath, workspaceId),
  )
}
```

- [ ] **Step 3: Export from ipc/index.ts**

In `src/main/ipc/index.ts`, add:

```typescript
export { registerSettingsHandlers } from './settings.ipc'
```

- [ ] **Step 4: Wire into main/index.ts**

In `src/main/index.ts`:

1. Import the new managers and handler:
```typescript
import { AgentConfigManager } from './settings/AgentConfigManager'
import { HookManager } from './settings/HookManager'
import { McpManager } from './settings/McpManager'
import { registerSettingsHandlers } from './ipc'
```

2. Instantiate and register (after existing manager instantiations):
```typescript
const agentConfigManager = new AgentConfigManager(db)
const hookManager = new HookManager(db)
const mcpManager = new McpManager(db)
registerSettingsHandlers(agentConfigManager, hookManager, mcpManager)
```

- [ ] **Step 5: Add settings binding to preload/index.ts**

In `src/preload/index.ts`, add a `settings` property to the `contextBridge.exposeInMainWorld` call:

```typescript
settings: {
  getGlobalAgentConfig: () =>
    ipcRenderer.invoke(SETTINGS_CHANNELS.AGENT_CONFIG_GET_GLOBAL),
  getWorkspaceAgentConfig: (workspaceId: string) =>
    ipcRenderer.invoke(SETTINGS_CHANNELS.AGENT_CONFIG_GET_WORKSPACE, workspaceId),
  upsertAgentConfig: (input: UpsertAgentConfigInput) =>
    ipcRenderer.invoke(SETTINGS_CHANNELS.AGENT_CONFIG_UPSERT, input),
  readClaudeConfig: (repoPath: string) =>
    ipcRenderer.invoke(SETTINGS_CHANNELS.AGENT_CONFIG_READ_CLAUDE, repoPath),
  writeClaudeConfig: (repoPath: string, xaideContent: string) =>
    ipcRenderer.invoke(SETTINGS_CHANNELS.AGENT_CONFIG_WRITE_CLAUDE, repoPath, xaideContent),
  readCopilotConfig: (repoPath: string) =>
    ipcRenderer.invoke(SETTINGS_CHANNELS.AGENT_CONFIG_READ_COPILOT, repoPath),
  writeCopilotConfig: (repoPath: string, xaideContent: string) =>
    ipcRenderer.invoke(SETTINGS_CHANNELS.AGENT_CONFIG_WRITE_COPILOT, repoPath, xaideContent),
  listHooks: (workspaceId?: string) =>
    ipcRenderer.invoke(SETTINGS_CHANNELS.HOOKS_LIST, workspaceId),
  createHook: (input: CreateHookInput) =>
    ipcRenderer.invoke(SETTINGS_CHANNELS.HOOKS_CREATE, input),
  updateHook: (id: string, input: UpdateHookInput) =>
    ipcRenderer.invoke(SETTINGS_CHANNELS.HOOKS_UPDATE, id, input),
  deleteHook: (id: string) =>
    ipcRenderer.invoke(SETTINGS_CHANNELS.HOOKS_DELETE, id),
  listMcpServers: (workspaceId?: string) =>
    ipcRenderer.invoke(SETTINGS_CHANNELS.MCP_LIST, workspaceId),
  createMcpServer: (input: CreateMcpServerInput) =>
    ipcRenderer.invoke(SETTINGS_CHANNELS.MCP_CREATE, input),
  updateMcpServer: (id: string, input: UpdateMcpServerInput) =>
    ipcRenderer.invoke(SETTINGS_CHANNELS.MCP_UPDATE, id, input),
  deleteMcpServer: (id: string) =>
    ipcRenderer.invoke(SETTINGS_CHANNELS.MCP_DELETE, id),
  writeMcpConfigClaude: (repoPath: string, workspaceId: string) =>
    ipcRenderer.invoke(SETTINGS_CHANNELS.MCP_WRITE_CLAUDE, repoPath, workspaceId),
  writeMcpConfigCopilot: (repoPath: string, workspaceId: string) =>
    ipcRenderer.invoke(SETTINGS_CHANNELS.MCP_WRITE_COPILOT, repoPath, workspaceId),
} satisfies SettingsAPI,
```

Add the needed imports to `preload/index.ts`:
```typescript
import {
  SETTINGS_CHANNELS,
  type UpsertAgentConfigInput,
  type CreateHookInput,
  type UpdateHookInput,
  type CreateMcpServerInput,
  type UpdateMcpServerInput,
  type SettingsAPI,
} from './ipc-types'
```

- [ ] **Step 6: Add settings mock to tests/renderer/setup.ts**

In `tests/renderer/setup.ts`, add `settings` to `mockXaideApi`:

```typescript
settings: {
  getGlobalAgentConfig: vi.fn().mockResolvedValue(null),
  getWorkspaceAgentConfig: vi.fn().mockResolvedValue(null),
  upsertAgentConfig: vi.fn().mockResolvedValue({
    id: 'cfg-1', scope: 'global', workspaceId: null, agentType: 'all',
    systemPromptAdditions: '', configJson: '{}', createdAt: '', updatedAt: '',
  }),
  readClaudeConfig: vi.fn().mockResolvedValue({ external: '', xaideManaged: '' }),
  writeClaudeConfig: vi.fn().mockResolvedValue(undefined),
  readCopilotConfig: vi.fn().mockResolvedValue({ external: '', xaideManaged: '' }),
  writeCopilotConfig: vi.fn().mockResolvedValue(undefined),
  listHooks: vi.fn().mockResolvedValue([]),
  createHook: vi.fn().mockResolvedValue({
    id: 'hook-1', scope: 'global', workspaceId: null,
    event: 'agent.start', command: 'echo start', enabled: true, createdAt: '',
  }),
  updateHook: vi.fn().mockResolvedValue({
    id: 'hook-1', scope: 'global', workspaceId: null,
    event: 'agent.start', command: 'echo start', enabled: true, createdAt: '',
  }),
  deleteHook: vi.fn().mockResolvedValue(undefined),
  listMcpServers: vi.fn().mockResolvedValue([]),
  createMcpServer: vi.fn().mockResolvedValue({
    id: 'mcp-1', name: 'my-mcp', scope: 'global', configJson: '{}', enabled: true, createdAt: '',
  }),
  updateMcpServer: vi.fn().mockResolvedValue({
    id: 'mcp-1', name: 'my-mcp', scope: 'global', configJson: '{}', enabled: true, createdAt: '',
  }),
  deleteMcpServer: vi.fn().mockResolvedValue(undefined),
  writeMcpConfigClaude: vi.fn().mockResolvedValue(undefined),
  writeMcpConfigCopilot: vi.fn().mockResolvedValue(undefined),
},
```

Also update the import at top of `setup.ts` to include the new types:
```typescript
import type { Workspace, WorktreeRecord, XaideAPI, AgentAPI } from '../../src/preload/ipc-types'
```
→ Add `SettingsAPI` to the import if needed (TypeScript will enforce the type via `mockXaideApi: XaideAPI`).

- [ ] **Step 7: Run renderer tests to verify no regressions**

```bash
export PATH="/Users/jeff.williams/.vfox/cache/nodejs/v-22.22.2/nodejs-22.22.2/bin:$PATH"
cd /Users/jeff.williams/Developer/personal/xaide
npm run test:renderer
```

All existing tests should still pass.

- [ ] **Step 8: Commit**

```bash
cd /Users/jeff.williams/Developer/personal/xaide
git add src/main/ipc/settings.ipc.ts \
        src/main/ipc/index.ts \
        src/main/index.ts \
        src/preload/ipc-types.ts \
        src/preload/index.ts \
        tests/renderer/setup.ts
git commit -m "feat: add settings IPC bridge for agent config, hooks, MCP servers

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 3: Settings view shell

**Files:**
- Create: `src/renderer/src/components/SettingsView.tsx`
- Create: `src/renderer/src/components/SettingsNav.tsx`
- Modify: `src/renderer/src/App.tsx`
- Create: `tests/renderer/SettingsView.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `tests/renderer/SettingsView.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SettingsView } from '../../src/renderer/src/components/SettingsView'

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

describe('SettingsView', () => {
  it('renders Agent Config section by default', () => {
    render(<SettingsView />, { wrapper: Wrapper })
    expect(screen.getByText('Agent Configuration')).toBeInTheDocument()
  })

  it('renders settings navigation with three items', () => {
    render(<SettingsView />, { wrapper: Wrapper })
    expect(screen.getByRole('navigation', { name: 'Settings navigation' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Agent Config' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Hooks' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'MCP Servers' })).toBeInTheDocument()
  })

  it('switches to Hooks section when nav item clicked', async () => {
    const user = userEvent.setup()
    render(<SettingsView />, { wrapper: Wrapper })
    await user.click(screen.getByRole('button', { name: 'Hooks' }))
    expect(screen.getByText('Hooks')).toBeInTheDocument()
    expect(screen.queryByText('Agent Configuration')).not.toBeInTheDocument()
  })

  it('switches to MCP Servers section when nav item clicked', async () => {
    const user = userEvent.setup()
    render(<SettingsView />, { wrapper: Wrapper })
    await user.click(screen.getByRole('button', { name: 'MCP Servers' }))
    expect(screen.getByText('MCP Servers')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
export PATH="/Users/jeff.williams/.vfox/cache/nodejs/v-22.22.2/nodejs-22.22.2/bin:$PATH"
cd /Users/jeff.williams/Developer/personal/xaide
npx vitest run --config vitest.renderer.config.ts tests/renderer/SettingsView.test.tsx
```

Expected: FAIL — `Cannot find module '../../src/renderer/src/components/SettingsView'`

- [ ] **Step 3: Implement SettingsNav**

Create `src/renderer/src/components/SettingsNav.tsx`:

```typescript
import type { FC } from 'react'

export type SettingsSection = 'agent-config' | 'hooks' | 'mcp-servers'

interface Props {
  activeSection: SettingsSection
  onSelect: (s: SettingsSection) => void
}

const NAV_ITEMS: { id: SettingsSection; label: string }[] = [
  { id: 'agent-config', label: 'Agent Config' },
  { id: 'hooks', label: 'Hooks' },
  { id: 'mcp-servers', label: 'MCP Servers' },
]

export const SettingsNav: FC<Props> = ({ activeSection, onSelect }) => (
  <nav
    aria-label="Settings navigation"
    className="w-44 shrink-0 border-r border-neutral-800 bg-neutral-900 pt-4"
  >
    <p className="px-3 pb-2 text-xs font-semibold text-neutral-500 uppercase tracking-wider select-none">
      Settings
    </p>
    <ul>
      {NAV_ITEMS.map((item) => (
        <li key={item.id}>
          <button
            type="button"
            aria-current={activeSection === item.id ? 'page' : undefined}
            className={[
              'w-full text-left px-3 py-1.5 text-sm',
              activeSection === item.id
                ? 'bg-neutral-700 text-white'
                : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800',
            ].join(' ')}
            onClick={() => onSelect(item.id)}
          >
            {item.label}
          </button>
        </li>
      ))}
    </ul>
  </nav>
)
```

- [ ] **Step 4: Implement SettingsView**

Create `src/renderer/src/components/SettingsView.tsx`:

```typescript
import { useState } from 'react'
import type { FC } from 'react'
import { SettingsNav } from './SettingsNav'
import type { SettingsSection } from './SettingsNav'
import { AgentConfigSection } from './AgentConfigSection'
import { HooksSection } from './HooksSection'
import { McpServersSection } from './McpServersSection'
import { useUiStore } from '../store/uiStore'

export const SettingsView: FC = () => {
  const [activeSection, setActiveSection] = useState<SettingsSection>('agent-config')
  const activeWorkspaceId = useUiStore((s) => s.activeWorkspaceId)

  return (
    <main className="flex-1 min-w-0 bg-neutral-950 flex overflow-hidden">
      <SettingsNav activeSection={activeSection} onSelect={setActiveSection} />
      <div className="flex-1 overflow-y-auto p-6">
        {activeSection === 'agent-config' && (
          <AgentConfigSection workspaceId={activeWorkspaceId} />
        )}
        {activeSection === 'hooks' && <HooksSection workspaceId={activeWorkspaceId} />}
        {activeSection === 'mcp-servers' && (
          <McpServersSection workspaceId={activeWorkspaceId} />
        )}
      </div>
    </main>
  )
}
```

Note: `AgentConfigSection`, `HooksSection`, and `McpServersSection` are stub-created here (Tasks 4–6). For now create minimal stubs so `SettingsView` compiles:

`src/renderer/src/components/AgentConfigSection.tsx` (stub — will be replaced in Task 4):
```typescript
import type { FC } from 'react'
export const AgentConfigSection: FC<{ workspaceId: string | null }> = () => (
  <div><h1 className="text-lg font-semibold text-neutral-100">Agent Configuration</h1></div>
)
```

`src/renderer/src/components/HooksSection.tsx` (stub — will be replaced in Task 5):
```typescript
import type { FC } from 'react'
export const HooksSection: FC<{ workspaceId: string | null }> = () => (
  <div><h1 className="text-lg font-semibold text-neutral-100">Hooks</h1></div>
)
```

`src/renderer/src/components/McpServersSection.tsx` (stub — will be replaced in Task 6):
```typescript
import type { FC } from 'react'
export const McpServersSection: FC<{ workspaceId: string | null }> = () => (
  <div><h1 className="text-lg font-semibold text-neutral-100">MCP Servers</h1></div>
)
```

- [ ] **Step 5: Update App.tsx**

In `src/renderer/src/App.tsx`, add the `SettingsView` import and update the render:

```typescript
import { SettingsView } from './components/SettingsView'
```

Change:
```typescript
{activePanel === 'agents' && <LeftPanel />}
<MainArea />
```

To:
```typescript
{activePanel === 'agents' && <LeftPanel />}
{activePanel === 'settings' ? <SettingsView /> : <MainArea />}
```

- [ ] **Step 6: Run SettingsView tests**

```bash
export PATH="/Users/jeff.williams/.vfox/cache/nodejs/v-22.22.2/nodejs-22.22.2/bin:$PATH"
cd /Users/jeff.williams/Developer/personal/xaide
npx vitest run --config vitest.renderer.config.ts tests/renderer/SettingsView.test.tsx
```

Expected: `4 tests passed`

- [ ] **Step 7: Run full renderer suite**

```bash
export PATH="/Users/jeff.williams/.vfox/cache/nodejs/v-22.22.2/nodejs-22.22.2/bin:$PATH"
cd /Users/jeff.williams/Developer/personal/xaide
npm run test:renderer
```

- [ ] **Step 8: Commit**

```bash
cd /Users/jeff.williams/Developer/personal/xaide
git add src/renderer/src/components/SettingsView.tsx \
        src/renderer/src/components/SettingsNav.tsx \
        src/renderer/src/components/AgentConfigSection.tsx \
        src/renderer/src/components/HooksSection.tsx \
        src/renderer/src/components/McpServersSection.tsx \
        src/renderer/src/App.tsx \
        tests/renderer/SettingsView.test.tsx
git commit -m "feat: add SettingsView shell with nav and section routing

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 4: Agent Config section

**Files:**
- Create: `src/renderer/src/hooks/useAgentConfig.ts`
- Modify: `src/renderer/src/components/AgentConfigSection.tsx` (replace stub)

- [ ] **Step 1: Implement useAgentConfig hook**

Create `src/renderer/src/hooks/useAgentConfig.ts`:

```typescript
import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useWorkspaces } from './useWorkspaces'
import type { UpsertAgentConfigInput } from '../../../preload/ipc-types'

export function useAgentConfig(workspaceId: string | null) {
  const qc = useQueryClient()
  const { data: workspaces = [] } = useWorkspaces()
  const workspace = workspaces.find((w) => w.id === workspaceId)

  const globalConfig = useQuery({
    queryKey: ['agent-config', 'global'],
    queryFn: () => window.xaide.settings.getGlobalAgentConfig(),
  })

  const workspaceConfig = useQuery({
    queryKey: ['agent-config', 'workspace', workspaceId],
    queryFn: () => window.xaide.settings.getWorkspaceAgentConfig(workspaceId!),
    enabled: !!workspaceId,
  })

  const claudeContent = useQuery({
    queryKey: ['claude-config', workspace?.repoPath],
    queryFn: () => window.xaide.settings.readClaudeConfig(workspace!.repoPath),
    enabled: !!workspace,
  })

  const copilotContent = useQuery({
    queryKey: ['copilot-config', workspace?.repoPath],
    queryFn: () => window.xaide.settings.readCopilotConfig(workspace!.repoPath),
    enabled: !!workspace,
  })

  const upsertMutation = useMutation({
    mutationFn: (input: UpsertAgentConfigInput) =>
      window.xaide.settings.upsertAgentConfig(input),
    onSuccess: (data) => {
      qc.invalidateQueries({
        queryKey: ['agent-config', data.scope === 'global' ? 'global' : 'workspace'],
      })
    },
  })

  return {
    globalConfig: globalConfig.data ?? null,
    workspaceConfig: workspaceConfig.data ?? null,
    claudeContent: claudeContent.data ?? null,
    copilotContent: copilotContent.data ?? null,
    upsertGlobal: (systemPromptAdditions: string) =>
      upsertMutation.mutateAsync({ scope: 'global', systemPromptAdditions }),
    upsertWorkspace: (systemPromptAdditions: string) =>
      upsertMutation.mutateAsync({
        scope: 'workspace',
        workspaceId: workspaceId!,
        systemPromptAdditions,
      }),
    saveToFiles: async (repoPath: string, content: string) => {
      await window.xaide.settings.writeClaudeConfig(repoPath, content)
      await window.xaide.settings.writeCopilotConfig(repoPath, content)
      qc.invalidateQueries({ queryKey: ['claude-config', repoPath] })
      qc.invalidateQueries({ queryKey: ['copilot-config', repoPath] })
    },
    isSaving: upsertMutation.isPending,
    workspace,
  }
}
```

- [ ] **Step 2: Implement AgentConfigSection**

Replace `src/renderer/src/components/AgentConfigSection.tsx`:

```typescript
import { useState, useEffect } from 'react'
import type { FC } from 'react'
import { useAgentConfig } from '../hooks/useAgentConfig'

interface Props {
  workspaceId: string | null
}

export const AgentConfigSection: FC<Props> = ({ workspaceId }) => {
  const { globalConfig, workspaceConfig, claudeContent, copilotContent, upsertGlobal, upsertWorkspace, saveToFiles, isSaving, workspace } =
    useAgentConfig(workspaceId)

  const [globalPrompt, setGlobalPrompt] = useState('')
  const [wsPrompt, setWsPrompt] = useState('')

  useEffect(() => {
    if (globalConfig) setGlobalPrompt(globalConfig.systemPromptAdditions)
  }, [globalConfig])

  useEffect(() => {
    if (workspaceConfig) setWsPrompt(workspaceConfig.systemPromptAdditions)
  }, [workspaceConfig])

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-lg font-semibold text-neutral-100 mb-1">Agent Configuration</h1>
        <p className="text-sm text-neutral-400">
          System prompt additions applied to every agent session. Workspace settings are appended on
          top of global settings.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-neutral-300">Global System Prompt Additions</h2>
        <textarea
          aria-label="Global system prompt additions"
          className="w-full h-32 bg-neutral-900 border border-neutral-700 rounded px-3 py-2 text-sm text-neutral-200 resize-y outline-none focus:border-neutral-500"
          value={globalPrompt}
          onChange={(e) => setGlobalPrompt(e.target.value)}
          placeholder="Instructions applied to every agent session…"
        />
        <button
          type="button"
          disabled={isSaving}
          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm rounded"
          onClick={() => upsertGlobal(globalPrompt)}
        >
          Save Global
        </button>
      </section>

      {workspaceId && workspace && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-neutral-300">
            Workspace Overrides — {workspace.name}
          </h2>
          <textarea
            aria-label="Workspace system prompt additions"
            className="w-full h-32 bg-neutral-900 border border-neutral-700 rounded px-3 py-2 text-sm text-neutral-200 resize-y outline-none focus:border-neutral-500"
            value={wsPrompt}
            onChange={(e) => setWsPrompt(e.target.value)}
            placeholder="Instructions specific to this workspace…"
          />
          <div className="flex gap-2 flex-wrap">
            <button
              type="button"
              disabled={isSaving}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm rounded"
              onClick={() => upsertWorkspace(wsPrompt)}
            >
              Save Workspace
            </button>
            <button
              type="button"
              disabled={isSaving}
              className="px-3 py-1.5 bg-neutral-700 hover:bg-neutral-600 disabled:opacity-50 text-white text-sm rounded"
              onClick={() => saveToFiles(workspace.repoPath, wsPrompt)}
            >
              Write CLAUDE.md + Copilot config
            </button>
          </div>
          {claudeContent && (
            <p className="text-xs text-neutral-500">
              CLAUDE.md xaide section:{' '}
              {claudeContent.xaideManaged ? claudeContent.xaideManaged.slice(0, 80) + '…' : '(empty)'}
            </p>
          )}
          {copilotContent && (
            <p className="text-xs text-neutral-500">
              Copilot config xaide section:{' '}
              {copilotContent.xaideManaged
                ? copilotContent.xaideManaged.slice(0, 80) + '…'
                : '(empty)'}
            </p>
          )}
        </section>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Run renderer tests**

```bash
export PATH="/Users/jeff.williams/.vfox/cache/nodejs/v-22.22.2/nodejs-22.22.2/bin:$PATH"
cd /Users/jeff.williams/Developer/personal/xaide
npm run test:renderer
```

All tests should pass (SettingsView tests still pass since AgentConfigSection renders the same heading text).

- [ ] **Step 4: Commit**

```bash
cd /Users/jeff.williams/Developer/personal/xaide
git add src/renderer/src/hooks/useAgentConfig.ts \
        src/renderer/src/components/AgentConfigSection.tsx
git commit -m "feat: add AgentConfigSection with global/workspace system-prompt editor

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 5: Hooks section

**Files:**
- Create: `src/renderer/src/hooks/useHooks.ts`
- Modify: `src/renderer/src/components/HooksSection.tsx` (replace stub)
- Create: `tests/renderer/HooksSection.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `tests/renderer/HooksSection.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { HooksSection } from '../../src/renderer/src/components/HooksSection'

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

const mockHook = {
  id: 'hook-1',
  scope: 'global' as const,
  workspaceId: null,
  event: 'agent.start' as const,
  command: 'echo hello',
  enabled: true,
  createdAt: '',
}

describe('HooksSection', () => {
  beforeEach(() => {
    vi.mocked(window.xaide.settings.listHooks).mockResolvedValue([])
    vi.mocked(window.xaide.settings.createHook).mockResolvedValue(mockHook)
    vi.mocked(window.xaide.settings.deleteHook).mockResolvedValue(undefined)
  })

  it('shows empty state when no hooks exist', async () => {
    render(<HooksSection workspaceId={null} />, { wrapper: Wrapper })
    expect(await screen.findByText(/no hooks configured/i)).toBeInTheDocument()
  })

  it('shows hook list when hooks are present', async () => {
    vi.mocked(window.xaide.settings.listHooks).mockResolvedValue([mockHook])
    render(<HooksSection workspaceId={null} />, { wrapper: Wrapper })
    expect(await screen.findByText('echo hello')).toBeInTheDocument()
  })

  it('shows add form when "Add Hook" is clicked', async () => {
    const user = userEvent.setup()
    render(<HooksSection workspaceId={null} />, { wrapper: Wrapper })
    await user.click(await screen.findByRole('button', { name: /add hook/i }))
    expect(screen.getByRole('textbox', { name: /command/i })).toBeInTheDocument()
  })

  it('calls createHook when form is submitted', async () => {
    const user = userEvent.setup()
    render(<HooksSection workspaceId={null} />, { wrapper: Wrapper })
    await user.click(await screen.findByRole('button', { name: /add hook/i }))
    await user.type(screen.getByRole('textbox', { name: /command/i }), 'make lint')
    await user.click(screen.getByRole('button', { name: /save hook/i }))
    expect(window.xaide.settings.createHook).toHaveBeenCalledWith(
      expect.objectContaining({ command: 'make lint' }),
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
export PATH="/Users/jeff.williams/.vfox/cache/nodejs/v-22.22.2/nodejs-22.22.2/bin:$PATH"
cd /Users/jeff.williams/Developer/personal/xaide
npx vitest run --config vitest.renderer.config.ts tests/renderer/HooksSection.test.tsx
```

Expected: FAIL — stub renders heading "Hooks", not the full component.

- [ ] **Step 3: Implement useHooks**

Create `src/renderer/src/hooks/useHooks.ts`:

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { CreateHookInput, UpdateHookInput } from '../../../preload/ipc-types'

export function useHooks(workspaceId: string | null) {
  const qc = useQueryClient()
  const key = ['hooks', workspaceId]

  const hooks = useQuery({
    queryKey: key,
    queryFn: () => window.xaide.settings.listHooks(workspaceId ?? undefined),
  })

  const createHook = useMutation({
    mutationFn: (input: CreateHookInput) => window.xaide.settings.createHook(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  })

  const updateHook = useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateHookInput }) =>
      window.xaide.settings.updateHook(id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  })

  const deleteHook = useMutation({
    mutationFn: (id: string) => window.xaide.settings.deleteHook(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  })

  return {
    hooks: hooks.data ?? [],
    isLoading: hooks.isLoading,
    createHook,
    updateHook,
    deleteHook,
  }
}
```

- [ ] **Step 4: Implement HooksSection**

Replace `src/renderer/src/components/HooksSection.tsx`:

```typescript
import { useState } from 'react'
import type { FC } from 'react'
import { useHooks } from '../hooks/useHooks'

const HOOK_EVENTS = ['agent.start', 'agent.stop', 'agent.commit', 'agent.error'] as const
type HookEvent = typeof HOOK_EVENTS[number]

interface Props {
  workspaceId: string | null
}

export const HooksSection: FC<Props> = ({ workspaceId }) => {
  const { hooks, createHook, updateHook, deleteHook } = useHooks(workspaceId)
  const [showForm, setShowForm] = useState(false)
  const [newEvent, setNewEvent] = useState<HookEvent>('agent.start')
  const [newCommand, setNewCommand] = useState('')

  const handleCreate = async () => {
    const command = newCommand.trim()
    if (!command) return
    await createHook.mutateAsync({
      scope: workspaceId ? 'workspace' : 'global',
      workspaceId: workspaceId ?? undefined,
      event: newEvent,
      command,
    })
    setNewCommand('')
    setShowForm(false)
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-neutral-100">Hooks</h1>
          <p className="text-sm text-neutral-400 mt-0.5">
            Shell commands that run automatically on agent lifecycle events.
          </p>
        </div>
        <button
          type="button"
          aria-label="Add hook"
          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded"
          onClick={() => setShowForm(true)}
        >
          + Add Hook
        </button>
      </div>

      {showForm && (
        <div className="border border-neutral-700 rounded p-4 space-y-3 bg-neutral-900">
          <div className="flex gap-3">
            <div className="space-y-1">
              <label className="text-xs text-neutral-400">Event</label>
              <select
                value={newEvent}
                onChange={(e) => setNewEvent(e.target.value as HookEvent)}
                className="bg-neutral-800 border border-neutral-600 text-neutral-200 text-xs rounded px-2 py-1 outline-none"
              >
                {HOOK_EVENTS.map((e) => (
                  <option key={e} value={e}>{e}</option>
                ))}
              </select>
            </div>
            <div className="flex-1 space-y-1">
              <label className="text-xs text-neutral-400" htmlFor="hook-command">Command</label>
              <input
                id="hook-command"
                type="text"
                aria-label="Command"
                value={newCommand}
                onChange={(e) => setNewCommand(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                placeholder="make lint"
                className="w-full bg-neutral-800 border border-neutral-600 text-neutral-200 text-sm rounded px-2 py-1 outline-none"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              aria-label="Save hook"
              className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded"
              onClick={handleCreate}
            >
              Save Hook
            </button>
            <button
              type="button"
              className="px-3 py-1 bg-neutral-700 hover:bg-neutral-600 text-neutral-200 text-sm rounded"
              onClick={() => { setShowForm(false); setNewCommand('') }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {hooks.length === 0 ? (
        <p className="text-sm text-neutral-500">No hooks configured yet.</p>
      ) : (
        <ul className="space-y-2">
          {hooks.map((hook) => (
            <li
              key={hook.id}
              className="flex items-center gap-3 border border-neutral-800 rounded px-3 py-2 bg-neutral-900"
            >
              <span className="text-xs bg-neutral-700 text-neutral-300 rounded px-1.5 py-0.5 shrink-0">
                {hook.event}
              </span>
              <code className="flex-1 text-xs text-neutral-200 truncate">{hook.command}</code>
              <button
                type="button"
                aria-label={`Toggle hook ${hook.command}`}
                className={`text-xs px-1.5 py-0.5 rounded ${hook.enabled ? 'text-green-400' : 'text-neutral-500'}`}
                onClick={() => updateHook.mutate({ id: hook.id, input: { enabled: !hook.enabled } })}
              >
                {hook.enabled ? 'on' : 'off'}
              </button>
              <button
                type="button"
                aria-label={`Delete hook ${hook.command}`}
                className="text-neutral-500 hover:text-red-400 text-sm"
                onClick={() => deleteHook.mutate(hook.id)}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
```

- [ ] **Step 5: Run HooksSection tests**

```bash
export PATH="/Users/jeff.williams/.vfox/cache/nodejs/v-22.22.2/nodejs-22.22.2/bin:$PATH"
cd /Users/jeff.williams/Developer/personal/xaide
npx vitest run --config vitest.renderer.config.ts tests/renderer/HooksSection.test.tsx
```

Expected: `4 tests passed`

- [ ] **Step 6: Run full renderer suite**

```bash
export PATH="/Users/jeff.williams/.vfox/cache/nodejs/v-22.22.2/nodejs-22.22.2/bin:$PATH"
cd /Users/jeff.williams/Developer/personal/xaide
npm run test:renderer
```

- [ ] **Step 7: Commit**

```bash
cd /Users/jeff.williams/Developer/personal/xaide
git add src/renderer/src/hooks/useHooks.ts \
        src/renderer/src/components/HooksSection.tsx \
        tests/renderer/HooksSection.test.tsx
git commit -m "feat: add HooksSection with event-scoped hook CRUD

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 6: MCP Servers section

**Files:**
- Create: `src/renderer/src/hooks/useMcpServers.ts`
- Modify: `src/renderer/src/components/McpServersSection.tsx` (replace stub)
- Create: `tests/renderer/McpServersSection.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `tests/renderer/McpServersSection.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { McpServersSection } from '../../src/renderer/src/components/McpServersSection'

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

const mockServer = {
  id: 'mcp-1',
  name: 'my-tool',
  scope: 'global' as const,
  configJson: JSON.stringify({ command: 'npx', args: ['my-tool'] }),
  enabled: true,
  createdAt: '',
}

describe('McpServersSection', () => {
  beforeEach(() => {
    vi.mocked(window.xaide.settings.listMcpServers).mockResolvedValue([])
    vi.mocked(window.xaide.settings.createMcpServer).mockResolvedValue(mockServer)
    vi.mocked(window.xaide.settings.deleteMcpServer).mockResolvedValue(undefined)
    vi.mocked(window.xaide.settings.writeMcpConfigClaude).mockResolvedValue(undefined)
    vi.mocked(window.xaide.settings.writeMcpConfigCopilot).mockResolvedValue(undefined)
  })

  it('shows empty state when no servers exist', async () => {
    render(<McpServersSection workspaceId={null} />, { wrapper: Wrapper })
    expect(await screen.findByText(/no mcp servers/i)).toBeInTheDocument()
  })

  it('shows server list when servers are present', async () => {
    vi.mocked(window.xaide.settings.listMcpServers).mockResolvedValue([mockServer])
    render(<McpServersSection workspaceId={null} />, { wrapper: Wrapper })
    expect(await screen.findByText('my-tool')).toBeInTheDocument()
  })

  it('shows add form when "Add Server" is clicked', async () => {
    const user = userEvent.setup()
    render(<McpServersSection workspaceId={null} />, { wrapper: Wrapper })
    await user.click(await screen.findByRole('button', { name: /add server/i }))
    expect(screen.getByRole('textbox', { name: /server name/i })).toBeInTheDocument()
  })

  it('calls createMcpServer when form is submitted', async () => {
    const user = userEvent.setup()
    render(<McpServersSection workspaceId={null} />, { wrapper: Wrapper })
    await user.click(await screen.findByRole('button', { name: /add server/i }))
    await user.type(screen.getByRole('textbox', { name: /server name/i }), 'my-server')
    await user.type(screen.getByRole('textbox', { name: /command/i }), 'npx my-server')
    await user.click(screen.getByRole('button', { name: /save server/i }))
    expect(window.xaide.settings.createMcpServer).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'my-server' }),
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
export PATH="/Users/jeff.williams/.vfox/cache/nodejs/v-22.22.2/nodejs-22.22.2/bin:$PATH"
cd /Users/jeff.williams/Developer/personal/xaide
npx vitest run --config vitest.renderer.config.ts tests/renderer/McpServersSection.test.tsx
```

Expected: FAIL — stub renders heading only.

- [ ] **Step 3: Implement useMcpServers**

Create `src/renderer/src/hooks/useMcpServers.ts`:

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { CreateMcpServerInput, UpdateMcpServerInput } from '../../../preload/ipc-types'

export function useMcpServers(workspaceId: string | null) {
  const qc = useQueryClient()
  const key = ['mcp-servers', workspaceId]

  const servers = useQuery({
    queryKey: key,
    queryFn: () => window.xaide.settings.listMcpServers(workspaceId ?? undefined),
  })

  const createServer = useMutation({
    mutationFn: (input: CreateMcpServerInput) => window.xaide.settings.createMcpServer(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  })

  const updateServer = useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateMcpServerInput }) =>
      window.xaide.settings.updateMcpServer(id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  })

  const deleteServer = useMutation({
    mutationFn: (id: string) => window.xaide.settings.deleteMcpServer(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  })

  const writeConfigs = async (repoPath: string) => {
    if (!workspaceId) return
    await window.xaide.settings.writeMcpConfigClaude(repoPath, workspaceId)
    await window.xaide.settings.writeMcpConfigCopilot(repoPath, workspaceId)
  }

  return {
    servers: servers.data ?? [],
    isLoading: servers.isLoading,
    createServer,
    updateServer,
    deleteServer,
    writeConfigs,
  }
}
```

- [ ] **Step 4: Implement McpServersSection**

Replace `src/renderer/src/components/McpServersSection.tsx`:

```typescript
import { useState } from 'react'
import type { FC } from 'react'
import { useMcpServers } from '../hooks/useMcpServers'
import { useWorkspaces } from '../hooks/useWorkspaces'

interface Props {
  workspaceId: string | null
}

export const McpServersSection: FC<Props> = ({ workspaceId }) => {
  const { servers, createServer, updateServer, deleteServer, writeConfigs } =
    useMcpServers(workspaceId)
  const { data: workspaces = [] } = useWorkspaces()
  const workspace = workspaces.find((w) => w.id === workspaceId)

  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [serverType, setServerType] = useState<'stdio' | 'sse'>('stdio')
  const [command, setCommand] = useState('')
  const [url, setUrl] = useState('')
  const [args, setArgs] = useState('')

  const handleCreate = async () => {
    if (!name.trim()) return
    await createServer.mutateAsync({
      name: name.trim(),
      scope: workspaceId ? 'workspace' : 'global',
      config:
        serverType === 'sse'
          ? { url: url.trim(), workspaceId: workspaceId ?? undefined }
          : {
              command: command.trim(),
              args: args.trim() ? args.trim().split(' ') : [],
              workspaceId: workspaceId ?? undefined,
            },
    })
    setName('')
    setCommand('')
    setUrl('')
    setArgs('')
    setShowForm(false)
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-neutral-100">MCP Servers</h1>
          <p className="text-sm text-neutral-400 mt-0.5">
            Model Context Protocol servers available to agents.
          </p>
        </div>
        <div className="flex gap-2">
          {workspaceId && workspace && (
            <button
              type="button"
              aria-label="Write MCP config files"
              className="px-3 py-1.5 bg-neutral-700 hover:bg-neutral-600 text-white text-sm rounded"
              onClick={() => writeConfigs(workspace.repoPath)}
            >
              Write config files
            </button>
          )}
          <button
            type="button"
            aria-label="Add server"
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded"
            onClick={() => setShowForm(true)}
          >
            + Add Server
          </button>
        </div>
      </div>

      {showForm && (
        <div className="border border-neutral-700 rounded p-4 space-y-3 bg-neutral-900">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-neutral-400" htmlFor="mcp-name">Server Name</label>
              <input
                id="mcp-name"
                type="text"
                aria-label="Server name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="my-mcp-server"
                className="w-full bg-neutral-800 border border-neutral-600 text-neutral-200 text-sm rounded px-2 py-1 outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-neutral-400">Type</label>
              <select
                value={serverType}
                onChange={(e) => setServerType(e.target.value as 'stdio' | 'sse')}
                className="w-full bg-neutral-800 border border-neutral-600 text-neutral-200 text-xs rounded px-2 py-1 outline-none"
              >
                <option value="stdio">stdio</option>
                <option value="sse">SSE</option>
              </select>
            </div>
          </div>
          {serverType === 'stdio' ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-neutral-400" htmlFor="mcp-command">Command</label>
                <input
                  id="mcp-command"
                  type="text"
                  aria-label="Command"
                  value={command}
                  onChange={(e) => setCommand(e.target.value)}
                  placeholder="npx"
                  className="w-full bg-neutral-800 border border-neutral-600 text-neutral-200 text-sm rounded px-2 py-1 outline-none"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-neutral-400">Args (space-separated)</label>
                <input
                  type="text"
                  value={args}
                  onChange={(e) => setArgs(e.target.value)}
                  placeholder="my-server --port 3000"
                  className="w-full bg-neutral-800 border border-neutral-600 text-neutral-200 text-sm rounded px-2 py-1 outline-none"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-1">
              <label className="text-xs text-neutral-400">URL</label>
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="http://localhost:3000"
                className="w-full bg-neutral-800 border border-neutral-600 text-neutral-200 text-sm rounded px-2 py-1 outline-none"
              />
            </div>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              aria-label="Save server"
              className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded"
              onClick={handleCreate}
            >
              Save Server
            </button>
            <button
              type="button"
              className="px-3 py-1 bg-neutral-700 hover:bg-neutral-600 text-neutral-200 text-sm rounded"
              onClick={() => { setShowForm(false); setName(''); setCommand(''); setUrl('') }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {servers.length === 0 ? (
        <p className="text-sm text-neutral-500">No MCP servers configured yet.</p>
      ) : (
        <ul className="space-y-2">
          {servers.map((server) => {
            const cfg = JSON.parse(server.configJson) as { command?: string; url?: string; args?: string[] }
            return (
              <li
                key={server.id}
                className="flex items-center gap-3 border border-neutral-800 rounded px-3 py-2 bg-neutral-900"
              >
                <span className="font-medium text-sm text-neutral-200 truncate flex-1">
                  {server.name}
                </span>
                <span className="text-xs text-neutral-500 truncate max-w-[200px]">
                  {cfg.url ?? `${cfg.command} ${(cfg.args ?? []).join(' ')}`}
                </span>
                <button
                  type="button"
                  aria-label={`Toggle ${server.name}`}
                  className={`text-xs px-1.5 py-0.5 rounded ${server.enabled ? 'text-green-400' : 'text-neutral-500'}`}
                  onClick={() =>
                    updateServer.mutate({ id: server.id, input: { enabled: !server.enabled } })
                  }
                >
                  {server.enabled ? 'on' : 'off'}
                </button>
                <button
                  type="button"
                  aria-label={`Delete ${server.name}`}
                  className="text-neutral-500 hover:text-red-400 text-sm"
                  onClick={() => deleteServer.mutate(server.id)}
                >
                  ×
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
```

- [ ] **Step 5: Run McpServersSection tests**

```bash
export PATH="/Users/jeff.williams/.vfox/cache/nodejs/v-22.22.2/nodejs-22.22.2/bin:$PATH"
cd /Users/jeff.williams/Developer/personal/xaide
npx vitest run --config vitest.renderer.config.ts tests/renderer/McpServersSection.test.tsx
```

Expected: `4 tests passed`

- [ ] **Step 6: Run full test suites**

```bash
export PATH="/Users/jeff.williams/.vfox/cache/nodejs/v-22.22.2/nodejs-22.22.2/bin:$PATH"
cd /Users/jeff.williams/Developer/personal/xaide
npm test && npm run test:renderer
```

All tests should pass.

- [ ] **Step 7: Commit**

```bash
cd /Users/jeff.williams/Developer/personal/xaide
git add src/renderer/src/hooks/useMcpServers.ts \
        src/renderer/src/components/McpServersSection.tsx \
        tests/renderer/McpServersSection.test.tsx
git commit -m "feat: add McpServersSection with stdio/SSE server CRUD and config file export

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Self-Review

**Spec coverage check:**

| Requirement | Task |
|---|---|
| Global + per-workspace settings scope | Tasks 1, 4, 5, 6 |
| Agent config with system prompt additions | Task 4 (AgentConfigSection + useAgentConfig) |
| Read existing CLAUDE.md / .github/copilot-instructions.md | Task 1 (AgentConfigManager.readClaudeConfig/readCopilotConfig) |
| Write config files with marker preservation | Task 1 (writeClaudeConfig/writeCopilotConfig) |
| Hooks CRUD + fire on events | Task 1 (HookManager) + Task 5 (HooksSection) |
| MCP server CRUD | Task 1 (McpManager) + Task 6 (McpServersSection) |
| Write .mcp.json (Claude) and .vscode/mcp.json (Copilot) | Task 1 (McpManager) + Task 6 (write config files button) |
| Full-panel SettingsView replacing MainArea | Task 3 (SettingsView + App.tsx) |
| Three-section left nav | Task 3 (SettingsNav) |

**Placeholder scan:** No TBDs. All code blocks are complete. All file paths are exact.

**Type consistency check:**
- `AgentConfigRecord` in `ipc-types.ts` matches `agentConfigs.$inferSelect` shape — both use `systemPromptAdditions` (camelCase in Drizzle, snake_case in DB)
- `HookRecord.enabled` is `boolean` — Drizzle `mode: 'boolean'` handles the integer→boolean conversion
- `McpServerConfig` used in both `McpManager` internals and `McpServerConfigInput` in `ipc-types.ts` — both have optional `command`, `url`, `args`, `env`, `workspaceId`
- `useAgentConfig`, `useHooks`, `useMcpServers` all call `window.xaide.settings.*` which matches `SettingsAPI`
