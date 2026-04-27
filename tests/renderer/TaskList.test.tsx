import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TaskList } from '../../src/renderer/src/components/TaskList'

const mockTasks = [
  {
    id: 'task-1', workspaceId: 'ws-1', title: 'Fix login bug', sourceAdapter: 'manual',
    methodologyAdapter: null, prompt: 'Auth is broken', status: 'pending',
    baseCommit: null, parallelGroupId: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'task-2', workspaceId: 'ws-1', title: 'Add dark mode', sourceAdapter: 'manual',
    methodologyAdapter: null, prompt: '', status: 'done',
    baseCommit: null, parallelGroupId: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  },
]

function renderWithQuery(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(window.xaide.tasks.list).mockResolvedValue(mockTasks as any)
})

describe('TaskList', () => {
  it('renders task titles', async () => {
    renderWithQuery(<TaskList workspaceId="ws-1" />)
    expect(await screen.findByText('Fix login bug')).toBeInTheDocument()
    expect(screen.getByText('Add dark mode')).toBeInTheDocument()
  })

  it('shows status badges', async () => {
    renderWithQuery(<TaskList workspaceId="ws-1" />)
    await screen.findByText('Fix login bug')
    expect(screen.getByText('pending')).toBeInTheDocument()
    expect(screen.getByText('done')).toBeInTheDocument()
  })

  it('creates a task when form is submitted', async () => {
    vi.mocked(window.xaide.tasks.create).mockResolvedValue({
      id: 'task-3', workspaceId: 'ws-1', title: 'New task', sourceAdapter: 'manual',
      methodologyAdapter: null, prompt: '', status: 'pending',
      baseCommit: null, parallelGroupId: null, createdAt: '', updatedAt: '',
    } as any)
    renderWithQuery(<TaskList workspaceId="ws-1" />)
    await screen.findByText('Fix login bug')

    await userEvent.click(screen.getByRole('button', { name: /add task/i }))
    const input = screen.getByPlaceholderText(/task title/i)
    await userEvent.type(input, 'New task')
    await userEvent.keyboard('{Enter}')

    await waitFor(() => {
      expect(window.xaide.tasks.create).toHaveBeenCalledWith({ workspaceId: 'ws-1', title: 'New task' })
    })
  })

  it('cycles task status on status badge click', async () => {
    vi.mocked(window.xaide.tasks.update).mockResolvedValue({ ...mockTasks[0], status: 'in_progress' } as any)
    renderWithQuery(<TaskList workspaceId="ws-1" />)
    await screen.findByText('Fix login bug')

    await userEvent.click(screen.getByText('pending'))

    await waitFor(() => {
      expect(window.xaide.tasks.update).toHaveBeenCalledWith('task-1', { status: 'in_progress' })
    })
  })

  it('deletes a task on delete button click', async () => {
    vi.mocked(window.xaide.tasks.delete).mockResolvedValue(undefined)
    renderWithQuery(<TaskList workspaceId="ws-1" />)
    await screen.findByText('Fix login bug')

    const deleteButtons = screen.getAllByRole('button', { name: /delete/i })
    await userEvent.click(deleteButtons[0])

    await waitFor(() => {
      expect(window.xaide.tasks.delete).toHaveBeenCalledWith('task-1')
    })
  })
})
