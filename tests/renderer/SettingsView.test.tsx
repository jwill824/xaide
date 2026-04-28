import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SettingsView } from '../../src/renderer/src/components/SettingsView'

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

describe('SettingsView', () => {
  it('renders Agent Config section by default', () => {
    render(<SettingsView />, { wrapper: Wrapper })
    expect(screen.getByText('Agent Configuration')).toBeInTheDocument()
  })

  it('renders settings navigation with three items', () => {
    render(<SettingsView />, { wrapper: Wrapper })
    expect(screen.getByRole('navigation', { name: 'Settings navigation' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Agent Config' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Hooks' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'MCP Servers' })).toBeInTheDocument()
  })

  it('switches to Hooks section when nav item clicked', async () => {
    const user = userEvent.setup()
    render(<SettingsView />, { wrapper: Wrapper })
    await user.click(screen.getByRole('button', { name: 'Hooks' }))
    expect(screen.getByText('Hooks Configuration')).toBeInTheDocument()
    expect(screen.queryByText('Agent Configuration')).not.toBeInTheDocument()
  })

  it('switches to MCP Servers section when nav item clicked', async () => {
    const user = userEvent.setup()
    render(<SettingsView />, { wrapper: Wrapper })
    await user.click(screen.getByRole('button', { name: 'MCP Servers' }))
    expect(screen.getByText('MCP Servers Configuration')).toBeInTheDocument()
    expect(screen.queryByText('Agent Configuration')).not.toBeInTheDocument()
  })
})
