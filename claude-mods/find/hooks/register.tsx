import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Hit, Search } from '../types'
import { blocks, countIn, grid, mark, matchesIn, parse, ranges, rowsOf } from './markdown'
import type { Piece, Tally } from './markdown'

// ctrl+f: find in the conversation.  Every match in your messages and
// Claude's replies is highlighted in place as you type.  Tool output is never
// searched (only message rows are), and a reply is searched as it reads once
// drawn, not as its markdown source: `*` does not find the stars around bold
// text.  Enter goes to the next hit, oldest first; shift+Enter to the
// previous one; Esc or Tab closes and clears the highlights.
//
// Two styles, chosen per session.  Bar style: a bar opens above the prompt.
// Prompt style, where claude runs straight in a kitty window: the prompt box
// is the bar, and Up / Down step too (see PREFIX below).

const TRIGGER = '\uE0CF'

// Prompt style (a claude running straight in a kitty window): the prompt box
// itself is the find bar, "find: " then the query, and the hint line under it
// holds the count and two buttons, next and previous, so the search takes no
// row of its own.  A step has to be a button press: of what a person does at
// the prompt, that is what the engine lets a mod scroll the chat for without
// leaving a line in it (a stopped Enter leaves "Prompt dropped by a hook").
// The buttons answer to two key chords (NEXT_ACTION, PREVIOUS_ACTION, bound in
// ~/.claude/keybindings.json), and while the window's user variable find=1 is
// set, kitty sends those chords for Enter / Down and shift+Enter / Up, and
// CLOSE, a private-use character, for Esc, Tab and ctrl+c (kitty.conf).
const PREFIX = 'find: '
const CLOSE = '\uE0D3'
// Engine actions with nothing listening outside the diff view, borrowed for
// their chords: alt+j and alt+k, bound to them under "Global" in
// keybindings.json.
const NEXT_ACTION = 'app:diffFileListDown'
const PREVIOUS_ACTION = 'app:diffFileListUp'
const NONE: Search = { isOpen: false, query: '', hits: [], current: -1, field: 0 }
const search = atom({ plugin: 'find', key: 'search' } as const, NONE)

// Colours: the selected hit orange, the others yellow, dark text on both.
const SELECTED = '#F0A04B'
const OTHER = '#F9E2AF'
const INK = '#151520'

// Inline code and code blocks, as the engine colours them.
const CODE = 'permission'

type Message = { id: string; role: 'user' | 'assistant'; text: string }

/** A piece's Text props: its style, and a match's paint over it. */
const look = (piece: Piece) => ({
  ...(piece.bold ? { bold: true } : {}),
  ...(piece.italic ? { italic: true } : {}),
  ...(piece.strike ? { strikethrough: true } : {}),
  ...(piece.dim ? { dimColor: true } : {}),
  ...(piece.mark
    ? { color: INK, backgroundColor: piece.mark === 'selected' ? SELECTED : OTHER }
    : piece.code
      ? { color: CODE }
      : {}),
})

/**
 * Whether a drawn row is the transcript message `id` names.  The engine names
 * a row by the message's uuid, but for some rows with its last group zeroed
 * (8129bb46-9d65-46e5-bd8e-000000000000 for ...-5a26282378d0), so the two are
 * compared without that group.
 */
const rowKey = (id: string) => id.slice(0, 24)
const isRow = (id: string, rowId: string) => rowKey(id) === rowKey(rowId)

// Which part of each message row is on screen, by rowKey, as the engine last
// reported it to the row's drawing; absent while the row is off screen.
const shown = new Map<string, { first: number; last: number; of: number }>()

/** Note what a row's drawing was told about its place on screen. */
const track = (rowId: string, onScreen: { first: number; last: number; of: number } | null | undefined) => {
  if (onScreen) shown.set(rowKey(rowId), onScreen)
  else shown.delete(rowKey(rowId))
}

/** Which match of a row is the selected one: its index there, or -1. */
const selectedIn = (now: Search, rowId: string) => {
  const hit = now.hits[now.current]
  return hit && isRow(hit.id, rowId) ? hit.n : -1
}

// Reads the session's transcript file and prints one {id, role, text} JSON line per
// message row of yours or Claude's.  A helper process does it because the
// file outgrows what $.fs.read takes (4 MiB) in a long session, while the
// messages alone stay small.  argv[1] is the session id.
const EXTRACT = `
import glob, json, os, sys

def said(e):
    if e.get("isMeta") or e.get("isSidechain"):
        return ""
    content = (e.get("message") or {}).get("content")
    kind = e.get("type")
    if kind == "user":
        if isinstance(content, str):
            text = content
        elif isinstance(content, list):
            text = "\\n".join(p.get("text", "") for p in content if p.get("type") == "text")
        else:
            text = ""
        return "" if text.startswith("<") else text  # a command's or the engine's row
    if kind == "assistant" and isinstance(content, list):
        return "\\n".join(p.get("text", "") for p in content if p.get("type") == "text")
    if kind == "attachment":
        a = e.get("attachment") or {}
        if a.get("type") == "queued_command":  # sent while a turn ran
            return str(a.get("prompt") or "")
    return ""

paths = glob.glob(os.path.expanduser("~/.claude/projects/*/" + sys.argv[1] + ".jsonl"))
for line in open(paths[0]) if paths else []:
    try:
        e = json.loads(line)
    except ValueError:
        continue  # a torn last line
    text = said(e)
    if text and e.get("uuid"):
        role = "assistant" if e.get("type") == "assistant" else "user"
        print(json.dumps({"id": e["uuid"], "role": role, "text": text}))
`

// The session's messages, read from its transcript file when the bar opens.
let messages: Message[] = []

const load = async ($: EngineInterface) => {
  const id = await $.session.id()
  const ran = await $.process.run(['python3', '-c', EXTRACT, id])
  if (ran.exitCode !== 0) {
    $.ui.toast(`find: could not read the transcript (${ran.stderr.trim().split('\n').pop() ?? ''})`)
    return
  }
  const list: Message[] = []
  for (const line of ran.stdout.split('\n')) {
    if (!line) continue
    try {
      list.push(JSON.parse(line) as Message)
    } catch {
      // a line cut by the output limit
    }
  }
  messages = list
}

/** How many matches a message row draws: a reply's in its visible text. */
const count = (message: Message, query: string) =>
  message.role === 'assistant'
    ? countIn(message.text, query)
    : ranges(message.text, query).length

/** Every match in the session, oldest first: its message row and which one in it. */
const hitsFor = (query: string): Hit[] =>
  query
    ? messages.flatMap(m =>
        Array.from({ length: count(m, query) }, (_, n) => ({ id: m.id, n })),
      )
    : []

const setQuery = ($: EngineInterface, query: string) =>
  update($, search, s => ({ ...s, isOpen: true, query, hits: hitsFor(query), current: -1 }))

// True while a step is on its way: a key held down, or pressed again before
// the chat has settled, is dropped rather than piled on top.
let isStepping = false

/** Select the next (+1) or previous (-1) hit, wrapping, and scroll to it. */
const step = async ($: EngineInterface, by: 1 | -1) => {
  if (isStepping) return
  isStepping = true
  try {
    const now = await read($, search)
    const total = now.hits.length
    if (!total) return
    const current =
      now.current < 0 ? (by > 0 ? 0 : total - 1) : (now.current + by + total) % total
    const target = now.hits[current]
    if (!target) return
    const key = rowKey(target.id)
    await update($, search, s => ({ ...s, current }))
    const answer = await $.ui.scroll({ to: { requestId: target.id }, block: 'center' })
    if (answer?.deny) {
      $.ui.toast(`find: could not scroll there (${answer.deny})`)
      return
    }
    // The chat only guesses the height of a row it has never drawn, so a jump
    // to one can land beside it.  Give the row a moment to report that its
    // top is on screen; only when it does not is the jump made again, since a
    // second jump shows as a second update.
    let landed = false
    for (let waited = 0; waited < 240 && !landed; waited += 40) {
      await $.clock.sleep(40)
      landed = shown.get(key)?.first === 0
    }
    if (!landed) await $.ui.scroll({ to: { requestId: target.id }, block: 'center' })
  } finally {
    isStepping = false
  }
}

// How this session searches: in the prompt box, or in a bar above it.
let style: 'prompt' | 'bar' = 'bar'
// The kitty window this claude runs in, when kitty can be told about a search.
let kittyWindow = ''
// The draft the prompt held before it became the find bar, put back on close.
let savedDraft = ''
/** FIND_MOD_STYLE forces a style; else prompt style where kitty is at hand. */
const chooseStyle = async ($: EngineInterface) => {
  const forced = await $.env.get('FIND_MOD_STYLE')
  const isInTmux = Boolean(await $.env.get('TMUX'))
  const hasSocket = Boolean(await $.env.get('KITTY_LISTEN_ON'))
  kittyWindow = (!isInTmux && hasSocket && (await $.env.get('KITTY_WINDOW_ID'))) || ''
  style = forced === 'prompt' || forced === 'bar' ? forced : kittyWindow ? 'prompt' : 'bar'
}

/** Tell kitty whether this window is searching (its user variable `find`). */
const flag = async ($: EngineInterface, isSearching: boolean) => {
  if (!kittyWindow) return true
  try {
    const ran = await $.process.run(
      ['kitty', '@', 'set-user-vars', '--match', `id:${kittyWindow}`, isSearching ? 'find=1' : 'find'],
      { timeoutMs: 3000 },
    )
    return ran.exitCode === 0
  } catch {
    return false
  }
}

// The band's id, learnt when it is first drawn; $.ui.focus names it.
let band = ''

// The text field's key.  It changes after every step, which makes the engine
// draw a new field holding the query: the old one keeps what the key did to
// it (a shift+Enter's newline, an Enter's emptying), and a field's own text
// is not the mod's to rewrite.
const fieldKey = (now: Search) => `query-${now.field ?? 0}`

/** Swap in a new field and give it the keyboard. */
const refield = async ($: EngineInterface) => {
  await update($, search, s => ({ ...s, field: (s.field ?? 0) + 1 }))
  await $.ui.focus({ requestId: band, key: fieldKey(await read($, search)) })
}

// Esc in the bar hands the keyboard back to the prompt without telling the
// mod.  So while the bar is up, ask now and then whether its field can still
// take the focus: once it could and no longer can, the person has left, and
// the bar closes as a browser's does.
let watch: { cancel: () => void } | undefined

const close = async ($: EngineInterface) => {
  watch?.cancel()
  watch = undefined
  await update($, search, () => NONE)
  if (style === 'prompt') await flag($, false)
}

/** Prompt style: start a search; false when kitty could not be told. */
const openPrompt = async ($: EngineInterface, draft: string) => {
  if (!(await flag($, true))) return false
  savedDraft = draft
  await load($)
  await update($, search, s => ({ ...s, isOpen: true }))
  return true
}

const open = async ($: EngineInterface) => {
  await load($)
  await update($, search, s => ({ ...s, isOpen: true }))
  watch?.cancel()
  let wasHeld = false
  let misses = 0
  watch = $.clock.every(250, async () => {
    if (!band) return
    const answer = await $.ui.focus({ requestId: band, key: fieldKey(await read($, search)) })
    if (!answer?.deny) {
      wasHeld = true
      misses = 0
    } else if (wasHeld && ++misses >= 2) await close($)
  })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'find',
      description: 'Find in the conversation (also ctrl+f): Enter / shift+Enter step, Esc or Tab closes',
    })
    await chooseStyle($)
    // A search left open by an earlier load has lost its state: start closed.
    if ((await read($, search)).isOpen) await update($, search, () => NONE)
    if (style === 'prompt') await flag($, false)
    return next(e)
  })

  on('command.run', { command: 'find' }, async ($, e) => {
    const query = e.args.trim()
    if (style === 'prompt' && (await openPrompt($, ''))) {
      await $.prompt.fill({ text: PREFIX + query, mode: 'replace' })
    } else {
      style = 'bar'
      await open($)
    }
    if (query) {
      await setQuery($, query)
      await step($, 1)
    }
    return {}
  })


  // ctrl+f at the prompt opens the bar.  The terminal sends it as one
  // private-use character (TRIGGER; kitty.conf maps ctrl+f to it), since a
  // bare ctrl+f that moves nothing raises no edit.  It never lands in the draft.
  on('prompt.edit', async ($, e, next) => {
    const typed = e.inputText
    const kept = { text: e.text, cursor: e.cursor }
    const now = await read($, search)
    const isKey = e.key?.ctrl === true && e.key.key === 'f'
    if (isKey || typed.includes(TRIGGER)) {
      // ctrl+f while searching closes, as it opened.
      if (now.isOpen) {
        await close($)
        return style === 'prompt' ? { text: savedDraft, cursor: savedDraft.length } : kept
      }
      if (style === 'prompt') {
        if (await openPrompt($, e.text)) return { text: PREFIX, cursor: PREFIX.length }
        style = 'bar' // kitty cannot be told: the bar needs no help
      }
      await open($)
      return kept
    }
    if (typed.includes(CLOSE)) {
      if (style === 'prompt' && now.isOpen) {
        await close($)
        return { text: savedDraft, cursor: savedDraft.length }
      }
      await flag($, false) // kitty thinks a search is on: put it right
      return kept
    }
    if (style === 'prompt' && now.isOpen) {
      const box = await next(e)
      // The prefix edited away: the search is over.
      if (!box.text.startsWith(PREFIX)) {
        await close($)
        return { text: savedDraft, cursor: savedDraft.length }
      }
      const query = box.text.slice(PREFIX.length).replace(/\n/g, '')
      if (query !== now.query) await setQuery($, query)
      return box
    }
    // Bar style, writing in the prompt again: the search is over.
    if (typed && now.isOpen) await close($)
    return next(e)
  })

  // Prompt style: the draft is the query and is never sent.  kitty turns
  // Enter into the next button's chord, so an Enter only gets here when kitty
  // was not told of the search; it still steps, at the cost of the engine's
  // "Prompt dropped" line.
  on('prompt.submit', async ($, e, next) => {
    const now = await read($, search)
    if (style !== 'prompt' || !now.isOpen || !e.text.startsWith(PREFIX)) return next(e)
    await step($, 1)
    return { drop: '' }
  }).catch(($, e, next) => (e.text.startsWith(PREFIX) ? { drop: '' } : next(e)))

  // Prompt style: the count and the two buttons, on the hint line under the
  // prompt.
  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    const now = await read($, search)
    if (style !== 'prompt' || !now.isOpen) return next(e)
    const { Box, Button, Text } = $.ui.resolve(e)
    const total = now.hits.length
    const where = !now.query
      ? 'type to search'
      : total === 0
        ? 'no matches'
        : now.current < 0
          ? `${total} found`
          : `${now.current + 1}/${total}`

    return (
      <Box flexDirection="row" gap={1}>
        <Text dimColor>find {where} ·</Text>
        <Button key="next" plain action={NEXT_ACTION} onPress={() => step($, 1)}>
          enter next
        </Button>
        <Text dimColor>·</Text>
        <Button key="previous" plain action={PREVIOUS_ACTION} onPress={() => step($, -1)}>
          shift+enter previous
        </Button>
        <Text dimColor>· esc close</Text>
      </Box>
    )
  })

  // Tab leaves the bar, as Esc does.  It reaches the mod as the focus moving
  // off the field onto the control after it (shift+Tab, Up and Down move it
  // the same way: the engine reports them alike, and it lets no scroll answer
  // such a move, so they cannot step).  The field sits between two controls,
  // the "find:" label and the close mark, so there is somewhere to move to.
  on('ui.focus', async ($, e, next) => {
    const isLeaving = e.origin.kind === 'person' && !(e.element ?? '').startsWith('query-')
    if (!isLeaving || e.requestId !== band || !(await read($, search)).isOpen) return next(e)
    await close($)
    return {}
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const now = await read($, search)
    if (!now.isOpen || style !== 'bar' || e.props.hasSurvey) return next(e)
    band = e.requestId
    const { Box, Button, Input, Text } = $.ui.resolve(e)
    const total = now.hits.length
    // On a narrow window the bar keeps to one line: no hint.
    const isNarrow = e.props.bodyColumns < 76
    const where = !now.query
      ? ''
      : total === 0
        ? 'no matches'
        : now.current < 0
          ? `${total} found`
          : `${now.current + 1}/${total}`

    return (
      <Box flexDirection="row" gap={1}>
        <Button key="leave-before" plain onPress={() => close($)}>
          find:
        </Button>
        <Input
          key={fieldKey(now)}
          value={now.query}
          autoFocus
          submitLabel="next"
          onInput={async typed => {
            // shift+Enter types a newline into the field: "previous".
            const value = typed.replace(/\n/g, '')
            if (typed.includes('\n')) {
              if (value && value !== (await read($, search)).query) await setQuery($, value)
              await step($, -1)
              await refield($)
            } else await setQuery($, value)
          }}
          onSubmit={async typed => {
            const value = typed.replace(/\n/g, '')
            if (value && value !== (await read($, search)).query) await setQuery($, value)
            await step($, 1)
            await refield($)
          }}
        />
        <Text dimColor>{where}</Text>
        {isNarrow ? [] : [<Text dimColor>shift+enter previous · esc close</Text>]}
        <Button key="leave-after" plain onPress={() => close($)}>
          ✕
        </Button>
      </Box>
    )
  })

  on('ui.render', { component: 'UserMessage' }, async ($, e, next) => {
    track(e.requestId, e.props.onScreen)
    const now = await read($, search)
    const isPlain = !e.props.task && !e.props.from
    if (!now.query || !isPlain || !ranges(e.props.text, now.query).length) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const tally: Tally = { seen: 0, selected: selectedIn(now, e.requestId) }

    // The engine's own row opens with a blank line; so does this one.
    return (
      <Box flexDirection="column">
        <Text> </Text>
        <Box flexDirection="row">
        <Text dimColor>❯ </Text>
        <Text>
          {mark([{ text: e.props.text }], now.query, tally).map(piece => (
            <Text {...look(piece)}>{piece.text}</Text>
          ))}
        </Text>
        </Box>
      </Box>
    )
  })

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    track(e.requestId, e.props.onScreen)
    const now = await read($, search)
    if (!now.query || !countIn(e.props.text, now.query)) return next(e)
    const { Box, Markdown, Text } = $.ui.resolve(e)
    const tally: Tally = { seen: 0, selected: selectedIn(now, e.requestId) }
    const columns = Math.max(30, (e.viewport?.columns ?? 100) - 4)
    const draw = (pieces: Piece[]) =>
      pieces.length
        ? pieces.map(piece => <Text {...look(piece)}>{piece.text}</Text>)
        : ' '

    // A reply taller than the window shows its top, wherever in it the engine
    // was asked to go.  So when the selected match lies far down its reply,
    // the blocks above it fold into one dim line while it is selected, which
    // puts the match near the top: the part that shows.
    const list = blocks(e.props.text)
    const parsed = list.map(parse)
    const counts = parsed.map(drawn => matchesIn(drawn, now.query))
    let holder = -1 // the block holding the selected match
    for (let i = 0, seen = 0; i < counts.length && tally.selected >= 0; i++) {
      seen += counts[i] ?? 0
      if (tally.selected < seen) {
        holder = i
        break
      }
    }
    const heights = list.map(block => rowsOf(block, columns))
    const rows = e.viewport?.rows ?? 40
    const above = heights.slice(0, Math.max(0, holder)).reduce((sum, h) => sum + h + 1, 0)
    let folded = 0 // how many leading blocks are folded away
    if (holder > 0 && above > rows * 0.4)
      // Keep the block just above as context when it is short.
      folded = (heights[holder - 1] ?? 0) <= rows * 0.25 ? holder - 1 : holder

    // A block holding a match is drawn here, formatted as the engine would
    // (bold, code, lists, a table's grid) with the match painted over it;
    // every other block is left to the engine's own markdown.
    return (
      <Box flexDirection="column">
        <Text> </Text>
        <Box flexDirection="row">
        <Text>{e.props.isFirstOfReply ? '● ' : '  '}</Text>
        <Box flexDirection="column" gap={1}>
          {folded > 0
            ? [<Text dimColor>⋯ {folded} {folded === 1 ? 'paragraph' : 'paragraphs'} above</Text>]
            : []}
          {list.flatMap((block, i) => {
            const drawn = parsed[i] ?? []
            if (i < folded) {
              tally.seen += counts[i] ?? 0 // its matches still count
              return []
            }
            if (!counts[i]) return [<Markdown text={block} />]
            const lines = drawn.flatMap(one =>
                  one.kind === 'table'
                    ? grid(one, now.query, tally, columns).map(line => (
                        <Text wrap="truncate-end">{draw(line)}</Text>
                      ))
                    : [
                        <Box flexDirection="row">
                          {one.prefix
                            ? [<Text>{one.prefix}</Text>, <Text>{draw(mark(one.spans, now.query, tally))}</Text>]
                            : [<Text>{draw(mark(one.spans, now.query, tally))}</Text>]}
                        </Box>,
                      ],
            )
            return [<Box flexDirection="column">{lines}</Box>]
          })}
        </Box>
        </Box>
      </Box>
    )
  })
}
