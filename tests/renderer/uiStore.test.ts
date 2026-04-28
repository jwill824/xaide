import { describe, it, expect, beforeEach } from 'vitest'
import { useUiStore } from '../../src/renderer/src/store/uiStore'

const s1 = { id: 's1', workspaceId: 'ws1', title: 'shell', cwd: '/tmp' }
const s2 = { id: 's2', workspaceId: 'ws1', title: 'agent', cwd: '/tmp' }

describe('uiStore — removeSession', () => {
  beforeEach(() => {
    useUiStore.setState({
      sessions: [s1, s2],
      activeSessionIdByWorkspace: { ws1: 's1' },
      layoutByWorkspace: { ws1: { type: 'terminal', sessionId: 's1' } },
      browserUrlByWorkspace: {},
      browserVisibleByWorkspace: {},
    })
  })

  it('removing active session falls back to sibling', () => {
    useUiStore.getState().removeSession('s1')
    const state = useUiStore.getState()
    expect(state.sessions.map((s) => s.id)).toEqual(['s2'])
    expect(state.activeSessionIdByWorkspace['ws1']).toBe('s2')
  })

  it('removing active session with no sibling deletes the workspace key', () => {
    useUiStore.setState({ sessions: [s1], activeSessionIdByWorkspace: { ws1: 's1' } })
    useUiStore.getState().removeSession('s1')
    const state = useUiStore.getState()
    expect(state.sessions).toHaveLength(0)
    expect(state.activeSessionIdByWorkspace['ws1']).toBeUndefined()
  })

  it('removing active session with no sibling also clears layout', () => {
    useUiStore.setState({
      sessions: [s1],
      activeSessionIdByWorkspace: { ws1: 's1' },
      layoutByWorkspace: { ws1: { type: 'terminal', sessionId: 's1' } },
    })
    useUiStore.getState().removeSession('s1')
    expect(useUiStore.getState().layoutByWorkspace['ws1']).toBeUndefined()
  })

  it('removing non-active session does not change active pointer', () => {
    useUiStore.getState().removeSession('s2')
    expect(useUiStore.getState().activeSessionIdByWorkspace['ws1']).toBe('s1')
  })
})
