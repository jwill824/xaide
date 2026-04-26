import type { FC } from 'react'

/**
 * Transparent drag region that sits above the main layout on macOS,
 * giving the traffic-light buttons room without overlapping content.
 * Hidden on non-macOS (titleBarStyle is 'default' there).
 */
export const TitleBar: FC = () => {
  if (process.platform !== 'darwin') return null

  return (
    <div
      className="h-8 w-full shrink-0 bg-neutral-950"
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore -- Electron-specific CSS property
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    />
  )
}
