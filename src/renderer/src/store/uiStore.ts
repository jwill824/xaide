import { create } from 'zustand'
import type { PaneNode } from '../types/layout'

export interface ShellSession {
  id: string
  workspaceId: string
  title: string
  cwd: string
}

export interface AgentSessionUiRecord {
  id: string
  ptySessionId: string
  agentId: string
  agentName: string
  branch: string
  worktreeId: string
  workspaceId: string
}

interface UiState {
  activeWorkspaceId: string | null
  sessions: ShellSession[]
  activeSessionIdByWorkspace: Record<string, string>
  layoutByWorkspace: Record<string, PaneNode>
  browserUrlByWorkspace: Record<string, string>
  browserVisibleByWorkspace: Record<string, boolean>
  activeWorktreeId: string | null
  agentSessions: AgentSessionUiRecord[]
  addAgentSession: (session: AgentSessionUiRecord) => void
  removeAgentSession: (id: string) => void

  setActiveWorkspace: (id: string | null) => void
  addSession: (session: ShellSession) => void
  removeSession: (id: string) => void
  setActiveSession: (workspaceId: string, sessionId: string) => void
  setLayout: (workspaceId: string, layout: PaneNode) => void
  setBrowserUrl: (workspaceId: string, url: string) => void
  toggleBrowser: (workspaceId: string) => void
  setActiveWorktree: (id: string | null) => void
}

export const useUiStore = create<UiState>((set) => ({
  activeWorkspaceId: null,
  sessions: [],
  activeSessionIdByWorkspace: {},
  layoutByWorkspace: {},
  browserUrlByWorkspace: {},
  browserVisibleByWorkspace: {},
  activeWorktreeId: null,
  agentSessions: [],

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

  setActiveWorktree: (id) => set({ activeWorktreeId: id }),

  addAgentSession: (session) =>
    set((state) => ({ agentSessions: [...state.agentSessions, session] })),

  removeAgentSession: (id) =>
    set((state) => ({ agentSessions: state.agentSessions.filter((s) => s.id !== id) })),
}))
