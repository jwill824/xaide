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
}
)
