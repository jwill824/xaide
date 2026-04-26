import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WorktreeList } from '../../src/renderer/src/components/WorktreeList'
import { useUiStore } from '../../src/renderer/src/store/uiStore'

const MOCK_WT = {
  id: 'wt-1',
  workspaceId: 'ws-1',
  repoPath: '/repo',
  branch: 'xaide/feature-abc12345',
  baseBranch: 'HEAD',
  worktreePath: '/home/.xaide/worktrees/ws-1/xaide-feature-abc12345',
  status: 'active' as const,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

describe('WorktreeList', () => {
  beforeEach(() => {
    useUiStore.setState({ activeWorktreeId: null })
    vi.mocked(window.xaide.worktree.list).mockResolvedValue([MOCK_WT])
  })

  it('renders loading state initially', () => {
    render(<WorktreeList workspaceId="ws-1" repoPath="/repo" />, { wrapper })
    expect(screen.getByText(/loading/i)).toBeInTheDocument()
  })

  it('renders worktree branch name after load', async () => {
    render(<WorktreeList workspaceId="ws-1" repoPath="/repo" />, { wrapper })
    await waitFor(() => expect(screen.getByText('xaide/feature-abc12345')).toBeInTheDocument())
  })

  it('renders empty state when no worktrees', async () => {
    vi.mocked(window.xaide.worktree.list).mockResolvedValue([])
    render(<WorktreeList workspaceId="ws-1" repoPath="/repo" />, { wrapper })
    await waitFor(() => expect(screen.getByText(/no worktrees/i)).toBeInTheDocument())
  })

  it('calls create and refetches on New button click', async () => {
    render(<WorktreeList workspaceId="ws-1" repoPath="/repo" />, { wrapper })
    await waitFor(() => screen.getByText('xaide/feature-abc12345'))
    fireEvent.click(screen.getByRole('button', { name: /new worktree/i }))
    await waitFor(() => expect(window.xaide.worktree.create).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: 'ws-1', repoPath: '/repo' }),
    ))
  })

  it('sets activeWorktreeId on worktree item click', async () => {
    render(<WorktreeList workspaceId="ws-1" repoPath="/repo" />, { wrapper })
    await waitFor(() => screen.getByText('xaide/feature-abc12345'))
    fireEvent.click(screen.getByText('xaide/feature-abc12345'))
    expect(useUiStore.getState().activeWorktreeId).toBe('wt-1')
  })
})