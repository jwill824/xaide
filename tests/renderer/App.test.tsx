import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from '../../src/renderer/src/App'

describe('App shell', () => {
  it('renders all four icon rail buttons', () => {
    render(<App />)
    expect(screen.getByTitle('Agents')).toBeInTheDocument()
    expect(screen.getByTitle('Tasks')).toBeInTheDocument()
    expect(screen.getByTitle('Extensions')).toBeInTheDocument()
    expect(screen.getByTitle('Settings')).toBeInTheDocument()
  })

  it('shows the Workspaces heading by default', () => {
    render(<App />)
    expect(screen.getByText('Workspaces')).toBeInTheDocument()
  })

  it('shows the main area placeholder', () => {
    render(<App />)
    expect(screen.getByText(/open a workspace/i)).toBeInTheDocument()
  })

  it('hides the left panel when a non-agents rail item is active', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByTitle('Tasks'))
    expect(screen.queryByText('Workspaces')).not.toBeInTheDocument()
  })

  it('re-shows the left panel when Agents is clicked again', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByTitle('Tasks'))
    await user.click(screen.getByTitle('Agents'))
    expect(screen.getByText('Workspaces')).toBeInTheDocument()
  })
})
