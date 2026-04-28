import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AgentConfigSection } from '../../src/renderer/src/components/AgentConfigSection'

function renderWithQuery(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('AgentConfigSection', () => {
  it('renders Claude config section heading', () => {
    renderWithQuery(<AgentConfigSection workspaceId={null} />)
    expect(screen.getByText(/Claude \(CLAUDE\.md\)/i)).toBeInTheDocument()
  })

  it('renders Copilot config section heading', () => {
    renderWithQuery(<AgentConfigSection workspaceId={null} />)
    expect(screen.getByText(/GitHub Copilot/i)).toBeInTheDocument()
  })

  it('loads and displays Claude managed content', async () => {
    vi.mocked(window.xaide.settings.readClaudeConfig).mockResolvedValue({
      external: '',
      xaideManaged: 'my claude content',
    })
    renderWithQuery(<AgentConfigSection workspaceId={null} />)
    await screen.findByDisplayValue('my claude content')
  })

  it('saves Claude config when save button clicked', async () => {
    vi.mocked(window.xaide.settings.readClaudeConfig).mockResolvedValue({
      external: '',
      xaideManaged: 'initial content',
    })
    vi.mocked(window.xaide.settings.writeClaudeConfig).mockResolvedValue(undefined)

    renderWithQuery(<AgentConfigSection workspaceId={null} />)
    const textarea = await screen.findByDisplayValue('initial content')
    await userEvent.clear(textarea)
    await userEvent.type(textarea, 'new content')

    const saveButtons = screen.getAllByRole('button', { name: /save/i })
    await userEvent.click(saveButtons[0])

    await waitFor(() => {
      expect(window.xaide.settings.writeClaudeConfig).toHaveBeenCalled()
    })
  })
})
