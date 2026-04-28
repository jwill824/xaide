import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { McpServersSection } from '../../src/renderer/src/components/McpServersSection'

function renderWithQuery(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('McpServersSection', () => {
  it('renders MCP Servers heading', () => {
    renderWithQuery(<McpServersSection workspaceId={null} />)
    expect(screen.getByText('MCP Servers')).toBeInTheDocument()
  })

  it('shows empty state when no servers', async () => {
    vi.mocked(window.xaide.settings.listMcpServers).mockResolvedValue([])
    renderWithQuery(<McpServersSection workspaceId={null} />)
    await screen.findByText('No MCP servers configured')
  })

  it('renders server list when servers exist', async () => {
    vi.mocked(window.xaide.settings.listMcpServers).mockResolvedValue([
      {
        id: '1',
        name: 'my-server',
        scope: 'global',
        workspaceId: null,
        configJson: '{}',
        enabled: true,
        createdAt: '',
      },
    ])
    renderWithQuery(<McpServersSection workspaceId={null} />)
    await screen.findByText('my-server')
    expect(screen.getByText('global', { selector: 'span' })).toBeInTheDocument()
  })

  it('calls createMcpServer when Add Server form submitted', async () => {
    vi.mocked(window.xaide.settings.listMcpServers).mockResolvedValue([])
    vi.mocked(window.xaide.settings.createMcpServer).mockResolvedValue({
      id: 'mcp-1',
      name: 'test-server',
      scope: 'global',
      workspaceId: null,
      configJson: '{}',
      enabled: true,
      createdAt: '',
    })

    renderWithQuery(<McpServersSection workspaceId={null} />)

    await screen.findByText('No MCP servers configured')

    const nameInput = screen.getByPlaceholderText(/e\.g\. my-mcp-server/i)
    await userEvent.type(nameInput, 'test-server')

    const configTextarea = screen.getByPlaceholderText('{}')
    fireEvent.change(configTextarea, { target: { value: '{}' } })

    await userEvent.click(screen.getByRole('button', { name: /add server/i }))

    await waitFor(() => {
      expect(window.xaide.settings.createMcpServer).toHaveBeenCalledWith({
        name: 'test-server',
        scope: 'global',
        config: {},
      })
    })
  })
})
