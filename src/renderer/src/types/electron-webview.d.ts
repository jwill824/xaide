declare namespace React {
  namespace JSX {
    interface IntrinsicElements {
      webview: React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement>,
        HTMLElement
      > & {
        src?: string
        allowpopups?: string
        partition?: string
        style?: React.CSSProperties
      }
    }
  }
}
