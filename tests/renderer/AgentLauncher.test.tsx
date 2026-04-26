import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

  it('does not select a non-installed agent when clicked', async () => {
    render(<AgentLauncher worktrees={mockWorktrees} onLaunch={onLaunch} onClose={onClose} />, { wrapper })
    await waitFor(() => screen.getByText('GitHub Copilot'))

    const copilotButton = screen.getByText('GitHub Copilot').closest('button')
    await userEvent.click(copilotButton!)

    expect(screen.getByText('Launch')).toBeDisabled()
  })
})
