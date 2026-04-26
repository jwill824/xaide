import type { FC } from 'react'

const isMac = navigator.userAgent.includes('Macintosh')

/**
 * Transparent drag region that sits above the main layout on macOS,
 * giving the traffic-light buttons room without overlapping content.
 * Hidden on non-macOS (titleBarStyle is 'default' there).
 */
export const TitleBar: FC = () => {
  if (!isMac) return null

  return (
    <div
      className="h-8 w-full shrink-0 bg-neutral-950"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    />
  )
}
