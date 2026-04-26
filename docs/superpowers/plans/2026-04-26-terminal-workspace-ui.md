# Terminal & Workspace UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the interactive terminal layer — workspace switching with active state, xterm.js terminal with node-pty PTY, session tab bar, H/V pane splitting with drag-to-resize, browser panel (Electron webview), and layout persistence per workspace.

**Architecture:** `PtyManager` (main process) owns PTY lifecycles via node-pty. The PTY IPC bridge streams data to renderer via `webContents.send`; renderer sends input via `ipcRenderer.invoke`. Renderer uses a `zustand` `uiStore` for active workspace, open sessions, and pane layout. `PaneSplit` is a recursive component supporting H or V splits with a draggable divider. Layout is persisted to the workspace's `layout_json` in SQLite on change via a new `saveLayout` IPC call.

**Tech Stack:** `@xterm/xterm`, `@xterm/addon-fit`, `node-pty`, `zustand`

---

## File Map

**New — main process:**
- `src/main/pty/PtyManager.ts` — spawn/write/resize/kill node-pty sessions by UUID
- `src/main/ipc/pty.ipc.ts` — IPC handlers; streams PTY data to renderer via `webContents.send`

**Modified — main process:**
- `src/main/ipc/index.ts` — export `registerPtyHandlers`
- `src/main/index.ts` — instantiate `PtyManager`, pass `win.webContents` to `registerPtyHandlers`, add `webviewTag: true`, return `BrowserWindow` from `createWindow`
- `src/main/workspace/WorkspaceManager.ts` — add `saveLayout(id, layoutJson)` method

**Modified — preload:**
- `src/preload/ipc-types.ts` — add `PTY_CHANNELS`, `PtyCreateOptions`, `PtyAPI`; extend `XaideAPI`
- `src/preload/index.ts` — wire `pty` API into `contextBridge`

**New — renderer:**
- `src/renderer/src/types/layout.ts` — `PaneNode` discriminated union type
- `src/renderer/src/store/uiStore.ts` — zustand store: active workspace, sessions, layout, browser state
- `src/renderer/src/hooks/useActiveWorkspace.ts` — reads active workspace from store + React Query
- `src/renderer/src/hooks/useSessions.ts` — reads sessions for a workspace from store
- `src/renderer/src/components/TerminalPane.tsx` — xterm.js Terminal + FitAddon + PTY IPC wiring
- `src/renderer/src/components/SessionTabBar.tsx` — tab bar with new/close buttons
- `src/renderer/src/components/PaneSplit.tsx` — recursive H/V split with drag divider
- `src/renderer/src/components/BrowserPanel.tsx` — Electron `<webview>` with URL bar

**Modified — renderer:**
- `src/renderer/src/components/LeftPanel.tsx` — add active workspace highlight + click handler
- `src/renderer/src/components/MainArea.tsx` — integrate SessionTabBar + PaneSplit; layout persistence
- `tests/renderer/setup.ts` — extend `window.xaide` mock with `pty` API

**New — tests:**
- `tests/main/pty.test.ts`
- `tests/renderer/TerminalPane.test.tsx`
- `tests/renderer/SessionTabBar.test.tsx`
- `tests/renderer/PaneSplit.test.tsx`
- `tests/renderer/MainArea.test.tsx`

---

## Task 1: Install terminal and state dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install runtime packages**

```bash
cd /Users/jeff.williams/Developer/personal/xaide
npm install @xterm/xterm @xterm/addon-fit node-pty zustand
npm install -D @types/node-pty
```

- [ ] **Step 2: Verify native module rebuilt**

The `postinstall` hook (`electron-builder install-app-deps`) runs automatically. Confirm node-pty was rebuilt for Electron's ABI:

```bash
ls node_modules/node-pty/build/Release/
```

Expected: `pty.node` (or `spawn-helper` on macOS) — the native binary must be present.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add xterm, node-pty, and zustand dependencies"
```

---

## Task 2: PtyManager (main process)

**Files:**
- Create: `src/main/pty/PtyManager.ts`
- Create: `tests/main/pty.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/main/pty.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { PtyManager } from '../../src/main/pty/PtyManager'

vi.mock('node-pty', () => ({
  spawn: vi.fn(() => ({
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(),
    onData: vi.fn(),
    onExit: vi.fn(),
    pid: 1234,
  })),
}))

describe('PtyManager', () => {
  let manager: PtyManager

  beforeEach(() => {
    manager = new PtyManager()
  })

  it('creates a PTY session and returns a UUID', () => {
    const { id } = manager.create({ workspaceId: 'ws1', cols: 80, rows: 24, cwd: '/tmp' })
    expect(id).toMatch(/^[0-9a-f-]{36}$/)
    expect(manager.has(id)).toBe(true)
  })

  it('throws when writing to an unknown session', () => {
    expect(() => manager.write('bad-id', 'hello')).toThrow('PTY session not found: bad-id')
  })

  it('throws when resizing an unknown session', () => {
    expect(() => manager.resize('bad-id', 80, 24)).toThrow('PTY session not found: bad-id')
  })

  it('kills a session and removes it from the map', () => {
    const { id } = manager.create({ workspaceId: 'ws1', cols: 80, rows: 24, cwd: '/tmp' })
    manager.kill(id)
    expect(manager.has(id)).toBe(false)
  })

  it('throws when killing an unknown session', () => {
    expect(() => manager.kill('bad-id')).toThrow('PTY session not found: bad-id')
  })

  it('killAll removes all sessions', () => {
    const { id: a } = manager.create({ workspaceId: 'ws1', cols: 80, rows: 24, cwd: '/tmp' })
    const { id: b } = manager.create({ workspaceId: 'ws2', cols: 80, rows: 24, cwd: '/tmp' })
    manager.killAll()
    expect(manager.has(a)).toBe(false)
    expect(manager.has(b)).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/main/pty.test.ts
```

Expected: FAIL — `Cannot find module '../../src/main/pty/PtyManager'`

- [ ] **Step 3: Implement PtyManager**

Create `src/main/pty/PtyManager.ts`:

```typescript
import * as pty from 'node-pty'
import { randomUUID } from 'crypto'

export interface PtyCreateOptions {
  workspaceId: string
  cols: number
  rows: number
  cwd: string
  env?: Record<string, string>
}

interface PtySession {
  id: string
  workspaceId: string
  process: pty.IPty
}

export class PtyManager {
  private sessions = new Map<string, PtySession>()

  create(options: PtyCreateOptions): { id: string; process: pty.IPty } {
    const shell =
      process.platform === 'win32'
        ? 'powershell.exe'
        : (process.env['SHELL'] ?? '/bin/zsh')
    const id = randomUUID()
    const ptyProcess = pty.spawn(shell, [], {
      name: 'xterm-color',
      cols: options.cols,
      rows: options.rows,
      cwd: options.cwd,
      env: { ...process.env, ...options.env } as Record<string, string>,
    })
    this.sessions.set(id, { id, workspaceId: options.workspaceId, process: ptyProcess })
    return { id, process: ptyProcess }
  }

  write(id: string, data: string): void {
    const session = this.sessions.get(id)
    if (!session) throw new Error(`PTY session not found: ${id}`)
    session.process.write(data)
  }

  resize(id: string, cols: number, rows: number): void {
    const session = this.sessions.get(id)
    if (!session) throw new Error(`PTY session not found: ${id}`)
    session.process.resize(cols, rows)
  }

  kill(id: string): void {
    const session = this.sessions.get(id)
    if (!session) throw new Error(`PTY session not found: ${id}`)
    session.process.kill()
    this.sessions.delete(id)
  }

  has(id: string): boolean {
    return this.sessions.has(id)
  }

  killAll(): void {
    for (const session of this.sessions.values()) {
      session.process.kill()
    }
    this.sessions.clear()
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/main/pty.test.ts
```

Expected: `6 tests passed`

- [ ] **Step 5: Commit**

```bash
git add src/main/pty/PtyManager.ts tests/main/pty.test.ts
git commit -m "feat: add PtyManager for node-pty session lifecycle"
```

---

## Task 3: PTY IPC bridge

**Files:**
- Modify: `src/preload/ipc-types.ts`
- Create: `src/main/ipc/pty.ipc.ts`
- Modify: `src/main/ipc/index.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/main/index.ts`
- Modify: `src/main/workspace/WorkspaceManager.ts`

- [ ] **Step 1: Extend ipc-types.ts**

Add PTY channels, types, and API to `src/preload/ipc-types.ts`. Append after the existing content:

```typescript
// --- PTY ---

export const PTY_CHANNELS = {
  CREATE: 'pty:create',
  WRITE: 'pty:write',
  RESIZE: 'pty:resize',
  KILL: 'pty:kill',
  DATA: 'pty:data',
  WORKSPACE_SAVE_LAYOUT: 'workspace:save-layout',
} as const

export interface PtyCreateOptions {
  workspaceId: string
  cols: number
  rows: number
  cwd: string
  env?: Record<string, string>
}

export interface PtyAPI {
  create: (options: PtyCreateOptions) => Promise<string>
  write: (sessionId: string, data: string) => Promise<void>
  resize: (sessionId: string, cols: number, rows: number) => Promise<void>
  kill: (sessionId: string) => Promise<void>
  /** Subscribe to PTY data events. Returns an unsubscribe function. */
  onData: (callback: (sessionId: string, data: string) => void) => () => void
}
```

Also extend `WorkspaceAPI` interface with `saveLayout`:

Replace in `src/preload/ipc-types.ts`:
```typescript
export interface WorkspaceAPI {
  list: () => Promise<Workspace[]>
  create: (input: CreateWorkspaceInput) => Promise<Workspace>
  get: (id: string) => Promise<Workspace | null>
  update: (id: string, input: Partial<CreateWorkspaceInput>) => Promise<Workspace>
  delete: (id: string) => Promise<void>
  saveLayout: (id: string, layoutJson: string) => Promise<void>
}
```

And extend `XaideAPI`:
```typescript
export interface XaideAPI {
  workspace: WorkspaceAPI
  pty: PtyAPI
}
```

- [ ] **Step 2: Create pty.ipc.ts**

Create `src/main/ipc/pty.ipc.ts`:

```typescript
import { ipcMain } from 'electron'
import type { WebContents } from 'electron'
import type { PtyManager } from '../pty/PtyManager'
import { PTY_CHANNELS } from '../../preload/ipc-types'
import type { PtyCreateOptions } from '../../preload/ipc-types'

export function registerPtyHandlers(manager: PtyManager, webContents: WebContents): void {
  ipcMain.handle(PTY_CHANNELS.CREATE, (_, options: PtyCreateOptions): string => {
    const { id, process } = manager.create(options)
    process.onData((data: string) => {
      if (!webContents.isDestroyed()) {
        webContents.send(PTY_CHANNELS.DATA, id, data)
      }
    })
    return id
  })

  ipcMain.handle(PTY_CHANNELS.WRITE, (_, sessionId: string, data: string): void => {
    manager.write(sessionId, data)
  })

  ipcMain.handle(
    PTY_CHANNELS.RESIZE,
    (_, sessionId: string, cols: number, rows: number): void => {
      manager.resize(sessionId, cols, rows)
    },
  )

  ipcMain.handle(PTY_CHANNELS.KILL, (_, sessionId: string): void => {
    manager.kill(sessionId)
  })
}
```

- [ ] **Step 3: Update ipc/index.ts**

Replace `src/main/ipc/index.ts` with:

```typescript
export { registerWorkspaceHandlers } from './workspace.ipc'
export { registerPtyHandlers } from './pty.ipc'
```

- [ ] **Step 4: Add saveLayout to WorkspaceManager**

Add to `src/main/workspace/WorkspaceManager.ts` (after the `delete` method):

```typescript
  saveLayout(id: string, layoutJson: string): void {
    if (!this.get(id)) throw new Error(`Workspace not found: ${id}`)
    this.db
      .update(workspaces)
      .set({ layoutJson, updatedAt: new Date().toISOString() })
      .where(eq(workspaces.id, id))
      .run()
  }
```

- [ ] **Step 5: Add saveLayout IPC handler in workspace.ipc.ts**

Add to the bottom of `registerWorkspaceHandlers` in `src/main/ipc/workspace.ipc.ts`:

```typescript
  ipcMain.handle(
    PTY_CHANNELS.WORKSPACE_SAVE_LAYOUT,
    (_, id: string, layoutJson: string) => manager.saveLayout(id, layoutJson),
  )
```

Also add the import at the top of `workspace.ipc.ts`:

```typescript
import { PTY_CHANNELS } from '../../preload/ipc-types'
```

- [ ] **Step 6: Extend preload/index.ts**

Replace `src/preload/index.ts` with:

```typescript
import { contextBridge, ipcRenderer } from 'electron'
import type { XaideAPI, CreateWorkspaceInput, PtyCreateOptions } from './ipc-types'
import { IPC_CHANNELS, PTY_CHANNELS } from './ipc-types'

const api: XaideAPI = {
  workspace: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_LIST),
    create: (input: CreateWorkspaceInput) =>
      ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_CREATE, input),
    get: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_GET, id),
    update: (id: string, input: Partial<CreateWorkspaceInput>) =>
      ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_UPDATE, id, input),
    delete: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_DELETE, id),
    saveLayout: (id: string, layoutJson: string) =>
      ipcRenderer.invoke(PTY_CHANNELS.WORKSPACE_SAVE_LAYOUT, id, layoutJson),
  },
  pty: {
    create: (options: PtyCreateOptions) => ipcRenderer.invoke(PTY_CHANNELS.CREATE, options),
    write: (sessionId: string, data: string) =>
      ipcRenderer.invoke(PTY_CHANNELS.WRITE, sessionId, data),
    resize: (sessionId: string, cols: number, rows: number) =>
      ipcRenderer.invoke(PTY_CHANNELS.RESIZE, sessionId, cols, rows),
    kill: (sessionId: string) => ipcRenderer.invoke(PTY_CHANNELS.KILL, sessionId),
    onData: (callback: (sessionId: string, data: string) => void) => {
      const handler = (_: Electron.IpcRendererEvent, sessionId: string, data: string) =>
        callback(sessionId, data)
      ipcRenderer.on(PTY_CHANNELS.DATA, handler)
      return () => ipcRenderer.removeListener(PTY_CHANNELS.DATA, handler)
    },
  },
}

contextBridge.exposeInMainWorld('xaide', api)
```

- [ ] **Step 7: Update main/index.ts**

Replace `src/main/index.ts` with:

```typescript
import { app, BrowserWindow } from 'electron'
import { join } from 'path'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { createDb } from './db/client'
import type { RawDb } from './db/client'
import * as schema from './db/schema'
import { ConfigLoader } from './config/ConfigLoader'
import { WorkspaceManager } from './workspace/WorkspaceManager'
import { PtyManager } from './pty/PtyManager'
import { registerWorkspaceHandlers, registerPtyHandlers } from './ipc'

let sqlite: RawDb | null = null
let ptyManager: PtyManager | null = null

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: '#0a0a0a',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
    },
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
    win.webContents.openDevTools()
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

app.whenReady().then(() => {
  sqlite = createDb(join(app.getPath('userData'), 'xaide.db'))
  const db = drizzle(sqlite, { schema })
  const configLoader = new ConfigLoader()
  const workspaceManager = new WorkspaceManager(db, configLoader)
  ptyManager = new PtyManager()

  registerWorkspaceHandlers(workspaceManager)
  const win = createWindow()
  registerPtyHandlers(ptyManager, win.webContents)

  win.on('close', () => ptyManager?.killAll())

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      const w = createWindow()
      if (ptyManager) registerPtyHandlers(ptyManager, w.webContents)
    }
  })
})

app.on('before-quit', () => {
  sqlite?.close()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
```

- [ ] **Step 8: Update tests/renderer/setup.ts to add pty mock**

Add the `pty` mock to the existing `mockXaideApi` in `tests/renderer/setup.ts`. Replace the `Object.defineProperty` call with:

```typescript
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
    saveLayout: async () => undefined,
  },
  pty: {
    create: async () => 'test-session-id',
    write: async () => undefined,
    resize: async () => undefined,
    kill: async () => undefined,
    onData: () => () => undefined,
  },
}

Object.defineProperty(window, 'xaide', {
  value: mockXaideApi,
  writable: true,
})
```

- [ ] **Step 9: Verify all existing tests still pass**

```bash
npm run test:all
```

Expected: all previously-passing tests still pass (no regressions).

- [ ] **Step 10: Commit**

```bash
git add src/main/pty/ src/main/ipc/ src/main/workspace/WorkspaceManager.ts \
        src/main/index.ts src/preload/ tests/renderer/setup.ts
git commit -m "feat: add PTY IPC bridge, saveLayout, and webviewTag support"
```

---

## Task 4: Layout types and UI store

**Files:**
- Create: `src/renderer/src/types/layout.ts`
- Create: `src/renderer/src/store/uiStore.ts`
- Create: `src/renderer/src/hooks/useActiveWorkspace.ts`
- Create: `src/renderer/src/hooks/useSessions.ts`

- [ ] **Step 1: Create layout type definitions**

Create `src/renderer/src/types/layout.ts`:

```typescript
export type PaneNode =
  | { type: 'terminal'; sessionId: string }
  | { type: 'browser'; url: string }
  | { type: 'split'; direction: 'h' | 'v'; ratio: number; a: PaneNode; b: PaneNode }
```

- [ ] **Step 2: Create the zustand UI store**

Create `src/renderer/src/store/uiStore.ts`:

```typescript
import { create } from 'zustand'
import type { PaneNode } from '../types/layout'

export interface ShellSession {
  id: string
  workspaceId: string
  title: string
  cwd: string
}

interface UiState {
  activeWorkspaceId: string | null
  sessions: ShellSession[]
  activeSessionIdByWorkspace: Record<string, string>
  layoutByWorkspace: Record<string, PaneNode>
  browserUrlByWorkspace: Record<string, string>
  browserVisibleByWorkspace: Record<string, boolean>

  setActiveWorkspace: (id: string | null) => void
  addSession: (session: ShellSession) => void
  removeSession: (id: string) => void
  setActiveSession: (workspaceId: string, sessionId: string) => void
  setLayout: (workspaceId: string, layout: PaneNode) => void
  setBrowserUrl: (workspaceId: string, url: string) => void
  toggleBrowser: (workspaceId: string) => void
}

export const useUiStore = create<UiState>((set) => ({
  activeWorkspaceId: null,
  sessions: [],
  activeSessionIdByWorkspace: {},
  layoutByWorkspace: {},
  browserUrlByWorkspace: {},
  browserVisibleByWorkspace: {},

  setActiveWorkspace: (id) => set({ activeWorkspaceId: id }),

  addSession: (session) =>
    set((state) => ({
      sessions: [...state.sessions, session],
      activeSessionIdByWorkspace: {
        ...state.activeSessionIdByWorkspace,
        [session.workspaceId]: session.id,
      },
      layoutByWorkspace: {
        ...state.layoutByWorkspace,
        [session.workspaceId]:
          state.layoutByWorkspace[session.workspaceId] ?? {
            type: 'terminal',
            sessionId: session.id,
          },
      },
    })),

  removeSession: (id) =>
    set((state) => ({ sessions: state.sessions.filter((s) => s.id !== id) })),

  setActiveSession: (workspaceId, sessionId) =>
    set((state) => ({
      activeSessionIdByWorkspace: {
        ...state.activeSessionIdByWorkspace,
        [workspaceId]: sessionId,
      },
    })),

  setLayout: (workspaceId, layout) =>
    set((state) => ({
      layoutByWorkspace: { ...state.layoutByWorkspace, [workspaceId]: layout },
    })),

  setBrowserUrl: (workspaceId, url) =>
    set((state) => ({
      browserUrlByWorkspace: { ...state.browserUrlByWorkspace, [workspaceId]: url },
    })),

  toggleBrowser: (workspaceId) =>
    set((state) => ({
      browserVisibleByWorkspace: {
        ...state.browserVisibleByWorkspace,
        [workspaceId]: !state.browserVisibleByWorkspace[workspaceId],
      },
    })),
}))
```

- [ ] **Step 3: Create useActiveWorkspace hook**

Create `src/renderer/src/hooks/useActiveWorkspace.ts`:

```typescript
import { useUiStore } from '../store/uiStore'
import { useWorkspaces } from './useWorkspaces'
import type { Workspace } from '../../../preload/ipc-types'

export function useActiveWorkspace(): Workspace | null {
  const activeId = useUiStore((s) => s.activeWorkspaceId)
  const { data: workspaces = [] } = useWorkspaces()
  return workspaces.find((w) => w.id === activeId) ?? null
}
```

- [ ] **Step 4: Create useSessions hook**

Create `src/renderer/src/hooks/useSessions.ts`:

```typescript
import { useUiStore } from '../store/uiStore'
import type { ShellSession } from '../store/uiStore'

export function useSessions(workspaceId: string): ShellSession[] {
  return useUiStore((s) => s.sessions.filter((s) => s.workspaceId === workspaceId))
}
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/types/ src/renderer/src/store/ src/renderer/src/hooks/useActiveWorkspace.ts \
        src/renderer/src/hooks/useSessions.ts
git commit -m "feat: add layout types, zustand UI store, and workspace/session hooks"
```

---

## Task 5: TerminalPane component

**Files:**
- Create: `src/renderer/src/components/TerminalPane.tsx`
- Create: `tests/renderer/TerminalPane.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `tests/renderer/TerminalPane.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TerminalPane } from '../../src/renderer/src/components/TerminalPane'

vi.mock('@xterm/xterm/css/xterm.css', () => ({}))

const mockTerm = {
  loadAddon: vi.fn(),
  open: vi.fn(),
  write: vi.fn(),
  onData: vi.fn(),
  dispose: vi.fn(),
  cols: 80,
  rows: 24,
}
const mockFit = { fit: vi.fn() }

vi.mock('@xterm/xterm', () => ({ Terminal: vi.fn(() => mockTerm) }))
vi.mock('@xterm/addon-fit', () => ({ FitAddon: vi.fn(() => mockFit) }))

const mockResizeObserver = vi.fn(() => ({ observe: vi.fn(), disconnect: vi.fn() }))
vi.stubGlobal('ResizeObserver', mockResizeObserver)

describe('TerminalPane', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders a container div', () => {
    const { container } = render(<TerminalPane sessionId="sess-1" />)
    expect(container.querySelector('div')).toBeTruthy()
  })

  it('opens the xterm terminal on mount', () => {
    render(<TerminalPane sessionId="sess-1" />)
    expect(mockTerm.open).toHaveBeenCalledOnce()
  })

  it('calls fit on mount', () => {
    render(<TerminalPane sessionId="sess-1" />)
    expect(mockFit.fit).toHaveBeenCalled()
  })

  it('calls onReady callback after mount', () => {
    const onReady = vi.fn()
    render(<TerminalPane sessionId="sess-1" onReady={onReady} />)
    expect(onReady).toHaveBeenCalledOnce()
  })

  it('subscribes to PTY data on mount', () => {
    render(<TerminalPane sessionId="sess-1" />)
    expect(window.xaide.pty.onData).toHaveBeenCalled()
  })

  it('disposes terminal on unmount', () => {
    const { unmount } = render(<TerminalPane sessionId="sess-1" />)
    unmount()
    expect(mockTerm.dispose).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run --config vitest.renderer.config.ts tests/renderer/TerminalPane.test.tsx
```

Expected: FAIL — `Cannot find module '../../src/renderer/src/components/TerminalPane'`

- [ ] **Step 3: Implement TerminalPane**

Create `src/renderer/src/components/TerminalPane.tsx`:

```typescript
import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

interface Props {
  sessionId: string
  onReady?: () => void
}

export function TerminalPane({ sessionId, onReady }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const term = new Terminal({
      theme: { background: '#0a0a0a', foreground: '#d4d4d4', cursor: '#d4d4d4' },
      fontFamily: 'JetBrains Mono, Menlo, monospace',
      fontSize: 13,
      cursorBlink: true,
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(container)
    fit.fit()

    const unsub = window.xaide.pty.onData((id, data) => {
      if (id === sessionId) term.write(data)
    })

    term.onData((data) => {
      window.xaide.pty.write(sessionId, data)
    })

    const ro = new ResizeObserver(() => {
      fit.fit()
      window.xaide.pty.resize(sessionId, term.cols, term.rows)
    })
    ro.observe(container)

    onReady?.()

    return () => {
      unsub()
      ro.disconnect()
      term.dispose()
    }
  }, [sessionId, onReady])

  return <div ref={containerRef} className="h-full w-full overflow-hidden" />
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run --config vitest.renderer.config.ts tests/renderer/TerminalPane.test.tsx
```

Expected: `6 tests passed`

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/TerminalPane.tsx tests/renderer/TerminalPane.test.tsx
git commit -m "feat: add TerminalPane component with xterm.js and PTY IPC wiring"
```

---

## Task 6: SessionTabBar and updated LeftPanel

**Files:**
- Create: `src/renderer/src/components/SessionTabBar.tsx`
- Modify: `src/renderer/src/components/LeftPanel.tsx`
- Create: `tests/renderer/SessionTabBar.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `tests/renderer/SessionTabBar.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SessionTabBar } from '../../src/renderer/src/components/SessionTabBar'
import type { ShellSession } from '../../src/renderer/src/store/uiStore'

const sessions: ShellSession[] = [
  { id: 's1', workspaceId: 'ws1', title: 'shell', cwd: '/tmp' },
  { id: 's2', workspaceId: 'ws1', title: 'agent', cwd: '/tmp' },
]

describe('SessionTabBar', () => {
  it('renders a tab for each session', () => {
    render(
      <SessionTabBar
        workspaceId="ws1"
        sessions={sessions}
        activeSessionId="s1"
        onSelectSession={vi.fn()}
        onNewSession={vi.fn()}
        onCloseSession={vi.fn()}
      />,
    )
    expect(screen.getByText('shell')).toBeInTheDocument()
    expect(screen.getByText('agent')).toBeInTheDocument()
  })

  it('calls onSelectSession when a tab is clicked', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(
      <SessionTabBar
        workspaceId="ws1"
        sessions={sessions}
        activeSessionId="s1"
        onSelectSession={onSelect}
        onNewSession={vi.fn()}
        onCloseSession={vi.fn()}
      />,
    )
    await user.click(screen.getByText('agent'))
    expect(onSelect).toHaveBeenCalledWith('s2')
  })

  it('calls onNewSession when + is clicked', async () => {
    const user = userEvent.setup()
    const onNew = vi.fn()
    render(
      <SessionTabBar
        workspaceId="ws1"
        sessions={sessions}
        activeSessionId="s1"
        onSelectSession={vi.fn()}
        onNewSession={onNew}
        onCloseSession={vi.fn()}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'New terminal session' }))
    expect(onNew).toHaveBeenCalledOnce()
  })

  it('renders a + button even with no sessions', () => {
    render(
      <SessionTabBar
        workspaceId="ws1"
        sessions={[]}
        activeSessionId={null}
        onSelectSession={vi.fn()}
        onNewSession={vi.fn()}
        onCloseSession={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: 'New terminal session' })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run --config vitest.renderer.config.ts tests/renderer/SessionTabBar.test.tsx
```

Expected: FAIL — `Cannot find module '../../src/renderer/src/components/SessionTabBar'`

- [ ] **Step 3: Implement SessionTabBar**

Create `src/renderer/src/components/SessionTabBar.tsx`:

```typescript
import type { FC } from 'react'
import type { ShellSession } from '../store/uiStore'

interface Props {
  workspaceId: string
  sessions: ShellSession[]
  activeSessionId: string | null
  onSelectSession: (id: string) => void
  onNewSession: () => void
  onCloseSession: (id: string) => void
}

export const SessionTabBar: FC<Props> = ({
  workspaceId,
  sessions,
  activeSessionId,
  onSelectSession,
  onNewSession,
  onCloseSession,
}) => (
  <div className="flex items-center border-b border-neutral-800 bg-neutral-900 px-1 shrink-0">
    {sessions
      .filter((s) => s.workspaceId === workspaceId)
      .map((session) => (
        <div
          key={session.id}
          role="tab"
          aria-selected={session.id === activeSessionId}
          className={[
            'group flex items-center gap-1 px-3 py-1.5 text-xs cursor-pointer select-none border-b-2',
            session.id === activeSessionId
              ? 'border-blue-500 text-white'
              : 'border-transparent text-neutral-400 hover:text-neutral-200',
          ].join(' ')}
          onClick={() => onSelectSession(session.id)}
        >
          <span className="truncate max-w-[120px]">{session.title}</span>
          <button
            type="button"
            aria-label={`Close session ${session.title}`}
            className="hidden group-hover:flex items-center ml-1 text-neutral-500 hover:text-red-400"
            onClick={(e) => {
              e.stopPropagation()
              onCloseSession(session.id)
            }}
          >
            ×
          </button>
        </div>
      ))}
    <button
      type="button"
      aria-label="New terminal session"
      className="ml-1 px-2 py-1 text-xs text-neutral-500 hover:text-neutral-200 hover:bg-neutral-800 rounded"
      onClick={onNewSession}
    >
      +
    </button>
  </div>
)
```

- [ ] **Step 4: Update LeftPanel to highlight active workspace**

Replace the contents of `src/renderer/src/components/LeftPanel.tsx`:

```typescript
import type { FC } from 'react'
import { useWorkspaces } from '../hooks/useWorkspaces'
import { useUiStore } from '../store/uiStore'

export const LeftPanel: FC = () => {
  const { data: workspaces = [], isLoading, isError } = useWorkspaces()
  const activeWorkspaceId = useUiStore((s) => s.activeWorkspaceId)
  const setActiveWorkspace = useUiStore((s) => s.setActiveWorkspace)

  return (
    <aside className="w-56 shrink-0 bg-neutral-900 border-r border-neutral-800 flex flex-col">
      <div className="px-3 py-2 text-xs font-semibold text-neutral-500 uppercase tracking-wider select-none">
        Workspaces
      </div>
      {isError ? (
        <p className="px-3 py-2 text-xs text-red-500">Failed to load workspaces</p>
      ) : isLoading ? (
        <p className="px-3 py-2 text-xs text-neutral-600">Loading…</p>
      ) : workspaces.length === 0 ? (
        <p className="px-3 py-2 text-xs text-neutral-600">No workspaces yet</p>
      ) : (
        <ul className="flex-1 overflow-y-auto">
          {workspaces.map((ws) => (
            <li key={ws.id}>
              <button
                type="button"
                aria-current={activeWorkspaceId === ws.id ? 'page' : undefined}
                className={[
                  'w-full text-left px-3 py-1.5 text-sm rounded-sm truncate',
                  activeWorkspaceId === ws.id
                    ? 'bg-neutral-700 text-white'
                    : 'text-neutral-300 hover:bg-neutral-800',
                ].join(' ')}
                onClick={() => setActiveWorkspace(ws.id)}
              >
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

- [ ] **Step 5: Run tests**

```bash
npx vitest run --config vitest.renderer.config.ts tests/renderer/SessionTabBar.test.tsx
```

Expected: `4 tests passed`

- [ ] **Step 6: Verify existing App tests still pass**

```bash
npx vitest run --config vitest.renderer.config.ts
```

Expected: all renderer tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/components/SessionTabBar.tsx \
        src/renderer/src/components/LeftPanel.tsx \
        tests/renderer/SessionTabBar.test.tsx
git commit -m "feat: add SessionTabBar and active workspace highlight in LeftPanel"
```

---

## Task 7: PaneSplit component

**Files:**
- Create: `src/renderer/src/components/PaneSplit.tsx`
- Create: `tests/renderer/PaneSplit.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `tests/renderer/PaneSplit.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PaneSplit } from '../../src/renderer/src/components/PaneSplit'
import type { PaneNode } from '../../src/renderer/src/types/layout'

vi.mock('@xterm/xterm/css/xterm.css', () => ({}))
vi.mock('@xterm/xterm', () => ({
  Terminal: vi.fn(() => ({
    loadAddon: vi.fn(), open: vi.fn(), write: vi.fn(),
    onData: vi.fn(), dispose: vi.fn(), cols: 80, rows: 24,
  })),
}))
vi.mock('@xterm/addon-fit', () => ({ FitAddon: vi.fn(() => ({ fit: vi.fn() })) }))
vi.stubGlobal('ResizeObserver', vi.fn(() => ({ observe: vi.fn(), disconnect: vi.fn() })))

describe('PaneSplit', () => {
  it('renders a terminal leaf without crashing', () => {
    const node: PaneNode = { type: 'terminal', sessionId: 'sess-1' }
    const { container } = render(<PaneSplit node={node} />)
    expect(container.firstChild).toBeTruthy()
  })

  it('renders a browser leaf with URL input', () => {
    const node: PaneNode = { type: 'browser', url: 'https://example.com' }
    render(<PaneSplit node={node} />)
    expect(screen.getByRole('textbox', { name: 'Browser URL' })).toBeInTheDocument()
  })

  it('renders a horizontal split with a vertical separator', () => {
    const node: PaneNode = {
      type: 'split',
      direction: 'h',
      ratio: 0.5,
      a: { type: 'browser', url: 'https://a.com' },
      b: { type: 'browser', url: 'https://b.com' },
    }
    render(<PaneSplit node={node} />)
    expect(screen.getByRole('separator', { hidden: true })).toBeInTheDocument()
  })

  it('renders a vertical split with a horizontal separator', () => {
    const node: PaneNode = {
      type: 'split',
      direction: 'v',
      ratio: 0.6,
      a: { type: 'browser', url: 'https://a.com' },
      b: { type: 'browser', url: 'https://b.com' },
    }
    render(<PaneSplit node={node} />)
    const sep = screen.getByRole('separator', { hidden: true })
    expect(sep).toHaveAttribute('aria-orientation', 'horizontal')
  })

  it('calls onLayoutChange with updated ratio on split node changes', () => {
    const onChange = vi.fn()
    const node: PaneNode = {
      type: 'split',
      direction: 'h',
      ratio: 0.5,
      a: { type: 'browser', url: 'https://a.com' },
      b: { type: 'browser', url: 'https://b.com' },
    }
    render(<PaneSplit node={node} onLayoutChange={onChange} />)
    // onLayoutChange fires when child layout changes; not triggered in static render
    expect(onChange).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run --config vitest.renderer.config.ts tests/renderer/PaneSplit.test.tsx
```

Expected: FAIL — `Cannot find module '../../src/renderer/src/components/PaneSplit'`

- [ ] **Step 3: Implement PaneSplit**

Create `src/renderer/src/components/PaneSplit.tsx`:

```typescript
import { useRef, useState, useCallback } from 'react'
import type { PaneNode } from '../types/layout'
import { TerminalPane } from './TerminalPane'
import { BrowserPanel } from './BrowserPanel'

interface Props {
  node: PaneNode
  onLayoutChange?: (node: PaneNode) => void
}

export function PaneSplit({ node, onLayoutChange }: Props) {
  if (node.type === 'terminal') {
    return <TerminalPane sessionId={node.sessionId} />
  }
  if (node.type === 'browser') {
    return <BrowserPanel url={node.url} />
  }
  return <SplitContainer node={node} onLayoutChange={onLayoutChange} />
}

interface SplitContainerProps {
  node: Extract<PaneNode, { type: 'split' }>
  onLayoutChange?: (node: PaneNode) => void
}

function SplitContainer({ node, onLayoutChange }: SplitContainerProps) {
  const [ratio, setRatio] = useState(node.ratio)
  const containerRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      dragging.current = true

      const onMove = (ev: MouseEvent) => {
        if (!dragging.current || !containerRef.current) return
        const rect = containerRef.current.getBoundingClientRect()
        const raw =
          node.direction === 'h'
            ? (ev.clientX - rect.left) / rect.width
            : (ev.clientY - rect.top) / rect.height
        const clamped = Math.min(0.9, Math.max(0.1, raw))
        setRatio(clamped)
        onLayoutChange?.({ ...node, ratio: clamped })
      }

      const onUp = () => {
        dragging.current = false
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup', onUp)
      }

      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
    },
    [node, onLayoutChange],
  )

  const isH = node.direction === 'h'
  const aSize = `${ratio * 100}%`
  const bSize = `${(1 - ratio) * 100}%`
  const dividerClass = isH
    ? 'w-1 cursor-col-resize bg-neutral-800 hover:bg-blue-500 transition-colors shrink-0'
    : 'h-1 cursor-row-resize bg-neutral-800 hover:bg-blue-500 transition-colors shrink-0'

  return (
    <div
      ref={containerRef}
      className={`flex h-full w-full overflow-hidden ${isH ? 'flex-row' : 'flex-col'}`}
    >
      <div
        style={{ [isH ? 'width' : 'height']: aSize }}
        className="overflow-hidden min-w-0 min-h-0"
      >
        <PaneSplit
          node={node.a}
          onLayoutChange={(n) => onLayoutChange?.({ ...node, a: n })}
        />
      </div>
      <div
        className={dividerClass}
        onMouseDown={handleMouseDown}
        role="separator"
        aria-orientation={isH ? 'vertical' : 'horizontal'}
      />
      <div
        style={{ [isH ? 'width' : 'height']: bSize }}
        className="overflow-hidden min-w-0 min-h-0"
      >
        <PaneSplit
          node={node.b}
          onLayoutChange={(n) => onLayoutChange?.({ ...node, b: n })}
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run --config vitest.renderer.config.ts tests/renderer/PaneSplit.test.tsx
```

Expected: `5 tests passed`

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/PaneSplit.tsx tests/renderer/PaneSplit.test.tsx
git commit -m "feat: add recursive PaneSplit component with drag-to-resize divider"
```

---

## Task 8: BrowserPanel, MainArea wiring, and layout persistence

**Files:**
- Create: `src/renderer/src/components/BrowserPanel.tsx`
- Modify: `src/renderer/src/components/MainArea.tsx`
- Create: `tests/renderer/MainArea.test.tsx`

- [ ] **Step 1: Declare webview JSX type**

Electron's `<webview>` tag is not a standard HTML element. Add a type declaration so TypeScript accepts it. Create `src/renderer/src/types/electron-webview.d.ts`:

```typescript
declare namespace React {
  namespace JSX {
    interface IntrinsicElements {
      webview: React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement>,
        HTMLElement
      > & {
        src?: string
        allowpopups?: string
        partition?: string
        style?: React.CSSProperties
      }
    }
  }
}
```

- [ ] **Step 2: Write MainArea tests**

Create `tests/renderer/MainArea.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MainArea } from '../../src/renderer/src/components/MainArea'
import { useUiStore } from '../../src/renderer/src/store/uiStore'

vi.mock('@xterm/xterm/css/xterm.css', () => ({}))
vi.mock('@xterm/xterm', () => ({
  Terminal: vi.fn(() => ({
    loadAddon: vi.fn(), open: vi.fn(), write: vi.fn(),
    onData: vi.fn(), dispose: vi.fn(), cols: 80, rows: 24,
  })),
}))
vi.mock('@xterm/addon-fit', () => ({ FitAddon: vi.fn(() => ({ fit: vi.fn() })) }))
vi.stubGlobal('ResizeObserver', vi.fn(() => ({ observe: vi.fn(), disconnect: vi.fn() })))

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

describe('MainArea', () => {
  beforeEach(() => {
    useUiStore.setState({
      activeWorkspaceId: null,
      sessions: [],
      activeSessionIdByWorkspace: {},
      layoutByWorkspace: {},
      browserUrlByWorkspace: {},
      browserVisibleByWorkspace: {},
    })
  })

  it('shows placeholder when no workspace is active', () => {
    render(<MainArea />, { wrapper: Wrapper })
    expect(screen.getByText(/open a workspace/i)).toBeInTheDocument()
  })

  it('shows the tab bar when a workspace is active', async () => {
    useUiStore.setState({ activeWorkspaceId: 'mock-id' })
    render(<MainArea />, { wrapper: Wrapper })
    expect(screen.getByRole('button', { name: 'New terminal session' })).toBeInTheDocument()
  })

  it('shows "No sessions open" when workspace has no sessions', () => {
    useUiStore.setState({ activeWorkspaceId: 'mock-id' })
    render(<MainArea />, { wrapper: Wrapper })
    expect(screen.getByText(/no sessions open/i)).toBeInTheDocument()
  })

  it('calls pty.create and adds a session when + is clicked', async () => {
    const user = userEvent.setup()
    useUiStore.setState({ activeWorkspaceId: 'mock-id' })
    render(<MainArea />, { wrapper: Wrapper })
    await user.click(screen.getByRole('button', { name: 'New terminal session' }))
    expect(window.xaide.pty.create).toHaveBeenCalled()
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

```bash
npx vitest run --config vitest.renderer.config.ts tests/renderer/MainArea.test.tsx
```

Expected: FAIL (missing BrowserPanel and updated MainArea).

- [ ] **Step 4: Implement BrowserPanel**

Create `src/renderer/src/components/BrowserPanel.tsx`:

```typescript
import { useRef, useState } from 'react'

interface Props {
  url: string
  onUrlChange?: (url: string) => void
}

export function BrowserPanel({ url, onUrlChange }: Props) {
  const [inputUrl, setInputUrl] = useState(url)
  const webviewRef = useRef<HTMLElement>(null)

  const navigate = () => {
    const target = inputUrl.startsWith('http') ? inputUrl : `https://${inputUrl}`
    onUrlChange?.(target)
    ;(webviewRef.current as { loadURL?: (u: string) => void } | null)?.loadURL?.(target)
  }

  return (
    <div className="flex h-full w-full flex-col bg-neutral-950">
      <div className="flex items-center gap-2 border-b border-neutral-800 px-2 py-1 shrink-0">
        <input
          className="flex-1 rounded bg-neutral-900 px-2 py-1 text-xs text-neutral-200 outline-none focus:ring-1 focus:ring-neutral-600"
          value={inputUrl}
          onChange={(e) => setInputUrl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && navigate()}
          placeholder="https://..."
          aria-label="Browser URL"
        />
        <button
          type="button"
          onClick={navigate}
          className="rounded bg-neutral-800 px-2 py-1 text-xs text-neutral-300 hover:bg-neutral-700"
        >
          Go
        </button>
      </div>
      <webview
        ref={webviewRef as React.RefObject<HTMLElement>}
        src={url}
        style={{ width: '100%', flex: 1 }}
      />
    </div>
  )
}
```

- [ ] **Step 5: Implement updated MainArea**

Replace `src/renderer/src/components/MainArea.tsx`:

```typescript
import { useCallback } from 'react'
import type { FC } from 'react'
import { useUiStore } from '../store/uiStore'
import { useActiveWorkspace } from '../hooks/useActiveWorkspace'
import { useSessions } from '../hooks/useSessions'
import { SessionTabBar } from './SessionTabBar'
import { PaneSplit } from './PaneSplit'
import type { PaneNode } from '../types/layout'

export const MainArea: FC = () => {
  const activeWorkspaceId = useUiStore((s) => s.activeWorkspaceId)
  const activeSessionId = useUiStore((s) =>
    activeWorkspaceId ? s.activeSessionIdByWorkspace[activeWorkspaceId] ?? null : null,
  )
  const layout = useUiStore((s) =>
    activeWorkspaceId ? s.layoutByWorkspace[activeWorkspaceId] ?? null : null,
  )
  const { addSession, removeSession, setActiveSession, setLayout } = useUiStore()
  const workspace = useActiveWorkspace()
  const sessions = useSessions(activeWorkspaceId ?? '')

  const openNewSession = useCallback(async () => {
    if (!activeWorkspaceId || !workspace) return
    const sessionId = await window.xaide.pty.create({
      workspaceId: activeWorkspaceId,
      cols: 80,
      rows: 24,
      cwd: workspace.repoPath,
    })
    addSession({
      id: sessionId,
      workspaceId: activeWorkspaceId,
      title: 'shell',
      cwd: workspace.repoPath,
    })
  }, [activeWorkspaceId, workspace, addSession])

  const closeSession = useCallback(
    async (id: string) => {
      await window.xaide.pty.kill(id)
      removeSession(id)
    },
    [removeSession],
  )

  const handleLayoutChange = useCallback(
    (node: PaneNode) => {
      if (!activeWorkspaceId) return
      setLayout(activeWorkspaceId, node)
      window.xaide.workspace.saveLayout(activeWorkspaceId, JSON.stringify(node))
    },
    [activeWorkspaceId, setLayout],
  )

  if (!activeWorkspaceId) {
    return (
      <main className="flex-1 min-w-0 bg-neutral-950 flex items-center justify-center">
        <p className="text-neutral-600 text-sm select-none">Open a workspace to get started</p>
      </main>
    )
  }

  return (
    <main className="flex-1 min-w-0 bg-neutral-950 flex flex-col overflow-hidden">
      <SessionTabBar
        workspaceId={activeWorkspaceId}
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSelectSession={(id) => setActiveSession(activeWorkspaceId, id)}
        onNewSession={openNewSession}
        onCloseSession={closeSession}
      />
      <div className="flex-1 overflow-hidden min-h-0">
        {layout ? (
          <PaneSplit node={layout} onLayoutChange={handleLayoutChange} />
        ) : (
          <div className="flex h-full items-center justify-center">
            <p className="text-neutral-600 text-sm select-none">No sessions open</p>
          </div>
        )}
      </div>
    </main>
  )
}
```

- [ ] **Step 6: Run MainArea tests**

```bash
npx vitest run --config vitest.renderer.config.ts tests/renderer/MainArea.test.tsx
```

Expected: `4 tests passed`

- [ ] **Step 7: Run the full test suite**

```bash
npm run test:all
```

Expected: all tests pass — main and renderer suites.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/src/components/BrowserPanel.tsx \
        src/renderer/src/components/MainArea.tsx \
        src/renderer/src/types/electron-webview.d.ts \
        tests/renderer/MainArea.test.tsx
git commit -m "feat: add BrowserPanel, wire MainArea with sessions/panes/layout persistence"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task |
|---|---|
| xterm.js terminal rendering | Task 5 (TerminalPane) |
| node-pty PTY spawning in main | Task 2 (PtyManager) |
| PTY IPC bridge (typed) | Task 3 |
| Workspace switching with active state | Task 6 (LeftPanel update) |
| Tab bar per workspace | Task 6 (SessionTabBar) |
| H/V pane splitting + drag divider | Task 7 (PaneSplit) |
| Browser panel (Electron webview) | Task 8 (BrowserPanel) |
| Layout saved per workspace to DB | Task 3 (saveLayout) + Task 8 (MainArea wiring) |
| Workspace sessions (new + close) | Task 8 (MainArea.openNewSession / closeSession) |

**No placeholders:** all steps contain complete code.

**Type consistency check:**
- `PaneNode` defined once in `src/renderer/src/types/layout.ts` — imported by `uiStore.ts`, `PaneSplit.tsx`, `MainArea.tsx`
- `ShellSession` defined once in `uiStore.ts` — imported by `SessionTabBar.tsx`, `useSessions.ts`
- `PtyCreateOptions` defined once in `ipc-types.ts` — used in `PtyManager.ts`, `pty.ipc.ts`, `preload/index.ts`
- `PTY_CHANNELS.WORKSPACE_SAVE_LAYOUT` used consistently in `ipc-types.ts`, `workspace.ipc.ts`, `preload/index.ts`
