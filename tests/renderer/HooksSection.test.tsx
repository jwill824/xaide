import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { HooksSection } from '../../src/renderer/src/components/HooksSection'

function renderWithQuery(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('HooksSection', () => {
  it('renders Hooks Configuration heading', () => {
    renderWithQuery(<HooksSection workspaceId={null} />)
    expect(screen.getByText('Hooks Configuration')).toBeInTheDocument()
  })

  it('shows empty state when no hooks', async () => {
    vi.mocked(window.xaide.settings.listHooks).mockResolvedValue([])
    renderWithQuery(<HooksSection workspaceId={null} />)
    await screen.findByText('No hooks configured')
  })

  it('renders hook list when hooks exist', async () => {
    vi.mocked(window.xaide.settings.listHooks).mockResolvedValue([
      {
        id: '1',
        event: 'agent.start',
        command: 'npm test',
        enabled: true,
        workspaceId: null,
        scope: 'global',
        createdAt: '',
        updatedAt: '',
      },
    ])
    renderWithQuery(<HooksSection workspaceId={null} />)
    await screen.findByText('npm test')
    expect(screen.getByText('agent.start', { selector: 'td' })).toBeInTheDocument()
  })

  it('calls createHook when Add Hook form submitted', async () => {
    vi.mocked(window.xaide.settings.listHooks).mockResolvedValue([])
    vi.mocked(window.xaide.settings.createHook).mockResolvedValue({
      id: 'hook-1',
      event: 'agent.start',
      command: 'npm run build',
      enabled: true,
      workspaceId: null,
      scope: 'global',
      createdAt: '',
      updatedAt: '',
    })

    renderWithQuery(<HooksSection workspaceId={null} />)

    await screen.findByText('No hooks configured')

    const commandInput = screen.getByPlaceholderText(/e\.g\. npm test/i)
    await userEvent.type(commandInput, 'npm run build')

    await userEvent.click(screen.getByRole('button', { name: /add hook/i }))

    await waitFor(() => {
      expect(window.xaide.settings.createHook).toHaveBeenCalledWith({
        event: 'agent.start',
        command: 'npm run build',
        scope: 'global',
      })
    })
  })
})
