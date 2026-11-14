import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Hit, Search } from '../types'

// ctrl+f: find in the conversation.  A bar opens above the prompt; every match
// in your messages and Claude's replies is highlighted in place as you type
// (tool output is never searched: only message rows are).  Enter or Down goes
// to the next hit, oldest first; shift+Enter or Up to the previous one; Esc
// closes the bar and clears the highlights.

const TRIGGER = '\uE0CF'
const NONE: Search = { isOpen: false, query: '', hits: [], current: -1 }
const search = atom({ plugin: 'find', key: 'search' } as const, NONE)

// Colours: the selected hit orange, the others yellow, dark text on both.
const SELECTED = '#F0A04B'
const OTHER = '#F9E2AF'
const INK = '#151520'

type Message = { id: string; text: string }

// Lowercase query: ignore case.  A capital in it: match case.
const matcher = (query: string) => {
  const isExact = query !== query.toLowerCase()
  const needle = isExact ? query : query.toLowerCase()
  return (text: string) => (isExact ? text : text.toLowerCase()).indexOf(needle)
}

const has = (text: string, query: string) => matcher(query)(text) >= 0

/** `text` cut into [plain, match, plain, match, ..., plain]. */
const cut = (text: string, query: string): string[] => {
  const isExact = query !== query.toLowerCase()
  const hay = isExact ? text : text.toLowerCase()
  const needle = isExact ? query : query.toLowerCase()
  const parts: string[] = []
  let from = 0
  for (;;) {
    const at = hay.indexOf(needle, from)
    if (at < 0) break
    parts.push(text.slice(from, at), text.slice(at, at + needle.length))
    from = at + needle.length
  }
  parts.push(text.slice(from))
  return parts
}

/** A reply's markdown as blocks: blank-line separated, a code fence kept whole. */
const blocks = (markdown: string): string[] => {
  const out: string[] = []
  let block: string[] = []
  let isFenced = false
  for (const line of markdown.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) isFenced = !isFenced
    if (!isFenced && line.trim() === '') {
      if (block.length) out.push(block.join('\n'))
      block = []
    } else block.push(line)
  }
  if (block.length) out.push(block.join('\n'))
  return out
}

/** Which match of a row is the selected one: its index there, or -1. */
const selectedIn = (now: Search, rowId: string) => {
  const hit = now.hits[now.current]
  return hit && hit.id === rowId ? hit.n : -1
}

// Reads the session's transcript file and prints one {id, text} JSON line per
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
        print(json.dumps({"id": e["uuid"], "text": text}))
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

/** How many times `query` occurs in `text`. */
const count = (text: string, query: string) => (cut(text, query).length - 1) / 2

/** Every match in the session, oldest first: its message row and which one in it. */
const hitsFor = (query: string): Hit[] =>
  query
    ? messages.flatMap(m =>
        Array.from({ length: count(m.text, query) }, (_, n) => ({ id: m.id, n })),
      )
    : []

const setQuery = ($: EngineInterface, query: string) =>
  update($, search, () => ({ isOpen: true, query, hits: hitsFor(query), current: -1 }))

/** Select the next (+1) or previous (-1) hit, wrapping, and scroll to it. */
const step = async ($: EngineInterface, by: 1 | -1) => {
  const now = await read($, search)
  if (!now.hits.length) return
  const total = now.hits.length
  const current =
    now.current < 0 ? (by > 0 ? 0 : total - 1) : (now.current + by + total) % total
  const target = now.hits[current]
  if (!target) return
  await update($, search, s => ({ ...s, current }))
  // The chat only guesses the height of rows it has not drawn, so a long
  // jump can land beside the row: go there, let it draw, and go again.
  const answer = await $.ui.scroll({ to: { requestId: target.id }, block: 'center' })
  if (answer?.deny) {
    $.ui.toast(`find: could not scroll there (${answer.deny})`)
    return
  }
  await $.clock.sleep(120)
  await $.ui.scroll({ to: { requestId: target.id }, block: 'center' })
}

// The band's id, learnt when it is first drawn; $.ui.focus names it.
let band = ''

// Esc in the bar hands the keyboard back to the prompt without telling the
// mod.  So while the bar is up, ask now and then whether its field can still
// take the focus: once it could and no longer can, the person has left, and
// the bar closes as a browser's does.
let watch: { cancel: () => void } | undefined

const close = async ($: EngineInterface) => {
  watch?.cancel()
  watch = undefined
  await update($, search, () => NONE)
}

const open = async ($: EngineInterface) => {
  await load($)
  await update($, search, s => ({ ...s, isOpen: true }))
  watch?.cancel()
  let wasHeld = false
  let misses = 0
  watch = $.clock.every(250, async () => {
    if (!band) return
    const answer = await $.ui.focus({ requestId: band, key: 'query' })
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
      description: 'Find in the conversation (also ctrl+f): Enter / shift+Enter step, Esc closes',
    })
    // A bar left open by an earlier load has no watch: start closed.
    if ((await read($, search)).isOpen) await update($, search, () => NONE)
    return next(e)
  })

  on('command.run', { command: 'find' }, async ($, e) => {
    await open($)
    const query = e.args.trim()
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
    const isKey = e.key?.ctrl === true && e.key.key === 'f'
    if (isKey || e.inputText.includes(TRIGGER)) {
      await open($)
      return { text: e.text, cursor: e.cursor }
    }
    // Writing in the prompt again: the search is over.
    if (e.inputText && (await read($, search)).isOpen) await close($)
    return next(e)
  })

  // Up and Down in the field move the focus to the control before or after
  // it (so do shift+Tab and Tab: the engine reports the four alike).  Those
  // two controls are the bar's "previous" and "next" marks: take the move as
  // a step, and keep the focus in the field.  (A click on a mark is such a
  // move too, so the marks' own presses do nothing more.)
  on('ui.focus', async ($, e, next) => {
    const isStep =
      e.origin.kind === 'person' && (e.element === 'previous' || e.element === 'next')
    if (!isStep || !(await read($, search)).isOpen) return next(e)
    await step($, e.element === 'next' ? 1 : -1)
    return {}
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const now = await read($, search)
    if (!now.isOpen || e.props.hasSurvey) return next(e)
    band = e.requestId
    const { Box, Button, Input, Text } = $.ui.resolve(e)
    const total = now.hits.length
    // The field empties on Enter, so the query is named beside the count.
    const where = !now.query
      ? ''
      : total === 0
        ? 'no matches'
        : now.current < 0
          ? `${total} found`
          : `"${now.query}" ${now.current + 1}/${total}`

    return (
      <Box flexDirection="row" gap={1}>
        <Button key="previous" plain onPress={() => {}}>
          ↑
        </Button>
        <Input
          key="query"
          label="find"
          value={now.query}
          autoFocus
          submitLabel="next"
          onInput={async typed => {
            // shift+Enter types a newline into the field: "previous".
            const value = typed.replace(/\n/g, '')
            const held = (await read($, search)).query
            if (typed.includes('\n')) {
              // After an Enter the field is empty: keep the search it ran.
              if (value && value !== held) await setQuery($, value)
              await step($, -1)
            } else await setQuery($, value)
          }}
          onSubmit={async typed => {
            const value = typed.replace(/\n/g, '')
            if (value && value !== (await read($, search)).query) await setQuery($, value)
            await step($, 1)
          }}
        />
        <Button key="next" plain onPress={() => {}}>
          ↓
        </Button>
        <Text dimColor>{where}</Text>
        <Text dimColor>esc close</Text>
      </Box>
    )
  })

  on('ui.render', { component: 'UserMessage' }, async ($, e, next) => {
    const now = await read($, search)
    const isPlain = !e.props.task && !e.props.from
    if (!now.query || !isPlain || !has(e.props.text, now.query)) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const selected = selectedIn(now, e.requestId)

    return (
      <Box flexDirection="row">
        <Text dimColor>❯ </Text>
        <Text>
          {cut(e.props.text, now.query).map((part, i) =>
            i % 2 ? (
              <Text
                backgroundColor={(i - 1) / 2 === selected ? SELECTED : OTHER}
                color={INK}
              >
                {part}
              </Text>
            ) : (
              part
            ),
          )}
        </Text>
      </Box>
    )
  })

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    const now = await read($, search)
    if (!now.query || !has(e.props.text, now.query)) return next(e)
    const { Box, Markdown, Text } = $.ui.resolve(e)
    const selected = selectedIn(now, e.requestId)
    let seen = 0 // matches drawn so far in this row, in reading order

    // A block holding a match is drawn as its source with the match painted;
    // every other block keeps its markdown.
    return (
      <Box flexDirection="row">
        <Text>{e.props.isFirstOfReply ? '● ' : '  '}</Text>
        <Box flexDirection="column" gap={1}>
          {blocks(e.props.text).map(block =>
            has(block, now.query) ? (
              <Text>
                {cut(block, now.query).map((part, i) =>
                  i % 2 ? (
                    <Text
                      backgroundColor={seen++ === selected ? SELECTED : OTHER}
                      color={INK}
                    >
                      {part}
                    </Text>
                  ) : (
                    part
                  ),
                )}
              </Text>
            ) : (
              <Markdown text={block} />
            ),
          )}
        </Box>
      </Box>
    )
  })
}
