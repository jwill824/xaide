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
