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
