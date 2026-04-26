import { readFileSync, existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { homedir } from 'os'
import { parse } from 'yaml'
import {
  GlobalConfigSchema,
  WorkspaceConfigSchema,
  type GlobalConfig,
  type WorkspaceConfig,
} from './schema'

const DEFAULT_GLOBAL_CONFIG_PATH = join(homedir(), '.config', 'xaide', 'config.yaml')

export class ConfigLoader {
  constructor(private globalConfigPath = DEFAULT_GLOBAL_CONFIG_PATH) {}

  loadGlobal(): GlobalConfig {
    if (!existsSync(this.globalConfigPath)) {
      mkdirSync(dirname(this.globalConfigPath), { recursive: true })
      return GlobalConfigSchema.parse({})
    }
    const raw = readFileSync(this.globalConfigPath, 'utf8')
    return GlobalConfigSchema.parse(parse(raw) ?? {})
  }

  loadWorkspace(repoPath: string): WorkspaceConfig {
    const configPath = join(repoPath, '.agentapp', 'config.yaml')
    if (!existsSync(configPath)) {
      return WorkspaceConfigSchema.parse({})
    }
    const raw = readFileSync(configPath, 'utf8')
    return WorkspaceConfigSchema.parse(parse(raw) ?? {})
  }
}
