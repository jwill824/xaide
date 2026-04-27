# Task Management UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Task Management UI that lets users create, view, update, and delete tasks scoped to a workspace — shown in the LeftPanel below the WorktreeList.

**Architecture:** Follow the established 4-layer pattern: `TaskManager` (DB CRUD) → `tasks.ipc.ts` (IPC handlers) → preload bridge → `useTasks` hooks → `TaskList` React component. Tasks are persisted in the existing `tasks` SQLite table. The `TaskList` section replaces empty space at the bottom of the LeftPanel.

**Tech Stack:** Drizzle ORM (better-sqlite3), Electron IPC, React Query v5, Zustand, React, TypeScript, Tailwind CSS, Vitest

---

## File Map

### New files
- `src/main/task/TaskManager.ts` — DB CRUD for tasks (list, create, update, delete)
- `src/main/ipc/tasks.ipc.ts` — IPC handlers for 4 task channels
- `src/renderer/src/hooks/useTasks.ts` — React Query hooks: `useTasks`, `useCreateTask`, `useUpdateTask`, `useDeleteTask`
- `src/renderer/src/components/TaskList.tsx` — Task list UI with inline create form and status controls
- `tests/main/task-manager.test.ts` — Unit tests for TaskManager
- `tests/main/tasks.ipc.test.ts` — Unit tests for task IPC handlers
- `tests/renderer/TaskList.test.tsx` — Component tests for TaskList

### Modified files
- `src/preload/ipc-types.ts` — Add `TASK_CHANNELS`, `Task`, `CreateTaskInput`, `UpdateTaskInput`, `TaskAPI`; extend `XaideAPI`
- `src/preload/index.ts` — Add `tasks` property to contextBridge
- `src/main/ipc/index.ts` — Export `registerTaskHandlers`
- `src/main/index.ts` — Instantiate `TaskManager`, call `registerTaskHandlers`
- `src/renderer/src/components/LeftPanel.tsx` — Render `<TaskList>` below `<WorktreeList>`
- `tests/renderer/setup.ts` — Add `tasks` mock to `window.xaide`

---

## Task 1: TaskManager

**Files:**
- Create: `src/main/task/TaskManager.ts`
- Create: `tests/main/task-manager.test.ts`

### Background
The `tasks` table already exists in `client.ts` and `schema.ts`. Relevant Drizzle table def from `src/main/db/schema.ts`:
```typescript
export const tasks = sqliteTable('tasks', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  sourceAdapter: text('source_adapter').notNull(),
  methodologyAdapter: text('methodology_adapter'),
  prompt: text('prompt').notNull().default(''),
  status: text('status', { enum: ['pending', 'in_progress', 'done', 'blocked'] }).notNull().default('pending'),
  baseCommit: text('base_commit'),
  parallelGroupId: text('parallel_group_id'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
})
```

`DrizzleDb` is imported from `src/main/db/schema.ts`.

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/main/task-manager.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import Database from 'better-sqlite3'
import { createDb } from '../../src/main/db/client'
import { dbSchema } from '../../src/main/db/schema'
import { TaskManager } from '../../src/main/task/TaskManager'

let manager: TaskManager
let workspaceId: string

beforeEach(async () => {
  const raw = createDb(':memory:')
  const db = drizzle(raw, { schema: dbSchema })
  manager = new TaskManager(db)

  // seed a workspace so FK constraint passes
  const { workspaces } = dbSchema
  const ws = await db.insert(workspaces).values({
    id: 'ws-1',
    name: 'Test WS',
    repoPath: '/tmp/ws',
    configJson: '{}',
    sandboxDefaults: '{}',
    layoutJson: '{}',
  }).returning()
  workspaceId = ws[0].id
})

describe('TaskManager', () => {
  it('creates a task and returns it', async () => {
    const task = await manager.create({ workspaceId, title: 'Fix bug', prompt: 'do it' })
    expect(task.id).toBeDefined()
    expect(task.title).toBe('Fix bug')
    expect(task.prompt).toBe('do it')
    expect(task.status).toBe('pending')
    expect(task.sourceAdapter).toBe('manual')
  })

  it('lists tasks for a workspace', async () => {
    await manager.create({ workspaceId, title: 'Task A' })
    await manager.create({ workspaceId, title: 'Task B' })
    const list = await manager.list(workspaceId)
    expect(list).toHaveLength(2)
    expect(list.map((t) => t.title)).toEqual(expect.arrayContaining(['Task A', 'Task B']))
  })

  it('updates task status', async () => {
    const task = await manager.create({ workspaceId, title: 'Task' })
    const updated = await manager.update(task.id, { status: 'in_progress' })
    expect(updated.status).toBe('in_progress')
  })

  it('updates task title and prompt', async () => {
    const task = await manager.create({ workspaceId, title: 'Old' })
    const updated = await manager.update(task.id, { title: 'New', prompt: 'new prompt' })
    expect(updated.title).toBe('New')
    expect(updated.prompt).toBe('new prompt')
  })

  it('deletes a task', async () => {
    const task = await manager.create({ workspaceId, title: 'Delete me' })
    await manager.delete(task.id)
    const list = await manager.list(workspaceId)
    expect(list).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
export PATH="/Users/jeff.williams/.vfox/cache/nodejs/v-22.22.2/nodejs-22.22.2/bin:$PATH"
npm test -- --reporter=verbose tests/main/task-manager.test.ts
```

Expected: FAIL — `Cannot find module '../../src/main/task/TaskManager'`

- [ ] **Step 3: Implement TaskManager**

```typescript
// src/main/task/TaskManager.ts
import { eq } from 'drizzle-orm'
import { randomUUID } from 'crypto'
import type { DrizzleDb } from '../db/schema'
import { tasks } from '../db/schema'

export interface Task {
  id: string
  workspaceId: string
  title: string
  sourceAdapter: string
  methodologyAdapter: string | null
  prompt: string
  status: 'pending' | 'in_progress' | 'done' | 'blocked'
  baseCommit: string | null
  parallelGroupId: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateTaskInput {
  workspaceId: string
  title: string
  prompt?: string
  sourceAdapter?: string
}

export interface UpdateTaskInput {
  title?: string
  prompt?: string
  status?: 'pending' | 'in_progress' | 'done' | 'blocked'
}

export class TaskManager {
  constructor(private db: DrizzleDb) {}

  async list(workspaceId: string): Promise<Task[]> {
    return this.db
      .select()
      .from(tasks)
      .where(eq(tasks.workspaceId, workspaceId))
      .orderBy(tasks.createdAt) as Promise<Task[]>
  }

  async create(input: CreateTaskInput): Promise<Task> {
    const now = new Date().toISOString()
    const id = randomUUID()
    const rows = await this.db
      .insert(tasks)
      .values({
        id,
        workspaceId: input.workspaceId,
        title: input.title,
        prompt: input.prompt ?? '',
        sourceAdapter: input.sourceAdapter ?? 'manual',
        status: 'pending',
        createdAt: now,
        updatedAt: now,
      })
      .returning()
    return rows[0] as Task
  }

  async update(id: string, input: UpdateTaskInput): Promise<Task> {
    const now = new Date().toISOString()
    const rows = await this.db
      .update(tasks)
      .set({ ...input, updatedAt: now })
      .where(eq(tasks.id, id))
      .returning()
    if (rows.length === 0) throw new Error(`Task not found: ${id}`)
    return rows[0] as Task
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(tasks).where(eq(tasks.id, id))
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
export PATH="/Users/jeff.williams/.vfox/cache/nodejs/v-22.22.2/nodejs-22.22.2/bin:$PATH"
npm test -- --reporter=verbose tests/main/task-manager.test.ts
```

Expected: 5/5 PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/task/TaskManager.ts tests/main/task-manager.test.ts
git commit -m "feat: add TaskManager for task CRUD"
```

---

## Task 2: Task IPC Bridge

**Files:**
- Create: `src/main/ipc/tasks.ipc.ts`
- Create: `tests/main/tasks.ipc.test.ts`
- Modify: `src/preload/ipc-types.ts` — add TASK_CHANNELS, Task, CreateTaskInput, UpdateTaskInput, TaskAPI; extend XaideAPI
- Modify: `src/preload/index.ts` — add `tasks` to contextBridge
- Modify: `src/main/ipc/index.ts` — export `registerTaskHandlers`
- Modify: `src/main/index.ts` — instantiate TaskManager, call registerTaskHandlers

### Background
IPC pattern (from `src/main/ipc/agent.ipc.ts`):
```typescript
import { ipcMain } from 'electron'
import { AGENT_CHANNELS } from '../../preload/ipc-types'
import type { AgentRegistry } from '../agent/AgentRegistry'
import type { AgentSessionManager } from '../agent/AgentSessionManager'

export function registerAgentHandlers(registry: AgentRegistry, manager: AgentSessionManager): void {
  ipcMain.handle(AGENT_CHANNELS.LIST_DETECTED, () => registry.list())
  ipcMain.handle(AGENT_CHANNELS.SESSION_CREATE, (_e, input) => manager.create(input))
  ipcMain.handle(AGENT_CHANNELS.SESSION_LIST, () => manager.list())
  ipcMain.handle(AGENT_CHANNELS.SESSION_KILL, (_e, sessionId, ptySessionId) => manager.kill(sessionId, ptySessionId))
}
```

Preload pattern (from `src/preload/index.ts`):
```typescript
import { contextBridge, ipcRenderer } from 'electron'
import type { XaideAPI } from './ipc-types'
import { AGENT_CHANNELS, PTY_CHANNELS, ... } from './ipc-types'

const api: XaideAPI = {
  agent: {
    listDetected: () => ipcRenderer.invoke(AGENT_CHANNELS.LIST_DETECTED),
    createSession: (input) => ipcRenderer.invoke(AGENT_CHANNELS.SESSION_CREATE, input),
    listSessions: () => ipcRenderer.invoke(AGENT_CHANNELS.SESSION_LIST),
    killSession: (sessionId, ptySessionId) => ipcRenderer.invoke(AGENT_CHANNELS.SESSION_KILL, sessionId, ptySessionId),
  },
  // ...
} satisfies XaideAPI

contextBridge.exposeInMainWorld('xaide', api)
```

- [ ] **Step 1: Write the failing IPC tests**

```typescript
// tests/main/tasks.ipc.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ipcMain } from 'electron'

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
}))

const mockManager = {
  list: vi.fn().mockResolvedValue([]),
  create: vi.fn().mockResolvedValue({ id: 'task-1', title: 'T', status: 'pending' }),
  update: vi.fn().mockResolvedValue({ id: 'task-1', title: 'T', status: 'in_progress' }),
  delete: vi.fn().mockResolvedValue(undefined),
}

describe('registerTaskHandlers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('registers 4 ipcMain handlers', async () => {
    const { registerTaskHandlers } = await import('../../src/main/ipc/tasks.ipc')
    registerTaskHandlers(mockManager as any)
    expect(ipcMain.handle).toHaveBeenCalledTimes(4)
  })

  it('task:list invokes manager.list with workspaceId', async () => {
    const { registerTaskHandlers } = await import('../../src/main/ipc/tasks.ipc')
    registerTaskHandlers(mockManager as any)
    const handler = vi.mocked(ipcMain.handle).mock.calls.find(([ch]) => ch === 'task:list')?.[1]
    await handler?.({} as any, 'ws-1')
    expect(mockManager.list).toHaveBeenCalledWith('ws-1')
  })

  it('task:create invokes manager.create with input', async () => {
    const { registerTaskHandlers } = await import('../../src/main/ipc/tasks.ipc')
    registerTaskHandlers(mockManager as any)
    const handler = vi.mocked(ipcMain.handle).mock.calls.find(([ch]) => ch === 'task:create')?.[1]
    const input = { workspaceId: 'ws-1', title: 'New task' }
    await handler?.({} as any, input)
    expect(mockManager.create).toHaveBeenCalledWith(input)
  })

  it('task:update invokes manager.update with id and input', async () => {
    const { registerTaskHandlers } = await import('../../src/main/ipc/tasks.ipc')
    registerTaskHandlers(mockManager as any)
    const handler = vi.mocked(ipcMain.handle).mock.calls.find(([ch]) => ch === 'task:update')?.[1]
    await handler?.({} as any, 'task-1', { status: 'done' })
    expect(mockManager.update).toHaveBeenCalledWith('task-1', { status: 'done' })
  })

  it('task:delete invokes manager.delete with id', async () => {
    const { registerTaskHandlers } = await import('../../src/main/ipc/tasks.ipc')
    registerTaskHandlers(mockManager as any)
    const handler = vi.mocked(ipcMain.handle).mock.calls.find(([ch]) => ch === 'task:delete')?.[1]
    await handler?.({} as any, 'task-1')
    expect(mockManager.delete).toHaveBeenCalledWith('task-1')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
export PATH="/Users/jeff.williams/.vfox/cache/nodejs/v-22.22.2/nodejs-22.22.2/bin:$PATH"
npm test -- --reporter=verbose tests/main/tasks.ipc.test.ts
```

Expected: FAIL — `Cannot find module '../../src/main/ipc/tasks.ipc'`

- [ ] **Step 3: Add TASK_CHANNELS and types to preload/ipc-types.ts**

In `src/preload/ipc-types.ts`, add after the Agent section:

```typescript
// --- Tasks ---

export const TASK_CHANNELS = {
  LIST: 'task:list',
  CREATE: 'task:create',
  UPDATE: 'task:update',
  DELETE: 'task:delete',
} as const

export interface Task {
  id: string
  workspaceId: string
  title: string
  sourceAdapter: string
  methodologyAdapter: string | null
  prompt: string
  status: 'pending' | 'in_progress' | 'done' | 'blocked'
  baseCommit: string | null
  parallelGroupId: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateTaskInput {
  workspaceId: string
  title: string
  prompt?: string
  sourceAdapter?: string
}

export interface UpdateTaskInput {
  title?: string
  prompt?: string
  status?: 'pending' | 'in_progress' | 'done' | 'blocked'
}

export interface TaskAPI {
  list: (workspaceId: string) => Promise<Task[]>
  create: (input: CreateTaskInput) => Promise<Task>
  update: (id: string, input: UpdateTaskInput) => Promise<Task>
  delete: (id: string) => Promise<void>
}
```

Also update `XaideAPI` to add `tasks: TaskAPI`:
```typescript
export interface XaideAPI {
  workspace: WorkspaceAPI
  pty: PtyAPI
  worktree: WorktreeAPI
  agent: AgentAPI
  tasks: TaskAPI   // ← add this line
}
```

- [ ] **Step 4: Implement tasks.ipc.ts**

```typescript
// src/main/ipc/tasks.ipc.ts
import { ipcMain } from 'electron'
import { TASK_CHANNELS } from '../../preload/ipc-types'
import type { TaskManager } from '../task/TaskManager'

export function registerTaskHandlers(manager: TaskManager): void {
  ipcMain.handle(TASK_CHANNELS.LIST, (_e, workspaceId: string) => manager.list(workspaceId))
  ipcMain.handle(TASK_CHANNELS.CREATE, (_e, input) => manager.create(input))
  ipcMain.handle(TASK_CHANNELS.UPDATE, (_e, id: string, input) => manager.update(id, input))
  ipcMain.handle(TASK_CHANNELS.DELETE, (_e, id: string) => manager.delete(id))
}
```

- [ ] **Step 5: Add tasks to preload/index.ts contextBridge**

Open `src/preload/index.ts`. Add import for `TASK_CHANNELS` (alongside existing imports). Add `tasks` property to the `api` object:

```typescript
tasks: {
  list: (workspaceId) => ipcRenderer.invoke(TASK_CHANNELS.LIST, workspaceId),
  create: (input) => ipcRenderer.invoke(TASK_CHANNELS.CREATE, input),
  update: (id, input) => ipcRenderer.invoke(TASK_CHANNELS.UPDATE, id, input),
  delete: (id) => ipcRenderer.invoke(TASK_CHANNELS.DELETE, id),
},
```

- [ ] **Step 6: Export registerTaskHandlers from src/main/ipc/index.ts**

Add to `src/main/ipc/index.ts`:
```typescript
export { registerTaskHandlers } from './tasks.ipc'
```

- [ ] **Step 7: Wire TaskManager in src/main/index.ts**

In `src/main/index.ts`, after the existing imports add:
```typescript
import { TaskManager } from './task/TaskManager'
```

In the `registerWorkspaceHandlers(...)` block, add:
```typescript
const taskManager = new TaskManager(db)
registerTaskHandlers(taskManager)
```

Also add `registerTaskHandlers` to the existing destructured import from `'./ipc'`.

- [ ] **Step 8: Run tests to verify they pass**

```bash
export PATH="/Users/jeff.williams/.vfox/cache/nodejs/v-22.22.2/nodejs-22.22.2/bin:$PATH"
npm test -- --reporter=verbose tests/main/tasks.ipc.test.ts
```

Expected: 5/5 PASS

- [ ] **Step 9: Commit**

```bash
git add src/main/ipc/tasks.ipc.ts src/preload/ipc-types.ts src/preload/index.ts \
        src/main/ipc/index.ts src/main/index.ts tests/main/tasks.ipc.test.ts
git commit -m "feat: task IPC bridge - list/create/update/delete channels"
```

---

## Task 3: useTasks Hooks

**Files:**
- Create: `src/renderer/src/hooks/useTasks.ts`
- Modify: `tests/renderer/setup.ts` — add `tasks` mock to `window.xaide`

### Background
Hook pattern (from `src/renderer/src/hooks/useWorktrees.ts`):
```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

export function useWorktrees(workspaceId: string | null) {
  return useQuery({
    queryKey: ['worktrees', workspaceId],
    queryFn: () => window.xaide.worktree.list(workspaceId!),
    enabled: !!workspaceId,
  })
}

export function useCreateWorktree() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (opts: CreateWorktreeOptions) => window.xaide.worktree.create(opts),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['worktrees', data.workspaceId] })
    },
  })
}
```

The `tests/renderer/setup.ts` currently has this pattern for the `window.xaide` mock — add `tasks` alongside existing APIs.

- [ ] **Step 1: Add tasks mock to tests/renderer/setup.ts**

Open `tests/renderer/setup.ts`. In the `window.xaide` mock object, add:

```typescript
tasks: {
  list: vi.fn().mockResolvedValue([]),
  create: vi.fn().mockResolvedValue({ id: 'task-1', workspaceId: 'ws-1', title: 'T', sourceAdapter: 'manual', methodologyAdapter: null, prompt: '', status: 'pending', baseCommit: null, parallelGroupId: null, createdAt: '', updatedAt: '' }),
  update: vi.fn().mockResolvedValue({ id: 'task-1', workspaceId: 'ws-1', title: 'T', sourceAdapter: 'manual', methodologyAdapter: null, prompt: '', status: 'in_progress', baseCommit: null, parallelGroupId: null, createdAt: '', updatedAt: '' }),
  delete: vi.fn().mockResolvedValue(undefined),
},
```

- [ ] **Step 2: Implement useTasks.ts**

```typescript
// src/renderer/src/hooks/useTasks.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { CreateTaskInput, UpdateTaskInput } from '../../../preload/ipc-types'

export function useTasks(workspaceId: string | null) {
  return useQuery({
    queryKey: ['tasks', workspaceId],
    queryFn: () => window.xaide.tasks.list(workspaceId!),
    enabled: !!workspaceId,
  })
}

export function useCreateTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateTaskInput) => window.xaide.tasks.create(input),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['tasks', data.workspaceId] })
    },
  })
}

export function useUpdateTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateTaskInput }) =>
      window.xaide.tasks.update(id, input),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['tasks', data.workspaceId] })
    },
  })
}

export function useDeleteTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, workspaceId }: { id: string; workspaceId: string }) =>
      window.xaide.tasks.delete(id).then(() => ({ workspaceId })),
    onSuccess: ({ workspaceId }) => {
      qc.invalidateQueries({ queryKey: ['tasks', workspaceId] })
    },
  })
}
```

- [ ] **Step 3: Commit**

No dedicated test file for hooks (tested via component tests in Task 4). Commit now:

```bash
git add src/renderer/src/hooks/useTasks.ts tests/renderer/setup.ts
git commit -m "feat: add useTasks React Query hooks"
```

---

## Task 4: TaskList Component + LeftPanel Integration

**Files:**
- Create: `src/renderer/src/components/TaskList.tsx`
- Create: `tests/renderer/TaskList.test.tsx`
- Modify: `src/renderer/src/components/LeftPanel.tsx` — render `<TaskList>` at the bottom

### Background
The `LeftPanel` currently renders `<WorktreeList>` at the bottom when a workspace is active. Follow the same pattern for `TaskList`.

`WorktreeList` component structure for reference:
- Takes `workspaceId` and `repoPath` props
- Has its own section header + list + inline form

The existing status values for tasks: `'pending' | 'in_progress' | 'done' | 'blocked'`

Status badge colors:
- `pending` → `text-neutral-400`
- `in_progress` → `text-blue-400`
- `done` → `text-green-400`
- `blocked` → `text-red-400`

Status cycle (click to advance): `pending → in_progress → done → pending`

- [ ] **Step 1: Write the failing TaskList tests**

```typescript
// tests/renderer/TaskList.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TaskList } from '../../src/renderer/src/components/TaskList'

const mockTasks = [
  {
    id: 'task-1',
    workspaceId: 'ws-1',
    title: 'Fix login bug',
    sourceAdapter: 'manual',
    methodologyAdapter: null,
    prompt: 'Auth is broken',
    status: 'pending',
    baseCommit: null,
    parallelGroupId: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'task-2',
    workspaceId: 'ws-1',
    title: 'Add dark mode',
    sourceAdapter: 'manual',
    methodologyAdapter: null,
    prompt: '',
    status: 'done',
    baseCommit: null,
    parallelGroupId: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
]

function renderWithQuery(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(window.xaide.tasks.list).mockResolvedValue(mockTasks as any)
})

describe('TaskList', () => {
  it('renders task titles', async () => {
    renderWithQuery(<TaskList workspaceId="ws-1" />)
    expect(await screen.findByText('Fix login bug')).toBeDefined()
    expect(screen.getByText('Add dark mode')).toBeDefined()
  })

  it('shows status badges', async () => {
    renderWithQuery(<TaskList workspaceId="ws-1" />)
    await screen.findByText('Fix login bug')
    expect(screen.getByText('pending')).toBeDefined()
    expect(screen.getByText('done')).toBeDefined()
  })

  it('creates a task when form is submitted', async () => {
    vi.mocked(window.xaide.tasks.create).mockResolvedValue({
      id: 'task-3',
      workspaceId: 'ws-1',
      title: 'New task',
      sourceAdapter: 'manual',
      methodologyAdapter: null,
      prompt: '',
      status: 'pending',
      baseCommit: null,
      parallelGroupId: null,
      createdAt: '',
      updatedAt: '',
    } as any)
    renderWithQuery(<TaskList workspaceId="ws-1" />)
    await screen.findByText('Fix login bug')

    await userEvent.click(screen.getByRole('button', { name: /add task/i }))
    const input = screen.getByPlaceholderText(/task title/i)
    await userEvent.type(input, 'New task')
    await userEvent.keyboard('{Enter}')

    await waitFor(() => {
      expect(window.xaide.tasks.create).toHaveBeenCalledWith({
        workspaceId: 'ws-1',
        title: 'New task',
      })
    })
  })

  it('cycles task status on status badge click', async () => {
    vi.mocked(window.xaide.tasks.update).mockResolvedValue({
      ...mockTasks[0],
      status: 'in_progress',
    } as any)
    renderWithQuery(<TaskList workspaceId="ws-1" />)
    await screen.findByText('Fix login bug')

    await userEvent.click(screen.getByText('pending'))

    await waitFor(() => {
      expect(window.xaide.tasks.update).toHaveBeenCalledWith('task-1', { status: 'in_progress' })
    })
  })

  it('deletes a task on delete button click', async () => {
    vi.mocked(window.xaide.tasks.delete).mockResolvedValue(undefined)
    renderWithQuery(<TaskList workspaceId="ws-1" />)
    await screen.findByText('Fix login bug')

    const deleteButtons = screen.getAllByRole('button', { name: /delete/i })
    await userEvent.click(deleteButtons[0])

    await waitFor(() => {
      expect(window.xaide.tasks.delete).toHaveBeenCalledWith('task-1')
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
export PATH="/Users/jeff.williams/.vfox/cache/nodejs/v-22.22.2/nodejs-22.22.2/bin:$PATH"
npm run test:renderer -- --reporter=verbose tests/renderer/TaskList.test.tsx
```

Expected: FAIL — `Cannot find module '../../src/renderer/src/components/TaskList'`

- [ ] **Step 3: Implement TaskList.tsx**

```typescript
// src/renderer/src/components/TaskList.tsx
import { useState } from 'react'
import type { FC, KeyboardEvent } from 'react'
import { useTasks, useCreateTask, useUpdateTask, useDeleteTask } from '../hooks/useTasks'
import type { Task } from '../../../preload/ipc-types'

const STATUS_CYCLE: Record<Task['status'], Task['status']> = {
  pending: 'in_progress',
  in_progress: 'done',
  done: 'pending',
  blocked: 'pending',
}

const STATUS_COLOR: Record<Task['status'], string> = {
  pending: 'text-neutral-400',
  in_progress: 'text-blue-400',
  done: 'text-green-400',
  blocked: 'text-red-400',
}

interface Props {
  workspaceId: string
}

export const TaskList: FC<Props> = ({ workspaceId }) => {
  const { data: tasks = [], isLoading } = useTasks(workspaceId)
  const createTask = useCreateTask()
  const updateTask = useUpdateTask()
  const deleteTask = useDeleteTask()

  const [showForm, setShowForm] = useState(false)
  const [newTitle, setNewTitle] = useState('')

  const handleCreate = async () => {
    const title = newTitle.trim()
    if (!title) return
    await createTask.mutateAsync({ workspaceId, title })
    setNewTitle('')
    setShowForm(false)
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleCreate()
    if (e.key === 'Escape') {
      setShowForm(false)
      setNewTitle('')
    }
  }

  const handleStatusCycle = (task: Task) => {
    updateTask.mutate({ id: task.id, input: { status: STATUS_CYCLE[task.status] } })
  }

  const handleDelete = (task: Task) => {
    deleteTask.mutate({ id: task.id, workspaceId })
  }

  return (
    <div className="border-t border-neutral-800 flex flex-col">
      <div className="px-3 py-2 flex items-center justify-between">
        <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wider select-none">
          Tasks
        </span>
        <button
          type="button"
          aria-label="Add task"
          onClick={() => setShowForm(true)}
          className="text-neutral-500 hover:text-neutral-300 text-xs leading-none"
        >
          +
        </button>
      </div>

      {showForm && (
        <div className="px-3 pb-2">
          <input
            autoFocus
            type="text"
            placeholder="Task title…"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full bg-neutral-800 text-neutral-200 text-xs px-2 py-1 rounded outline-none focus:ring-1 focus:ring-neutral-600"
          />
        </div>
      )}

      {isLoading ? (
        <p className="px-3 py-1 text-xs text-neutral-600">Loading…</p>
      ) : tasks.length === 0 && !showForm ? (
        <p className="px-3 py-1 text-xs text-neutral-600 select-none">No tasks yet</p>
      ) : (
        <ul className="overflow-y-auto max-h-48">
          {tasks.map((task) => (
            <li
              key={task.id}
              className="group px-3 py-1 flex items-center gap-2 hover:bg-neutral-800"
            >
              <button
                type="button"
                onClick={() => handleStatusCycle(task)}
                className={`text-[10px] shrink-0 ${STATUS_COLOR[task.status as Task['status']]} hover:opacity-70`}
                title={`Status: ${task.status} (click to advance)`}
              >
                {task.status}
              </button>
              <span className="flex-1 text-xs text-neutral-300 truncate" title={task.title}>
                {task.title}
              </span>
              <button
                type="button"
                aria-label="Delete task"
                onClick={() => handleDelete(task)}
                className="opacity-0 group-hover:opacity-100 text-neutral-600 hover:text-red-400 text-xs leading-none"
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

- [ ] **Step 4: Add TaskList to LeftPanel**

Open `src/renderer/src/components/LeftPanel.tsx`. Add import:
```typescript
import { TaskList } from './TaskList'
```

After the closing `</WorktreeList>` block (or after the `{activeWorkspaceId && <WorktreeList ... />}` block), add:

```typescript
{activeWorkspaceId && (
  <TaskList workspaceId={activeWorkspaceId} />
)}
```

- [ ] **Step 5: Run renderer tests to verify they pass**

```bash
export PATH="/Users/jeff.williams/.vfox/cache/nodejs/v-22.22.2/nodejs-22.22.2/bin:$PATH"
npm run test:renderer -- --reporter=verbose tests/renderer/TaskList.test.tsx
```

Expected: 5/5 PASS

- [ ] **Step 6: Run all tests to confirm nothing is broken**

```bash
export PATH="/Users/jeff.williams/.vfox/cache/nodejs/v-22.22.2/nodejs-22.22.2/bin:$PATH"
npm test
```

Expected: all main tests pass (at least 68)

```bash
npm run test:renderer
```

Expected: all renderer tests pass (at least 41)

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/components/TaskList.tsx \
        src/renderer/src/components/LeftPanel.tsx \
        tests/renderer/TaskList.test.tsx
git commit -m "feat: TaskList component + LeftPanel integration"
```

---

## Self-Review

### Spec coverage
- ✅ List tasks per workspace — `TaskManager.list`, `task:list` IPC, `useTasks`, `TaskList` renders list
- ✅ Create task — `TaskManager.create`, `task:create` IPC, `useCreateTask`, inline form in `TaskList`
- ✅ Update task status — `TaskManager.update`, `task:update` IPC, `useUpdateTask`, status badge click cycles status
- ✅ Delete task — `TaskManager.delete`, `task:delete` IPC, `useDeleteTask`, × button per task
- ✅ Shown in LeftPanel — `TaskList` added to `LeftPanel.tsx`

### Placeholder scan
None found — all steps have complete code.

### Type consistency
- `Task` interface defined in `ipc-types.ts` and reused in `useTasks.ts` and `TaskList.tsx` ✅
- `CreateTaskInput`, `UpdateTaskInput` defined in `ipc-types.ts` and reused in hooks ✅
- `TaskManager` method signatures match IPC handler calls match hook calls ✅
- `STATUS_CYCLE` covers all 4 status values including `blocked` ✅
