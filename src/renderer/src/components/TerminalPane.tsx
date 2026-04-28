import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

interface Props {
  sessionId: string
  onReady?: () => void
}

export function TerminalPane({ sessionId, onReady }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const term = new Terminal({
      theme: { background: '#0a0a0a', foreground: '#d4d4d4', cursor: '#d4d4d4' },
      fontFamily: 'JetBrains Mono, Menlo, monospace',
      fontSize: 13,
      cursorBlink: true,
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(container)
    fit.fit()

    const unsub = window.xaide.pty.onData((id, data) => {
      if (id === sessionId) term.write(data)
    })

    const unsubExit = window.xaide.pty.onExit((exitedId) => {
      if (exitedId === sessionId) {
        term.write('\r\n[Process exited]\r\n')
      }
    })

    term.onData((data) => {
      window.xaide.pty.write(sessionId, data)
    })

    const ro = new ResizeObserver(() => {
      fit.fit()
      window.xaide.pty.resize(sessionId, term.cols, term.rows)
    })
    ro.observe(container)

    onReady?.()

    return () => {
      unsub()
      unsubExit()
      ro.disconnect()
      term.dispose()
    }
  }, [sessionId, onReady])

  return <div ref={containerRef} className="h-full w-full overflow-hidden" />
}
