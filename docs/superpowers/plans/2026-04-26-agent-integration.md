# Agent Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detect installed Claude and Copilot CLI agents, manage agent sessions (DB-tracked PTY processes), expose an IPC bridge, and surface a "Launch Agent" button in the UI tab bar.

**Architecture:** `AgentRegistry` probes `$PATH` for installed agents at startup. `AgentSessionManager` ties a DB `agent_sessions` record to a `PtyManager` PTY — the PTY spawns the agent CLI directly instead of a shell. The IPC bridge mirrors the workspace/worktree pattern. In the renderer, a compact `AgentLauncher` inline form sits in the `SessionTabBar`; launched sessions appear as named tabs.

**Tech Stack:** `node:child_process` (execSync for detection), `PtyManager` (existing), `better-sqlite3` + Drizzle ORM (existing), Electron IPC, React Query, Zustand, React/Tailwind.

---

## File Map

### New files
| Path | Responsibility |
|------|----------------|
| `src/main/agent/types.ts` | `DetectedAgent`, `AgentSessionRecord`, `CreateAgentSessionInput` types |
| `src/main/agent/AgentRegistry.ts` | Probes PATH for claude/copilot; returns `DetectedAgent[]` |
| `src/main/agent/AgentSessionManager.ts` | DB CRUD for `agent_sessions` + PTY lifecycle via `PtyManager` + fires `agent.started` hook |
| `src/main/ipc/agent.ipc.ts` | `registerAgentHandlers(registry, sessionManager)` |
| `src/renderer/src/hooks/useAgents.ts` | React Query hooks: `useDetectedAgents`, `useAgentSessions`, `useLaunchAgent`, `useKillAgentSession` |
| `src/renderer/src/components/AgentLauncher.tsx` | Inline form: pick agent + worktree → Launch |
| `tests/main/agent-registry.test.ts` | Unit tests for detection logic |
| `tests/main/agent-session-manager.test.ts` | Unit tests for DB CRUD + PTY coordination |
| `tests/main/agent.ipc.test.ts` | IPC handler tests |
| `tests/renderer/AgentLauncher.test.tsx` | Component tests |

### Modified files
| Path | Change |
|------|--------|
| `src/main/db/client.ts` | `task_id TEXT` (nullable); add `pty_session_id TEXT` to `agent_sessions` |
| `src/main/db/schema.ts` | Mirror schema changes in Drizzle definitions |
| `src/main/pty/PtyManager.ts` | Add optional `command?: string`, `args?: string[]` to `PtyCreateOptions`; use them when provided |
| `src/main/ipc/index.ts` | Export `registerAgentHandlers` |
| `src/main/index.ts` | Instantiate `AgentRegistry` + `AgentSessionManager`; register handlers |
| `src/preload/ipc-types.ts` | `AGENT_CHANNELS`, `DetectedAgent`, `AgentSessionRecord`, `CreateAgentSessionInput`, `AgentAPI`; extend `XaideAPI` |
| `src/preload/index.ts` | Wire `agent` API onto `contextBridge` |
| `src/renderer/src/store/uiStore.ts` | Add `agentSessions: AgentSessionUiRecord[]`, `addAgentSession`, `removeAgentSession` |
| `src/renderer/src/components/SessionTabBar.tsx` | Accept `agentSessions` + `onLaunchAgent` + `onKillAgentSession`; render agent tabs + Launch button |
| `src/renderer/src/components/MainArea.tsx` | Wire `AgentLauncher`, `agentSessions`, pass to `SessionTabBar` |
| `tests/renderer/setup.ts` | Add `agent` mock to `window.xaide` |

---

## Task 1: Schema migration + PtyManager command support

**Files:**
- Modify: `src/main/db/client.ts`
- Modify: `src/main/db/schema.ts`
- Modify: `src/main/pty/PtyManager.ts`
- Test: `tests/main/db.test.ts`

- [ ] **Step 1: Write the failing DB test**

In `tests/main/db.test.ts`, add after the existing `worktrees` assertion:

```typescript
it('agent_sessions has nullable task_id and pty_session_id column', () => {
  const row = db
    .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='agent_sessions'")
    .get() as { sql: string }
  expect(row.sql).not.toMatch(/task_id TEXT NOT NULL/)
  expect(row.sql).toMatch(/pty_session_id/)
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
export PATH="/Users/jeff.williams/.vfox/cache/nodejs/v-22.22.2/nodejs-22.22.2/bin:$PATH"
npm rebuild better-sqlite3 --silent && npm test -- --reporter=verbose 2>&1 | grep -A3 "agent_sessions"
```
Expected: FAIL — `task_id TEXT NOT NULL` present and `pty_session_id` missing.

- [ ] **Step 3: Update `src/main/db/client.ts`**

Replace the `agent_sessions` table block:

```sql
  CREATE TABLE IF NOT EXISTS agent_sessions (
    id TEXT PRIMARY KEY,
    task_id TEXT REFERENCES tasks(id) ON DELETE CASCADE,
    agent_id TEXT NOT NULL,
    branch TEXT NOT NULL,
    worktree_path TEXT NOT NULL,
    pty_session_id TEXT,
    container_id TEXT,
    status TEXT NOT NULL DEFAULT 'pending'
      CHECK(status IN ('pending','running','idle','finished','failed')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
```

> **Note:** The DB file at `~/Library/Application Support/xaide/xaide.db` was created with the old schema and won't auto-migrate (SQLite `CREATE TABLE IF NOT EXISTS` is a no-op when the table exists). Run the ALTER commands below once — they're idempotent for dev:
>
> ```bash
> sqlite3 ~/Library/Application\ Support/xaide/xaide.db \
>   "ALTER TABLE agent_sessions DROP COLUMN task_id;" \
>   2>/dev/null; \
> sqlite3 ~/Library/Application\ Support/xaide/xaide.db \
>   "ALTER TABLE agent_sessions ADD COLUMN task_id TEXT REFERENCES tasks(id) ON DELETE CASCADE;" \
>   2>/dev/null; \
> sqlite3 ~/Library/Application\ Support/xaide/xaide.db \
>   "ALTER TABLE agent_sessions ADD COLUMN pty_session_id TEXT;" \
>   2>/dev/null; \
> echo "done"
> ```

- [ ] **Step 4: Update `src/main/db/schema.ts`**

Replace the `agentSessions` table definition with:

```typescript
export const agentSessions = sqliteTable('agent_sessions', {
  id: text('id').primaryKey(),
  taskId: text('task_id'),
  agentId: text('agent_id').notNull(),
  branch: text('branch').notNull(),
  worktreePath: text('worktree_path').notNull(),
  ptySessionId: text('pty_session_id'),
  containerId: text('container_id'),
  status: text('status', {
    enum: ['pending', 'running', 'idle', 'finished', 'failed'],
  })
    .notNull()
    .default('pending'),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`(datetime('now'))`),
})
```

- [ ] **Step 5: Extend `PtyCreateOptions` in `src/main/pty/PtyManager.ts`**

```typescript
export interface PtyCreateOptions {
  workspaceId: string
  cols: number
  rows: number
  cwd: string
  env?: Record<string, string>
  /** If provided, spawn this command instead of the default shell. */
  command?: string
  /** Args to pass when `command` is provided. Defaults to []. */
  args?: string[]
}
```

Update the `create` method:

```typescript
create(options: PtyCreateOptions): { id: string; process: pty.IPty } {
  const shell =
    options.command ??
    (process.platform === 'win32'
      ? 'powershell.exe'
      : (process.env['SHELL'] ?? '/bin/zsh'))
  const args = options.command ? (options.args ?? []) : []
  const id = randomUUID()
  const ptyProcess = pty.spawn(shell, args, {
    name: 'xterm-color',
    cols: options.cols,
    rows: options.rows,
    cwd: options.cwd,
    env: { ...process.env, ...options.env } as Record<string, string>,
  })
  this.sessions.set(id, { id, workspaceId: options.workspaceId, process: ptyProcess })
  return { id, process: ptyProcess }
}
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
export PATH="/Users/jeff.williams/.vfox/cache/nodejs/v-22.22.2/nodejs-22.22.2/bin:$PATH"
npm test 2>&1 | tail -5
```
Expected: all tests pass (the new DB test uses `:memory:` so no ALTER needed in tests).

- [ ] **Step 7: Commit**

```bash
git add src/main/db/client.ts src/main/db/schema.ts src/main/pty/PtyManager.ts tests/main/db.test.ts
git commit -m "feat: make agent_sessions.task_id nullable, add pty_session_id, extend PtyManager command support"
```

---

## Task 2: AgentRegistry (agent detection)

**Files:**
- Create: `src/main/agent/types.ts`
- Create: `src/main/agent/AgentRegistry.ts`
- Test: `tests/main/agent-registry.test.ts`

- [ ] **Step 1: Create `src/main/agent/types.ts`**

```typescript
export interface DetectedAgent {
  id: string          // 'claude' | 'copilot'
  name: string        // display name
  command: string     // executable to spawn
  args: string[]      // default args prepended at session creation
  installed: boolean
  configPath: string | null
}

export interface AgentSessionRecord {
  id: string
  taskId: string | null
  agentId: string
  branch: string
  worktreePath: string
  ptySessionId: string | null
  containerId: string | null
  status: 'pending' | 'running' | 'idle' | 'finished' | 'failed'
  createdAt: string
  updatedAt: string
}

export interface CreateAgentSessionInput {
  agentId: string
  worktreeId: string       // used to look up worktreePath + branch
  worktreePath: string
  branch: string
  taskId?: string
  cols?: number
  rows?: number
}
```

- [ ] **Step 2: Write failing tests in `tests/main/agent-registry.test.ts`**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AgentRegistry } from '../../src/main/agent/AgentRegistry'

vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}))

import { execSync } from 'node:child_process'
const mockExecSync = vi.mocked(execSync)

describe('AgentRegistry', () => {
  let registry: AgentRegistry

  beforeEach(() => {
    registry = new AgentRegistry()
    vi.clearAllMocks()
  })

  it('detects claude when `which claude` succeeds', () => {
    mockExecSync.mockImplementation((cmd: string) => {
      if (cmd === 'which claude') return Buffer.from('/usr/local/bin/claude\n')
      throw new Error('not found')
    })
    const agents = registry.detect()
    const claude = agents.find((a) => a.id === 'claude')
    expect(claude?.installed).toBe(true)
    expect(claude?.command).toBe('claude')
  })

  it('marks claude as not installed when `which claude` throws', () => {
    mockExecSync.mockImplementation(() => { throw new Error('not found') })
    const agents = registry.detect()
    const claude = agents.find((a) => a.id === 'claude')
    expect(claude?.installed).toBe(false)
  })

  it('detects copilot when `gh extension list` includes copilot', () => {
    mockExecSync.mockImplementation((cmd: string) => {
      if (cmd === 'which gh') return Buffer.from('/usr/local/bin/gh\n')
      if ((cmd as string).includes('gh extension list'))
        return Buffer.from('github/gh-copilot\n')
      throw new Error('not found')
    })
    const agents = registry.detect()
    const copilot = agents.find((a) => a.id === 'copilot')
    expect(copilot?.installed).toBe(true)
    expect(copilot?.command).toBe('gh')
  })

  it('marks copilot as not installed when gh is missing', () => {
    mockExecSync.mockImplementation(() => { throw new Error('not found') })
    const agents = registry.detect()
    const copilot = agents.find((a) => a.id === 'copilot')
    expect(copilot?.installed).toBe(false)
  })

  it('marks copilot as not installed when gh exists but copilot extension missing', () => {
    mockExecSync.mockImplementation((cmd: string) => {
      if (cmd === 'which gh') return Buffer.from('/usr/local/bin/gh\n')
      if ((cmd as string).includes('gh extension list')) return Buffer.from('')
      throw new Error('not found')
    })
    const agents = registry.detect()
    const copilot = agents.find((a) => a.id === 'copilot')
    expect(copilot?.installed).toBe(false)
  })

  it('always returns both claude and copilot entries', () => {
    mockExecSync.mockImplementation(() => { throw new Error() })
    const agents = registry.detect()
    expect(agents.map((a) => a.id)).toEqual(expect.arrayContaining(['claude', 'copilot']))
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
export PATH="/Users/jeff.williams/.vfox/cache/nodejs/v-22.22.2/nodejs-22.22.2/bin:$PATH"
npm test -- tests/main/agent-registry.test.ts 2>&1 | tail -10
```
Expected: FAIL — `AgentRegistry` not found.

- [ ] **Step 4: Create `src/main/agent/AgentRegistry.ts`**

```typescript
import { execSync } from 'node:child_process'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { DetectedAgent } from './types'

export class AgentRegistry {
  detect(): DetectedAgent[] {
    return [this.detectClaude(), this.detectCopilot()]
  }

  private which(cmd: string): string | null {
    try {
      return execSync(`which ${cmd}`, { encoding: 'utf8', stdio: 'pipe' }).trim()
    } catch {
      return null
    }
  }

  private detectClaude(): DetectedAgent {
    const bin = this.which('claude')
    return {
      id: 'claude',
      name: 'Claude Code',
      command: 'claude',
      args: [],
      installed: bin !== null,
      configPath: bin ? join(homedir(), '.claude', 'settings.json') : null,
    }
  }

  private detectCopilot(): DetectedAgent {
    const ghBin = this.which('gh')
    if (!ghBin) {
      return {
        id: 'copilot',
        name: 'GitHub Copilot',
        command: 'gh',
        args: ['copilot'],
        installed: false,
        configPath: null,
      }
    }
    let hasCopilotExt = false
    try {
      const output = execSync('gh extension list', { encoding: 'utf8', stdio: 'pipe' })
      hasCopilotExt = output.includes('gh-copilot') || output.includes('copilot')
    } catch {
      hasCopilotExt = false
    }
    return {
      id: 'copilot',
      name: 'GitHub Copilot',
      command: 'gh',
      args: ['copilot'],
      installed: hasCopilotExt,
      configPath: hasCopilotExt ? join(homedir(), '.config', 'gh') : null,
    }
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
export PATH="/Users/jeff.williams/.vfox/cache/nodejs/v-22.22.2/nodejs-22.22.2/bin:$PATH"
npm test -- tests/main/agent-registry.test.ts 2>&1 | tail -10
```
Expected: 6 tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/main/agent/types.ts src/main/agent/AgentRegistry.ts tests/main/agent-registry.test.ts
git commit -m "feat: add AgentRegistry for detecting claude and copilot CLI"
```

---

## Task 3: AgentSessionManager

**Files:**
- Create: `src/main/agent/AgentSessionManager.ts`
- Test: `tests/main/agent-session-manager.test.ts`

- [ ] **Step 1: Write failing tests in `tests/main/agent-session-manager.test.ts`**

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { AgentSessionManager } from '../../src/main/agent/AgentSessionManager'
import type { DrizzleDb } from '../../src/main/db/schema'
import type { PtyManager } from '../../src/main/pty/PtyManager'

function makeMockDb() {
  const sessions: Record<string, unknown> = {}
  return {
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([]) }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }),
    }),
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }),
    }),
    _sessions: sessions,
  } as unknown as DrizzleDb
}

function makeMockPty() {
  return {
    create: vi.fn().mockReturnValue({ id: 'pty-abc', process: { onData: vi.fn(), on: vi.fn() } }),
    kill: vi.fn(),
  } as unknown as PtyManager
}

describe('AgentSessionManager', () => {
  let db: ReturnType<typeof makeMockDb>
  let pty: ReturnType<typeof makeMockPty>
  let manager: AgentSessionManager

  beforeEach(() => {
    db = makeMockDb()
    pty = makeMockPty()
    manager = new AgentSessionManager(db as unknown as DrizzleDb, pty as unknown as PtyManager)
  })

  it('create inserts a record into agent_sessions', async () => {
    const returning = [{ id: 'sess-1', agentId: 'claude', branch: 'feat/x', worktreePath: '/tmp/x', ptySessionId: 'pty-abc', taskId: null, containerId: null, status: 'running', createdAt: '', updatedAt: '' }]
    db.insert = vi.fn().mockReturnValue({ values: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue(returning) }) })
    const result = await manager.create({ agentId: 'claude', worktreeId: 'wt-1', worktreePath: '/tmp/x', branch: 'feat/x' })
    expect(db.insert).toHaveBeenCalledOnce()
    expect(result.agentId).toBe('claude')
    expect(pty.create).toHaveBeenCalledOnce()
  })

  it('create spawns PTY with the worktree path as cwd', async () => {
    const returning = [{ id: 'sess-1', agentId: 'claude', branch: 'feat/x', worktreePath: '/tmp/x', ptySessionId: 'pty-abc', taskId: null, containerId: null, status: 'running', createdAt: '', updatedAt: '' }]
    db.insert = vi.fn().mockReturnValue({ values: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue(returning) }) })
    await manager.create({ agentId: 'claude', worktreeId: 'wt-1', worktreePath: '/tmp/wt', branch: 'feat/x' })
    expect((pty.create as ReturnType<typeof vi.fn>).mock.calls[0][0]).toMatchObject({ cwd: '/tmp/wt', command: 'claude' })
  })

  it('list queries agent_sessions filtered by worktreeId', async () => {
    await manager.list('wt-1')
    expect(db.select).toHaveBeenCalledOnce()
  })

  it('kill calls pty.kill and updates session status to finished', async () => {
    db.update = vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }) })
    await manager.kill('sess-1', 'pty-abc')
    expect(pty.kill).toHaveBeenCalledWith('pty-abc')
    expect(db.update).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 2: Run to verify they fail**

```bash
export PATH="/Users/jeff.williams/.vfox/cache/nodejs/v-22.22.2/nodejs-22.22.2/bin:$PATH"
npm test -- tests/main/agent-session-manager.test.ts 2>&1 | tail -10
```
Expected: FAIL — `AgentSessionManager` not found.

- [ ] **Step 3: Create `src/main/agent/AgentSessionManager.ts`**

```typescript
import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import type { DrizzleDb } from '../db/schema'
import { agentSessions } from '../db/schema'
import type { PtyManager } from '../pty/PtyManager'
import type { AgentSessionRecord, CreateAgentSessionInput } from './types'

const AGENT_COMMANDS: Record<string, { command: string; args: string[] }> = {
  claude: { command: 'claude', args: [] },
  copilot: { command: 'gh', args: ['copilot'] },
}

export class AgentSessionManager {
  constructor(
    private db: DrizzleDb,
    private pty: PtyManager,
    private hookRunner: HookRunner,
  ) {}

  async create(input: CreateAgentSessionInput): Promise<AgentSessionRecord> {
    const id = randomUUID()
    const agentCmd = AGENT_COMMANDS[input.agentId] ?? { command: input.agentId, args: [] }

    const ptyResult = this.pty.create({
      workspaceId: input.worktreeId,
      cols: input.cols ?? 80,
      rows: input.rows ?? 24,
      cwd: input.worktreePath,
      command: agentCmd.command,
      args: agentCmd.args,
    })

    const [record] = await this.db
      .insert(agentSessions)
      .values({
        id,
        taskId: input.taskId ?? null,
        agentId: input.agentId,
        branch: input.branch,
        worktreePath: input.worktreePath,
        ptySessionId: ptyResult.id,
        status: 'running',
      })
      .returning()

    this.hookRunner.run('agent.started', input.worktreePath).catch(() => {})

    return record as AgentSessionRecord
  }

  async list(worktreeId: string): Promise<AgentSessionRecord[]> {
    const rows = await this.db
      .select()
      .from(agentSessions)
      .where(eq(agentSessions.worktreePath, worktreeId))
    return rows as AgentSessionRecord[]
  }

  async kill(sessionId: string, ptySessionId: string): Promise<void> {
    try {
      this.pty.kill(ptySessionId)
    } catch {
      // PTY may already be dead
    }
    await this.db
      .update(agentSessions)
      .set({ status: 'finished', updatedAt: new Date().toISOString() })
      .where(eq(agentSessions.id, sessionId))
  }
}
```

Add the `DrizzleDb` type export to `src/main/db/schema.ts` (add at the bottom):

```typescript
import type { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema'
export type DrizzleDb = ReturnType<typeof drizzle<typeof schema>>
```

> **Note:** `schema.ts` already exports all table definitions. The `DrizzleDb` type alias goes at the bottom of the file after the existing exports. Import `drizzle` from `drizzle-orm/better-sqlite3` — this is type-only, no runtime cost.

- [ ] **Step 4: Run tests to verify they pass**

```bash
export PATH="/Users/jeff.williams/.vfox/cache/nodejs/v-22.22.2/nodejs-22.22.2/bin:$PATH"
npm test -- tests/main/agent-session-manager.test.ts 2>&1 | tail -10
```
Expected: 4 tests pass.

- [ ] **Step 5: Run full test suite**

```bash
export PATH="/Users/jeff.williams/.vfox/cache/nodejs/v-22.22.2/nodejs-22.22.2/bin:$PATH"
npm test 2>&1 | tail -5
```
Expected: all tests pass.

Also add `HookRunner` import and constructor arg:

```typescript
import type { HookRunner } from '../worktree/HookRunner'
```

Update the mock in the test to pass a dummy hookRunner:

```typescript
function makeHookRunner() {
  return { run: vi.fn().mockResolvedValue(undefined) } as unknown as HookRunner
}
// In beforeEach:
manager = new AgentSessionManager(db as unknown as DrizzleDb, pty as unknown as PtyManager, makeHookRunner())
```

- [ ] **Step 6: Commit — AgentSessionManager**

---

## Task 4: Agent IPC bridge

**Files:**
- Create: `src/main/ipc/agent.ipc.ts`
- Modify: `src/main/ipc/index.ts`
- Modify: `src/main/index.ts`
- Modify: `src/preload/ipc-types.ts`
- Modify: `src/preload/index.ts`
- Test: `tests/main/agent.ipc.test.ts`

- [ ] **Step 1: Write failing IPC tests in `tests/main/agent.ipc.test.ts`**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
}))

import { ipcMain } from 'electron'
import { registerAgentHandlers } from '../../src/main/ipc/agent.ipc'
import type { AgentRegistry } from '../../src/main/agent/AgentRegistry'
import type { AgentSessionManager } from '../../src/main/agent/AgentSessionManager'

function makeRegistry() {
  return {
    detect: vi.fn().mockReturnValue([
      { id: 'claude', name: 'Claude Code', command: 'claude', args: [], installed: true, configPath: null },
    ]),
  } as unknown as AgentRegistry
}

function makeSessionManager() {
  return {
    create: vi.fn().mockResolvedValue({ id: 'sess-1', agentId: 'claude', ptySessionId: 'pty-1', branch: 'feat/x', worktreePath: '/tmp/x', taskId: null, containerId: null, status: 'running', createdAt: '', updatedAt: '' }),
    list: vi.fn().mockResolvedValue([]),
    kill: vi.fn().mockResolvedValue(undefined),
  } as unknown as AgentSessionManager
}

describe('registerAgentHandlers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('registers agent:list-detected, agent:session:create, agent:session:list, agent:session:kill handlers', () => {
    registerAgentHandlers(makeRegistry(), makeSessionManager())
    const registeredChannels = vi.mocked(ipcMain.handle).mock.calls.map((c) => c[0])
    expect(registeredChannels).toContain('agent:list-detected')
    expect(registeredChannels).toContain('agent:session:create')
    expect(registeredChannels).toContain('agent:session:list')
    expect(registeredChannels).toContain('agent:session:kill')
  })

  it('agent:list-detected calls registry.detect()', async () => {
    const registry = makeRegistry()
    registerAgentHandlers(registry, makeSessionManager())
    const handler = vi.mocked(ipcMain.handle).mock.calls.find((c) => c[0] === 'agent:list-detected')?.[1]
    await (handler as Function)({})
    expect(registry.detect).toHaveBeenCalledOnce()
  })

  it('agent:session:create calls sessionManager.create with input', async () => {
    const sessionManager = makeSessionManager()
    registerAgentHandlers(makeRegistry(), sessionManager)
    const handler = vi.mocked(ipcMain.handle).mock.calls.find((c) => c[0] === 'agent:session:create')?.[1]
    const input = { agentId: 'claude', worktreeId: 'wt-1', worktreePath: '/tmp/x', branch: 'feat/x' }
    await (handler as Function)({}, input)
    expect(sessionManager.create).toHaveBeenCalledWith(input)
  })

  it('agent:session:kill calls sessionManager.kill with sessionId and ptySessionId', async () => {
    const sessionManager = makeSessionManager()
    registerAgentHandlers(makeRegistry(), sessionManager)
    const handler = vi.mocked(ipcMain.handle).mock.calls.find((c) => c[0] === 'agent:session:kill')?.[1]
    await (handler as Function)({}, 'sess-1', 'pty-1')
    expect(sessionManager.kill).toHaveBeenCalledWith('sess-1', 'pty-1')
  })
})
```

- [ ] **Step 2: Run to verify they fail**

```bash
export PATH="/Users/jeff.williams/.vfox/cache/nodejs/v-22.22.2/nodejs-22.22.2/bin:$PATH"
npm test -- tests/main/agent.ipc.test.ts 2>&1 | tail -10
```
Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/main/ipc/agent.ipc.ts`**

```typescript
import { ipcMain } from 'electron'
import type { AgentRegistry } from '../agent/AgentRegistry'
import type { AgentSessionManager } from '../agent/AgentSessionManager'
import type { CreateAgentSessionInput } from '../agent/types'

export function registerAgentHandlers(
  registry: AgentRegistry,
  sessionManager: AgentSessionManager,
): void {
  ipcMain.handle('agent:list-detected', () => registry.detect())

  ipcMain.handle('agent:session:create', (_event, input: CreateAgentSessionInput) =>
    sessionManager.create(input),
  )

  ipcMain.handle('agent:session:list', (_event, worktreeId: string) =>
    sessionManager.list(worktreeId),
  )

  ipcMain.handle('agent:session:kill', (_event, sessionId: string, ptySessionId: string) =>
    sessionManager.kill(sessionId, ptySessionId),
  )
}
```

- [ ] **Step 4: Update `src/main/ipc/index.ts`**

```typescript
export { registerWorkspaceHandlers } from './workspace.ipc'
export { registerPtyHandlers } from './pty.ipc'
export { registerWorktreeHandlers } from './worktree.ipc'
export { registerAgentHandlers } from './agent.ipc'
```

- [ ] **Step 5: Update `src/main/index.ts`** — add instantiation and handler registration

After the existing `worktreeManager` and `hookRunner` declarations, add:

```typescript
import { AgentRegistry } from './agent/AgentRegistry'
import { AgentSessionManager } from './agent/AgentSessionManager'
```

(Add these imports at the top of `src/main/index.ts` with the other imports.)

In `app.whenReady().then(...)`, after the existing manager instantiations, add:

```typescript
const agentRegistry = new AgentRegistry()
const agentSessionManager = new AgentSessionManager(db, ptyManager)
```

And after `registerWorktreeHandlers(worktreeManager, hookRunner)`, add:

```typescript
registerAgentHandlers(agentRegistry, agentSessionManager)
```

- [ ] **Step 6: Add `AGENT_CHANNELS` + types + `AgentAPI` to `src/preload/ipc-types.ts`**

After the `WorktreeAPI` block, add:

```typescript
// --- Agent ---

export const AGENT_CHANNELS = {
  LIST_DETECTED: 'agent:list-detected',
  SESSION_CREATE: 'agent:session:create',
  SESSION_LIST: 'agent:session:list',
  SESSION_KILL: 'agent:session:kill',
} as const

export interface DetectedAgent {
  id: string
  name: string
  command: string
  args: string[]
  installed: boolean
  configPath: string | null
}

export interface AgentSessionRecord {
  id: string
  taskId: string | null
  agentId: string
  branch: string
  worktreePath: string
  ptySessionId: string | null
  containerId: string | null
  status: 'pending' | 'running' | 'idle' | 'finished' | 'failed'
  createdAt: string
  updatedAt: string
}

export interface CreateAgentSessionInput {
  agentId: string
  worktreeId: string
  worktreePath: string
  branch: string
  taskId?: string
  cols?: number
  rows?: number
}

export interface AgentAPI {
  listDetected: () => Promise<DetectedAgent[]>
  createSession: (input: CreateAgentSessionInput) => Promise<AgentSessionRecord>
  listSessions: (worktreeId: string) => Promise<AgentSessionRecord[]>
  killSession: (sessionId: string, ptySessionId: string) => Promise<void>
}
```

Update `XaideAPI`:

```typescript
export interface XaideAPI {
  workspace: WorkspaceAPI
  pty: PtyAPI
  worktree: WorktreeAPI
  agent: AgentAPI
}
```

- [ ] **Step 7: Wire agent API in `src/preload/index.ts`**

Add the import at the top:

```typescript
import type { ..., CreateAgentSessionInput, AgentAPI } from './ipc-types'
import { ..., AGENT_CHANNELS } from './ipc-types'
```

(Extend the existing import lines — add `CreateAgentSessionInput`, `AgentAPI` to the type import and `AGENT_CHANNELS` to the channel import.)

Add the `agent` property to the `api` object:

```typescript
agent: {
  listDetected: () => ipcRenderer.invoke(AGENT_CHANNELS.LIST_DETECTED),
  createSession: (input: CreateAgentSessionInput) =>
    ipcRenderer.invoke(AGENT_CHANNELS.SESSION_CREATE, input),
  listSessions: (worktreeId: string) =>
    ipcRenderer.invoke(AGENT_CHANNELS.SESSION_LIST, worktreeId),
  killSession: (sessionId: string, ptySessionId: string) =>
    ipcRenderer.invoke(AGENT_CHANNELS.SESSION_KILL, sessionId, ptySessionId),
} satisfies AgentAPI,
```

- [ ] **Step 8: Run IPC tests**

```bash
export PATH="/Users/jeff.williams/.vfox/cache/nodejs/v-22.22.2/nodejs-22.22.2/bin:$PATH"
npm test -- tests/main/agent.ipc.test.ts 2>&1 | tail -10
```
Expected: 4 tests pass.

- [ ] **Step 9: Run full suite**

```bash
export PATH="/Users/jeff.williams/.vfox/cache/nodejs/v-22.22.2/nodejs-22.22.2/bin:$PATH"
npm test 2>&1 | tail -5
```
Expected: all tests pass.

- [ ] **Step 10: Commit**

```bash
git add src/main/ipc/agent.ipc.ts src/main/ipc/index.ts src/main/index.ts \
        src/preload/ipc-types.ts src/preload/index.ts \
        tests/main/agent.ipc.test.ts
git commit -m "feat: agent IPC bridge - list detected, create/list/kill sessions"
```

---

## Task 5: AgentLauncher UI + tab integration

**Files:**
- Create: `src/renderer/src/hooks/useAgents.ts`
- Create: `src/renderer/src/components/AgentLauncher.tsx`
- Modify: `src/renderer/src/store/uiStore.ts`
- Modify: `src/renderer/src/components/SessionTabBar.tsx`
- Modify: `src/renderer/src/components/MainArea.tsx`
- Modify: `tests/renderer/setup.ts`
- Test: `tests/renderer/AgentLauncher.test.tsx`

- [ ] **Step 1: Add `agent` mock to `tests/renderer/setup.ts`**

In `tests/renderer/setup.ts`, extend `window.xaide` mock with:

```typescript
agent: {
  listDetected: vi.fn().mockResolvedValue([]),
  createSession: vi.fn().mockResolvedValue({
    id: 'sess-1', agentId: 'claude', branch: 'feat/x', worktreePath: '/tmp/x',
    ptySessionId: 'pty-1', taskId: null, containerId: null, status: 'running',
    createdAt: '', updatedAt: '',
  }),
  listSessions: vi.fn().mockResolvedValue([]),
  killSession: vi.fn().mockResolvedValue(undefined),
},
```

- [ ] **Step 2: Create `src/renderer/src/hooks/useAgents.ts`**

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { CreateAgentSessionInput } from '../../../preload/ipc-types'

export function useDetectedAgents() {
  return useQuery({
    queryKey: ['agents', 'detected'],
    queryFn: () => window.xaide.agent.listDetected(),
  })
}

export function useAgentSessions(worktreeId: string | null) {
  return useQuery({
    queryKey: ['agent-sessions', worktreeId],
    queryFn: () => (worktreeId ? window.xaide.agent.listSessions(worktreeId) : Promise.resolve([])),
    enabled: !!worktreeId,
  })
}

export function useLaunchAgent() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateAgentSessionInput) => window.xaide.agent.createSession(input),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['agent-sessions', variables.worktreeId] })
    },
  })
}

export function useKillAgentSession(worktreeId: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ sessionId, ptySessionId }: { sessionId: string; ptySessionId: string }) =>
      window.xaide.agent.killSession(sessionId, ptySessionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-sessions', worktreeId] })
    },
  })
}
```

- [ ] **Step 3: Add `AgentSessionUiRecord` + actions to `src/renderer/src/store/uiStore.ts`**

Add the interface after the `ShellSession` interface:

```typescript
export interface AgentSessionUiRecord {
  id: string
  ptySessionId: string
  agentId: string
  agentName: string
  branch: string
  worktreeId: string
  workspaceId: string
}
```

Add to `UiState`:

```typescript
agentSessions: AgentSessionUiRecord[]
addAgentSession: (session: AgentSessionUiRecord) => void
removeAgentSession: (id: string) => void
```

Add initial state in `create<UiState>(...)`:

```typescript
agentSessions: [],
```

Add the actions:

```typescript
addAgentSession: (session) =>
  set((state) => ({ agentSessions: [...state.agentSessions, session] })),

removeAgentSession: (id) =>
  set((state) => ({ agentSessions: state.agentSessions.filter((s) => s.id !== id) })),
```

- [ ] **Step 4: Write failing tests in `tests/renderer/AgentLauncher.test.tsx`**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AgentLauncher } from '../../src/renderer/src/components/AgentLauncher'

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

const mockWorktrees = [
  { id: 'wt-1', branch: 'feat/auth', worktreePath: '/tmp/wt', workspaceId: 'ws-1', repoPath: '/repo', baseBranch: 'main', status: 'active' as const, createdAt: '', updatedAt: '' },
]

const mockAgents = [
  { id: 'claude', name: 'Claude Code', command: 'claude', args: [], installed: true, configPath: null },
  { id: 'copilot', name: 'GitHub Copilot', command: 'gh', args: ['copilot'], installed: false, configPath: null },
]

describe('AgentLauncher', () => {
  const onLaunch = vi.fn()
  const onClose = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(window.xaide.agent.listDetected).mockResolvedValue(mockAgents)
  })

  it('renders agent options and worktree options', async () => {
    render(<AgentLauncher worktrees={mockWorktrees} onLaunch={onLaunch} onClose={onClose} />, { wrapper })
    await waitFor(() => expect(screen.getByText('Claude Code')).toBeInTheDocument())
    expect(screen.getByText('feat/auth')).toBeInTheDocument()
  })

  it('disables Launch button when no agent is selected', async () => {
    render(<AgentLauncher worktrees={mockWorktrees} onLaunch={onLaunch} onClose={onClose} />, { wrapper })
    await waitFor(() => screen.getByText('Claude Code'))
    const btn = screen.getByRole('button', { name: /launch/i })
    expect(btn).toBeDisabled()
  })

  it('calls onLaunch with agentId and worktreeId after selection', async () => {
    render(<AgentLauncher worktrees={mockWorktrees} onLaunch={onLaunch} onClose={onClose} />, { wrapper })
    await waitFor(() => screen.getByText('Claude Code'))
    fireEvent.click(screen.getByText('Claude Code'))
    fireEvent.click(screen.getByText('feat/auth'))
    fireEvent.click(screen.getByRole('button', { name: /launch/i }))
    await waitFor(() => expect(onLaunch).toHaveBeenCalledWith('claude', 'wt-1'))
  })

  it('calls onClose when Cancel is clicked', async () => {
    render(<AgentLauncher worktrees={mockWorktrees} onLaunch={onLaunch} onClose={onClose} />, { wrapper })
    await waitFor(() => screen.getByText('Claude Code'))
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('shows (not installed) badge for copilot', async () => {
    render(<AgentLauncher worktrees={mockWorktrees} onLaunch={onLaunch} onClose={onClose} />, { wrapper })
    await waitFor(() => screen.getByText('GitHub Copilot'))
    expect(screen.getByText('not installed')).toBeInTheDocument()
  })
})
```

- [ ] **Step 5: Run to verify they fail**

```bash
export PATH="/Users/jeff.williams/.vfox/cache/nodejs/v-22.22.2/nodejs-22.22.2/bin:$PATH"
npm run test:renderer -- tests/renderer/AgentLauncher.test.tsx 2>&1 | tail -10
```
Expected: FAIL — `AgentLauncher` not found.

- [ ] **Step 6: Create `src/renderer/src/components/AgentLauncher.tsx`**

```typescript
import { useState } from 'react'
import type { FC } from 'react'
import { useDetectedAgents } from '../hooks/useAgents'
import type { WorktreeRecord } from '../../../preload/ipc-types'

interface Props {
  worktrees: WorktreeRecord[]
  onLaunch: (agentId: string, worktreeId: string) => void
  onClose: () => void
}

export const AgentLauncher: FC<Props> = ({ worktrees, onLaunch, onClose }) => {
  const { data: agents = [] } = useDetectedAgents()
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null)
  const [selectedWorktree, setSelectedWorktree] = useState<string | null>(
    worktrees[0]?.id ?? null,
  )

  const canLaunch = selectedAgent !== null && selectedWorktree !== null

  return (
    <div className="absolute top-8 left-0 z-50 w-72 bg-neutral-800 border border-neutral-700 rounded shadow-lg p-3 flex flex-col gap-3">
      <div>
        <p className="text-xs font-semibold text-neutral-400 mb-1 uppercase tracking-wider">Agent</p>
        <div className="flex flex-col gap-1">
          {agents.map((agent) => (
            <button
              key={agent.id}
              type="button"
              onClick={() => agent.installed && setSelectedAgent(agent.id)}
              disabled={!agent.installed}
              className={[
                'flex items-center justify-between px-2 py-1 rounded text-sm',
                selectedAgent === agent.id
                  ? 'bg-blue-600 text-white'
                  : agent.installed
                    ? 'text-neutral-200 hover:bg-neutral-700'
                    : 'text-neutral-500 cursor-not-allowed',
              ].join(' ')}
            >
              <span>{agent.name}</span>
              {!agent.installed && (
                <span className="text-xs text-neutral-500 ml-2">not installed</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {worktrees.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-neutral-400 mb-1 uppercase tracking-wider">Worktree</p>
          <div className="flex flex-col gap-1">
            {worktrees.map((wt) => (
              <button
                key={wt.id}
                type="button"
                onClick={() => setSelectedWorktree(wt.id)}
                className={[
                  'px-2 py-1 rounded text-sm text-left',
                  selectedWorktree === wt.id
                    ? 'bg-blue-600 text-white'
                    : 'text-neutral-200 hover:bg-neutral-700',
                ].join(' ')}
              >
                {wt.branch}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={onClose}
          className="px-3 py-1 text-xs rounded text-neutral-400 hover:text-neutral-200 hover:bg-neutral-700"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={!canLaunch}
          onClick={() => canLaunch && onLaunch(selectedAgent!, selectedWorktree!)}
          className="px-3 py-1 text-xs rounded bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Launch
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 7: Update `src/renderer/src/components/MainArea.tsx`**

Add imports at the top:

```typescript
import { useState } from 'react'
import { AgentLauncher } from './AgentLauncher'
import { useLaunchAgent } from '../hooks/useAgents'
import { useWorktrees } from '../hooks/useWorktrees'
import { useUiStore } from '../store/uiStore'
import type { AgentSessionUiRecord } from '../store/uiStore'
```

Add inside the component body (after `workspace` declaration):

```typescript
const [showLauncher, setShowLauncher] = useState(false)
const launchAgent = useLaunchAgent()
const { data: worktrees = [] } = useWorktrees(activeWorkspaceId)
const agentSessions = useUiStore((s) => s.agentSessions.filter((a) => a.workspaceId === activeWorkspaceId))
const addAgentSession = useUiStore((s) => s.addAgentSession)
const removeAgentSession = useUiStore((s) => s.removeAgentSession)

const handleLaunchAgent = async (agentId: string, worktreeId: string) => {
  const wt = worktrees.find((w) => w.id === worktreeId)
  if (!wt || !activeWorkspaceId) return
  setShowLauncher(false)
  const agentNames: Record<string, string> = { claude: 'Claude Code', copilot: 'Copilot' }
  const record = await launchAgent.mutateAsync({
    agentId,
    worktreeId,
    worktreePath: wt.worktreePath,
    branch: wt.branch,
  })
  const uiRecord: AgentSessionUiRecord = {
    id: record.id,
    ptySessionId: record.ptySessionId ?? '',
    agentId: record.agentId,
    agentName: agentNames[agentId] ?? agentId,
    branch: record.branch,
    worktreeId,
    workspaceId: activeWorkspaceId,
  }
  addAgentSession(uiRecord)
  // Also register PTY with existing session infrastructure so xterm.js gets data events
  addSession({
    id: record.ptySessionId ?? record.id,
    workspaceId: activeWorkspaceId,
    title: `${agentNames[agentId] ?? agentId} (${wt.branch})`,
    cwd: wt.worktreePath,
  })
}

const handleKillAgentSession = async (agentSessionId: string, ptySessionId: string) => {
  await window.xaide.pty.kill(ptySessionId)
  await window.xaide.agent.killSession(agentSessionId, ptySessionId)
  removeAgentSession(agentSessionId)
  removeSession(ptySessionId)
}
```

Pass new props to `SessionTabBar`:

```typescript
<SessionTabBar
  workspaceId={activeWorkspaceId}
  sessions={sessions}
  activeSessionId={activeSessionId}
  onSelectSession={(id) => setActiveSession(activeWorkspaceId, id)}
  onNewSession={openNewSession}
  onCloseSession={closeSession}
  onOpenAgentLauncher={() => setShowLauncher(true)}
/>
```

Add the `AgentLauncher` overlay inside the `<main>` tag, before `<SessionTabBar>`:

```typescript
<div className="relative">
  {showLauncher && (
    <AgentLauncher
      worktrees={worktrees}
      onLaunch={handleLaunchAgent}
      onClose={() => setShowLauncher(false)}
    />
  )}
</div>
```

- [ ] **Step 8: Update `SessionTabBar` to accept + render the Launch Agent button**

Add `onOpenAgentLauncher: () => void` to the `Props` interface and destructure it. Replace the existing `+` (new session) button with two buttons:

```typescript
<button
  type="button"
  aria-label="New terminal session"
  className="ml-1 px-2 py-1 text-xs text-neutral-500 hover:text-neutral-200 hover:bg-neutral-800 rounded"
  onClick={onNewSession}
>
  +
</button>
<button
  type="button"
  aria-label="Launch agent session"
  title="Launch agent"
  className="ml-1 px-2 py-1 text-xs text-neutral-500 hover:text-neutral-200 hover:bg-neutral-800 rounded"
  onClick={onOpenAgentLauncher}
>
  ✦
</button>
```

- [ ] **Step 9: Run renderer tests**

```bash
export PATH="/Users/jeff.williams/.vfox/cache/nodejs/v-22.22.2/nodejs-22.22.2/bin:$PATH"
npm run test:renderer 2>&1 | tail -10
```
Expected: 5 new AgentLauncher tests pass; all existing tests still pass.

- [ ] **Step 10: Run full test suite**

```bash
export PATH="/Users/jeff.williams/.vfox/cache/nodejs/v-22.22.2/nodejs-22.22.2/bin:$PATH"
npm test 2>&1 | tail -5
```
Expected: all main tests pass.

- [ ] **Step 11: Commit**

```bash
git add \
  src/renderer/src/hooks/useAgents.ts \
  src/renderer/src/components/AgentLauncher.tsx \
  src/renderer/src/store/uiStore.ts \
  src/renderer/src/components/SessionTabBar.tsx \
  src/renderer/src/components/MainArea.tsx \
  tests/renderer/AgentLauncher.test.tsx \
  tests/renderer/setup.ts
git commit -m "feat: AgentLauncher UI + agent session tab integration"
```

---

## Dev DB migration note

After implementing Tasks 1–4, run the ALTER commands from Task 1 Step 3 against the live DB at `~/Library/Application Support/xaide/xaide.db` so the schema matches the code. New columns are NULL-safe so existing data is unaffected.
