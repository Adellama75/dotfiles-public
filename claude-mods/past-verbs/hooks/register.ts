import type { Register } from 'claude-code'

// The line that closes a turn ("Sautéed for 4s · done 20:11") draws a word
// from the engine's own short past-tense list, which the `spinnerVerbs`
// setting does not reach.  This puts the past tense of Mia's spinner verbs
// there instead ("Grazed for 4s").
//
// One entry per verb in ~/.claude/spinner-verbs.json (the claude stow
// package), same order; keep the two lists in step.

export const PAST = [
  'Grazed', // Grazing
  'Nibbled', // Nibbling
  'Foraged', // Foraging
  'Nuzzled through', // Nuzzling through
  'Snuffled about', // Snuffling about
  'Nosed around', // Nosing around
  'Padded along', // Padding along
  'Trod softly', // Treading softly
  'Wandered the meadow', // Wandering the meadow
  'Followed the trail', // Following the trail
  'Pricked ears', // Ears pricked
  'Flicked an ear', // Flicking an ear
  'Curled up with it', // Curling up with it
  'Nested', // Nesting
  'Burrowed in', // Burrowing in
  'Gathered acorns', // Gathering acorns
  'Tucked things away', // Tucking things away
  'Dozed on it', // Dozing on it
  'Stretched', // Stretching
  'Pottered', // Pottering
  'Mulled', // Mulling
  'Untangled', // Untangling
  'Leafed through', // Leafing through
  'Steeped', // Steeping
  'Let it settle', // Letting it settle
  'Nibbled a leaf', // Nibbling a leaf
  'Sniffed', // Sniffing
  'Snuffled', // Snuffling
  'Wiggled an ear', // Wiggling an ear
  'Twitched a nose', // Twitching a nose
  'Blinked slowly', // Blinking slowly
  'Hopped a little', // Little hops
  'Tiptoed', // Tiptoeing
  'Peeked out', // Peeking out
  'Hid in the grass', // Hiding in the grass
  'Wobbled along', // Wobbling along
  'Flicked a tail', // Tail flick
  'Yawned', // Yawning
  'Snuggled in', // Snuggling in
  'Curled up small', // Curling up small
  'Tucked in', // Tucked in
  'Napped on it', // Napping on it
  'Got cosy', // Getting cosy
  'Stayed under a blanket', // Under a blanket
]

/**
 * The word for one line, picked from the line's id so a line keeps its word
 * however often it is drawn again (a scroll, a resize, a reload).
 */
export const pick = (id: string): string => {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) {
    h = Math.imul(h ^ id.charCodeAt(i), 16777619)
  }
  return PAST[(h >>> 0) % PAST.length]!
}

export const register: Register = on => {
  on('ui.render', { component: 'TurnDuration' }, ($, e, next) =>
    next({ ...e, props: { ...e.props, word: pick(e.requestId) } }),
  )
}

// Claude
