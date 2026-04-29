import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

interface Props {
  sessionId: string
  /** When true, this pane is visible — triggers a fit to avoid blank rendering after CSS show. */
  active?: boolean
  /** Called after the terminal has been fitted and reports its actual dimensions. */
  onReady?: (cols: number, rows: number) => void
}

export function TerminalPane({ sessionId, active, onReady }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  // Keep a ref so the mount effect never re-runs just because the callback changed.
  const onReadyRef = useRef(onReady)
  onReadyRef.current = onReady

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // Estimate initial size from container dimensions to minimize content reflow when
    // the deferred fit runs. JetBrains Mono 13px ≈ 8px wide, 17px tall per cell.
    const estCols = Math.max(Math.floor(container.clientWidth / 8), 80)
    const estRows = Math.max(Math.floor(container.clientHeight / 17), 24)

    const term = new Terminal({
      cols: estCols,
      rows: estRows,
      theme: { background: '#0a0a0a', foreground: '#d4d4d4', cursor: '#d4d4d4' },
      fontFamily: 'JetBrains Mono, Menlo, monospace',
      fontSize: 13,
      cursorBlink: true,
      scrollback: 5000,
    })
    const fit = new FitAddon()
    termRef.current = term
    fitRef.current = fit
    term.loadAddon(fit)
    term.open(container)

    // Defer precise fit until after browser layout fully settles, then notify
    // the caller so it can spawn the agent process at the correct size.
    let raf1: number, raf2: number
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        fit.fit()
        window.xaide.pty.resize(sessionId, term.cols, term.rows)
        onReadyRef.current?.(term.cols, term.rows)
      })
    })

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

    return () => {
      cancelAnimationFrame(raf1)
      cancelAnimationFrame(raf2)
      termRef.current = null
      fitRef.current = null
      unsub()
      unsubExit()
      ro.disconnect()
      term.dispose()
    }
  }, [sessionId])

  // Re-fit when this pane becomes visible. Use double-rAF so the browser has fully
  // completed layout after the CSS display change before we measure the container.
  useEffect(() => {
    if (!active) return
    let raf1: number, raf2: number
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        fitRef.current?.fit()
        const term = termRef.current
        if (term) window.xaide.pty.resize(sessionId, term.cols, term.rows)
      })
    })
    return () => {
      cancelAnimationFrame(raf1)
      cancelAnimationFrame(raf2)
    }
  }, [active, sessionId])

  return <div ref={containerRef} className="h-full w-full overflow-hidden" />
}
