import type { FC } from 'react'

export type IconRailItem = {
  id: string
  icon: string
  label: string
  onClick: () => void
  active?: boolean
}

type Props = { items: IconRailItem[] }

export const IconRail: FC<Props> = ({ items }) => (
  <nav
    aria-label="Main navigation"
    className="flex flex-col items-center w-9 shrink-0 bg-neutral-900 border-r border-neutral-800 py-2 gap-1"
  >
    {items.map((item) => (
      <button
        key={item.id}
        title={item.label}
        aria-label={item.label}
        onClick={item.onClick}
        className={[
          'w-7 h-7 flex items-center justify-center rounded text-sm transition-colors',
          item.active
            ? 'bg-neutral-700 text-white'
            : 'text-neutral-500 hover:text-neutral-200 hover:bg-neutral-800',
        ].join(' ')}
      >
        {item.icon}
      </button>
    ))}
  </nav>
)
