import { z } from 'zod'

const SandboxConfigSchema = z.object({
  enabled: z.boolean().default(false),
  image: z.string().optional(),
  dockerfile: z.string().optional(),
  env: z.record(z.string()).default({}),
  ports: z.array(z.string()).default([]),
  keepAlive: z.boolean().default(false),
})

const AgentOverrideSchema = z.object({
  id: z.string(),
  command: z.string(),
  args: z.array(z.string()).default([]),
  enabled: z.boolean().default(true),
})

const McpServerConfigSchema = z.object({
  name: z.string(),
  command: z.string(),
  args: z.array(z.string()).default([]),
  scope: z.enum(['global', 'workspace']).default('global'),
  enabled: z.boolean().default(true),
})

const HookConfigSchema = z.object({
  event: z.string(),
  path: z.string(),
})

export const GlobalConfigSchema = z.object({
  agents: z.array(AgentOverrideSchema).default([]),
  mcpServers: z.array(McpServerConfigSchema).default([]),
  sandbox: SandboxConfigSchema.default({}),
  plugins: z.array(z.string()).default([]),
  hooks: z.array(HookConfigSchema).default([]),
})

export const WorkspaceConfigSchema = z.object({
  sourceAdapter: z.string().optional(),
  methodologyAdapter: z.string().optional(),
  sandbox: SandboxConfigSchema.partial().optional(),
  agents: z.array(AgentOverrideSchema).default([]),
  hooks: z.array(HookConfigSchema).default([]),
})

export type GlobalConfig = z.infer<typeof GlobalConfigSchema>
export type WorkspaceConfig = z.infer<typeof WorkspaceConfigSchema>
