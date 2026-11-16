/** One match: the message row holding it, and which match in that row (0 first). */
export type Hit = { id: string; n: number }

/** The search the find bar holds: what is highlighted, and which hit is selected. */
export type Search = {
  /** Whether the find bar shows above the prompt. */
  isOpen: boolean
  /** The text looked for; '' when no search is on. */
  query: string
  /** Every match in the session, oldest first. */
  hits: Hit[]
  /** Index into `hits` of the selected one; -1 before the first jump. */
  current: number
  /** Counts the text fields drawn so far: each step swaps in a new one. */
  field: number
}

declare module 'claude-code' {
  interface PluginState {
    find: { search: Search }
  }
}
