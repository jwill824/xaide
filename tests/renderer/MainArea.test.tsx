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
