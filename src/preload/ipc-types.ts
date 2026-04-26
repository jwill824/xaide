export interface Workspace {
  id: string
  name: string
  repoPath: string
  configJson: string
  sandboxDefaults: string
  layoutJson: string
  createdAt: string
  updatedAt: string
}

export interface CreateWorkspaceInput {
  name: string
  repoPath: string
}

export interface WorkspaceAPI {
  list: () => Promise<Workspace[]>
  create: (input: CreateWorkspaceInput) => Promise<Workspace>
  get: (id: string) => Promise<Workspace | null>
  update: (id: string, input: Partial<CreateWorkspaceInput>) => Promise<Workspace>
  delete: (id: string) => Promise<void>
}

export interface XaideAPI {
  workspace: WorkspaceAPI
}

declare global {
  interface Window {
    xaide: XaideAPI
  }
}
