import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { GitPanel } from '../../../src/renderer/src/components/GitPanel'
import { useGitStore } from '../../../src/renderer/src/store/gitStore'

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

describe('GitPanel', () => {
  beforeEach(() => {
    useGitStore.setState({
      activeWorktreeId: null,
      selectedFile: null,
      status: null,
      currentDiff: null,
      commitMessage: '',
      commitLog: null,
      stagedForCommit: [],
      isLoadingStatus: false,
      isLoadingDiff: false,
      isLoadingLog: false,
      isCommitting: false,
      diffStaged: false,
    })
    vi.mocked(window.xaide.worktree.list).mockResolvedValue([])
    vi.mocked(window.xaide.git.status).mockResolvedValue(null)
  })

  it('renders worktree selector', () => {
    render(<GitPanel />, { wrapper })
    expect(screen.getByText('Worktree:')).toBeInTheDocument()
  })

  it('renders file list, diff viewer, and commit form', () => {
    render(<GitPanel />, { wrapper })
    expect(screen.getByText(/Select a file/i)).toBeInTheDocument()
  })

  it('displays "No status available" when no worktree selected', () => {
    render(<GitPanel />, { wrapper })
    expect(screen.getByText(/No status available/i)).toBeInTheDocument()
  })

  it('renders recent commits section', () => {
    render(<GitPanel />, { wrapper })
    expect(screen.getByText(/Recent Commits/i)).toBeInTheDocument()
  })
})
