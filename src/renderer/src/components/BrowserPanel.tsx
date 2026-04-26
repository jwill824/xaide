import { useRef, useState } from 'react'

interface Props {
  url: string
  onUrlChange?: (url: string) => void
}

export function BrowserPanel({ url, onUrlChange }: Props) {
  const [inputUrl, setInputUrl] = useState(url)
  const webviewRef = useRef<HTMLElement>(null)

  const navigate = () => {
    const target = inputUrl.startsWith('http') ? inputUrl : `https://${inputUrl}`
    onUrlChange?.(target)
    ;(webviewRef.current as { loadURL?: (u: string) => void } | null)?.loadURL?.(target)
  }

  return (
    <div className="flex h-full w-full flex-col bg-neutral-950">
      <div className="flex items-center gap-2 border-b border-neutral-800 px-2 py-1 shrink-0">
        <input
          className="flex-1 rounded bg-neutral-900 px-2 py-1 text-xs text-neutral-200 outline-none focus:ring-1 focus:ring-neutral-600"
          value={inputUrl}
          onChange={(e) => setInputUrl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && navigate()}
          placeholder="https://..."
          aria-label="Browser URL"
        />
        <button
          type="button"
          onClick={navigate}
          className="rounded bg-neutral-800 px-2 py-1 text-xs text-neutral-300 hover:bg-neutral-700"
        >
          Go
        </button>
      </div>
      <webview
        ref={webviewRef as React.RefObject<HTMLElement>}
        src={url}
        style={{ width: '100%', flex: 1 }}
      />
    </div>
  )
}
