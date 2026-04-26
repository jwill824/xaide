export type PaneNode =
  | { type: 'terminal'; sessionId: string }
  | { type: 'browser'; url: string }
  | { type: 'split'; direction: 'h' | 'v'; ratio: number; a: PaneNode; b: PaneNode }
