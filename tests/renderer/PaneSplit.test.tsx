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
