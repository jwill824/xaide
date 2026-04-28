import type { FC } from 'react'

export type SettingsSection = 'agent-config' | 'hooks' | 'mcp-servers'

interface Props {
  activeSection: SettingsSection
  onSelect: (s: SettingsSection) => void
}

const NAV_ITEMS: { id: SettingsSection; label: string }[] = [
  { id: 'agent-config', label: 'Agent Config' },
  { id: 'hooks', label: 'Hooks' },
  { id: 'mcp-servers', label: 'MCP Servers' },
]

export const SettingsNav: FC<Props> = ({ activeSection, onSelect }) => (
  <nav
    aria-label="Settings navigation"
    className="w-44 shrink-0 border-r border-neutral-800 bg-neutral-900 pt-4"
  >
    <p className="px-3 pb-2 text-xs font-semibold text-neutral-500 uppercase tracking-wider select-none">
      Settings
    </p>
    <ul>
      {NAV_ITEMS.map((item) => (
        <li key={item.id}>
          <button
            type="button"
            aria-current={activeSection === item.id ? 'page' : undefined}
            className={[
              'w-full text-left px-3 py-1.5 text-sm',
              activeSection === item.id
                ? 'bg-neutral-700 text-white'
                : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800',
            ].join(' ')}
            onClick={() => onSelect(item.id)}
          >
            {item.label}
          </button>
        </li>
      ))}
    </ul>
  </nav>
)
