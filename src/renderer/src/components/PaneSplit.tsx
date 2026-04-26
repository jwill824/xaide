import { useRef, useState, useCallback } from 'react'
import type { PaneNode } from '../types/layout'
import { TerminalPane } from './TerminalPane'
import { BrowserPanel } from './BrowserPanel'

interface Props {
  node: PaneNode
  onLayoutChange?: (node: PaneNode) => void
}

export function PaneSplit({ node, onLayoutChange }: Props) {
  if (node.type === 'terminal') {
    return <TerminalPane sessionId={node.sessionId} />
  }
  if (node.type === 'browser') {
    return <BrowserPanel url={node.url} />
  }
  return <SplitContainer node={node} onLayoutChange={onLayoutChange} />
}

interface SplitContainerProps {
  node: Extract<PaneNode, { type: 'split' }>
  onLayoutChange?: (node: PaneNode) => void
}

function SplitContainer({ node, onLayoutChange }: SplitContainerProps) {
  const [ratio, setRatio] = useState(node.ratio)
  const containerRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      dragging.current = true

      const onMove = (ev: MouseEvent) => {
        if (!dragging.current || !containerRef.current) return
        const rect = containerRef.current.getBoundingClientRect()
        const raw =
          node.direction === 'h'
            ? (ev.clientX - rect.left) / rect.width
            : (ev.clientY - rect.top) / rect.height
        const clamped = Math.min(0.9, Math.max(0.1, raw))
        setRatio(clamped)
        onLayoutChange?.({ ...node, ratio: clamped })
      }

      const onUp = () => {
        dragging.current = false
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup', onUp)
      }

      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
    },
    [node, onLayoutChange],
  )

  const isH = node.direction === 'h'
  const aSize = `${ratio * 100}%`
  const bSize = `${(1 - ratio) * 100}%`
  const dividerClass = isH
    ? 'w-1 cursor-col-resize bg-neutral-800 hover:bg-blue-500 transition-colors shrink-0'
    : 'h-1 cursor-row-resize bg-neutral-800 hover:bg-blue-500 transition-colors shrink-0'

  return (
    <div
      ref={containerRef}
      className={`flex h-full w-full overflow-hidden ${isH ? 'flex-row' : 'flex-col'}`}
    >
      <div
        style={{ [isH ? 'width' : 'height']: aSize }}
        className="overflow-hidden min-w-0 min-h-0"
      >
        <PaneSplit
          node={node.a}
          onLayoutChange={(n) => onLayoutChange?.({ ...node, a: n })}
        />
      </div>
      <div
        className={dividerClass}
        onMouseDown={handleMouseDown}
        role="separator"
        aria-orientation={isH ? 'vertical' : 'horizontal'}
      />
      <div
        style={{ [isH ? 'width' : 'height']: bSize }}
        className="overflow-hidden min-w-0 min-h-0"
      >
        <PaneSplit
          node={node.b}
          onLayoutChange={(n) => onLayoutChange?.({ ...node, b: n })}
        />
      </div>
    </div>
  )
}
