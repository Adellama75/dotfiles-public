// What a reply's markdown looks like once drawn, so the find bar can search
// the visible text (not the `**` around bold or a table's pipes) and paint a
// match without undoing the formatting around it.  No engine calls here.

/** How a run of text is drawn. */
export type Style = {
  bold?: boolean
  italic?: boolean
  strike?: boolean
  dim?: boolean
  /** Inline code or a code block's line. */
  code?: boolean
}

/** A run of visible text in one style. */
export type Span = Style & { text: string }

/** A span, or the part of one a match covers. */
export type Piece = Span & { mark?: 'selected' | 'other' }

/** One drawn line: a marker kept as typed (`- `, `1. `, an indent), then its text. */
export type Line = { kind: 'line'; prefix: string; spans: Span[] }

/** A table: its header cells, then its rows of cells. */
export type Table = { kind: 'table'; header: Span[][]; rows: Span[][][] }

export type Drawn = Line | Table

const ESCAPABLE = /[\\`*_{}[\]()#+\-.!|~>]/

/** Whether `mark` closes later in `source`, after text that does not end in a space. */
const closes = (source: string, from: number, mark: string) => {
  for (let at = source.indexOf(mark, from); at >= 0; at = source.indexOf(mark, at + 1)) {
    const before = source[at - 1]
    if (at > from && before !== undefined && before !== ' ') return true
  }
  return false
}

const isWord = (ch: string | undefined) => ch !== undefined && /[\p{L}\p{N}]/u.test(ch)

/** Inline markdown as styled spans: code, bold, italic, strikethrough, links, escapes. */
export const inline = (source: string, base: Style = {}): Span[] => {
  const out: Span[] = []
  let bold = false
  let italic = false
  let strike = false
  let text = ''
  const flush = () => {
    if (!text) return
    out.push({
      ...base,
      text,
      ...(base.bold || bold ? { bold: true } : {}),
      ...(base.italic || italic ? { italic: true } : {}),
      ...(strike ? { strike: true } : {}),
    })
    text = ''
  }
  let i = 0
  while (i < source.length) {
    const ch = source[i] as string
    const next = source[i + 1]
    const before = source[i - 1]
    if (ch === '\\' && next !== undefined && ESCAPABLE.test(next)) {
      text += next
      i += 2
      continue
    }
    if (ch === '`') {
      let ticks = 1
      while (source[i + ticks] === '`') ticks++
      const fence = '`'.repeat(ticks)
      const end = source.indexOf(fence, i + ticks)
      if (end >= 0) {
        flush()
        out.push({ ...base, text: source.slice(i + ticks, end), code: true })
        i = end + ticks
        continue
      }
    }
    if (ch === '[') {
      const link = /^\[([^\]]+)\]\(([^)\s]+)\)/.exec(source.slice(i))
      if (link) {
        flush()
        out.push(
          ...inline(link[1] as string, {
            ...base,
            ...(base.bold || bold ? { bold: true } : {}),
            ...(base.italic || italic ? { italic: true } : {}),
          }),
        )
        i += link[0].length
        continue
      }
    }
    if (ch === '~' && next === '~') {
      if (strike || closes(source, i + 2, '~~')) {
        flush()
        strike = !strike
        i += 2
        continue
      }
    }
    if (ch === '*' || ch === '_') {
      const isDouble = next === ch
      const width = isDouble ? 2 : 1
      const after = source[i + width]
      // An underscore inside a word (snake_case) is text.
      const isInsideWord = ch === '_' && isWord(before) && isWord(after)
      const isOn = isDouble ? bold : italic
      const canClose = isOn && before !== undefined && before !== ' '
      const canOpen =
        !isOn && after !== undefined && after !== ' ' && closes(source, i + width, ch.repeat(width))
      if (!isInsideWord && (canClose || canOpen)) {
        flush()
        if (isDouble) bold = !bold
        else italic = !italic
        i += width
        continue
      }
    }
    text += ch
    i++
  }
  flush()
  return out
}

/** A table row's cells: the outer pipes dropped, split on unescaped pipes outside code. */
const cells = (row: string): Span[][] => {
  const parts: string[] = []
  let cell = ''
  let isCode = false
  const body = row.trim().replace(/^\|/, '').replace(/\|$/, '')
  for (let i = 0; i < body.length; i++) {
    const ch = body[i] as string
    if (ch === '\\' && body[i + 1] === '|') {
      cell += '|'
      i++
    } else if (ch === '`') {
      isCode = !isCode
      cell += ch
    } else if (ch === '|' && !isCode) {
      parts.push(cell)
      cell = ''
    } else cell += ch
  }
  parts.push(cell)
  return parts.map(part => inline(part.trim()))
}

const isTableRule = (line: string) =>
  /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/.test(line) && line.includes('-')

/** A reply's markdown as blocks: blank-line separated, a code fence kept whole. */
export const blocks = (markdown: string): string[] => {
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

/** One block as what is drawn for it. */
export const parse = (block: string): Drawn[] => {
  const lines = block.split('\n')
  const first = lines[0] ?? ''
  if (/^\s*(```|~~~)/.test(first)) {
    const body = lines.slice(1)
    if (/^\s*(```|~~~)\s*$/.test(body[body.length - 1] ?? '')) body.pop()
    return body.map(line => ({ kind: 'line', prefix: '', spans: [{ text: line, code: true }] }))
  }
  if (lines.length >= 2 && first.includes('|') && isTableRule(lines[1] ?? ''))
    return [{ kind: 'table', header: cells(first), rows: lines.slice(2).map(cells) }]
  return lines.map((line): Line => {
    const heading = /^\s{0,3}#{1,6}\s+(.*)$/.exec(line)
    if (heading) return { kind: 'line', prefix: '', spans: inline(heading[1] as string, { bold: true }) }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line))
      return { kind: 'line', prefix: '', spans: [{ text: '─'.repeat(40), dim: true }] }
    const item = /^(\s*(?:[-*+]|\d+[.)])\s+)(.*)$/.exec(line)
    if (item) return { kind: 'line', prefix: item[1] as string, spans: inline(item[2] as string) }
    const quote = /^\s*>\s?(.*)$/.exec(line)
    if (quote)
      return { kind: 'line', prefix: '│ ', spans: inline(quote[1] as string, { italic: true, dim: true }) }
    const indent = /^\s*/.exec(line)?.[0] ?? ''
    return { kind: 'line', prefix: indent, spans: inline(line.slice(indent.length)) }
  })
}

const visible = (spans: Span[]) => spans.map(span => span.text).join('')

/** The stretches of visible text a match cannot cross: a line, a table cell. */
export const units = (drawn: Drawn[]): Span[][] =>
  drawn.flatMap(one => (one.kind === 'line' ? [one.spans] : [...one.header, ...one.rows.flat()]))

/** Where `query` occurs in `text`: [start, end) pairs.  Lowercase query: any case. */
export const ranges = (text: string, query: string): [number, number][] => {
  if (!query) return []
  const isExact = query !== query.toLowerCase()
  const hay = isExact ? text : text.toLowerCase()
  const needle = isExact ? query : query.toLowerCase()
  const found: [number, number][] = []
  for (let at = hay.indexOf(needle); at >= 0; at = hay.indexOf(needle, at + needle.length))
    found.push([at, at + needle.length])
  return found
}

/** How many matches a reply's visible text holds. */
export const countIn = (markdown: string, query: string) =>
  blocks(markdown)
    .flatMap(block => units(parse(block)))
    .reduce((sum, unit) => sum + ranges(visible(unit), query).length, 0)

/** Whether a block's visible text holds a match. */
export const hasMatch = (drawn: Drawn[], query: string) =>
  units(drawn).some(unit => ranges(visible(unit), query).length > 0)

/** Matches drawn so far in a row, and which of them is the selected one (-1: none). */
export type Tally = { seen: number; selected: number }

/** A unit's spans cut where its matches begin and end, the matches marked. */
export const mark = (spans: Span[], query: string, tally: Tally): Piece[] => {
  const found = ranges(visible(spans), query)
  if (!found.length) return spans
  const marks = found.map(() => (tally.seen++ === tally.selected ? 'selected' : 'other') as 'selected' | 'other')
  const out: Piece[] = []
  let offset = 0
  for (const span of spans) {
    const end = offset + span.text.length
    let at = offset
    found.forEach(([from, to], n) => {
      if (to <= at || from >= end) return
      const start = Math.max(from, at)
      if (start > at) out.push({ ...span, text: span.text.slice(at - offset, start - offset) })
      const stop = Math.min(to, end)
      out.push({ ...span, text: span.text.slice(start - offset, stop - offset), mark: marks[n] as 'selected' | 'other' })
      at = stop
    })
    if (at < end) out.push({ ...span, text: span.text.slice(at - offset) })
    offset = end
  }
  return out
}

const width = (text: string) => [...text].length

/** Pieces broken into lines at most `columns` wide, at spaces where it can. */
export const wrap = (pieces: Piece[], columns: number): Piece[][] => {
  const lines: Piece[][] = [[]]
  let used = 0
  const push = (piece: Piece) => {
    const line = lines[lines.length - 1] as Piece[]
    const last = line[line.length - 1]
    const { text, ...style } = piece
    const { text: _, ...lastStyle } = last ?? { text: '' }
    if (last && JSON.stringify(style) === JSON.stringify(lastStyle)) last.text += text
    else line.push({ ...piece })
    used += width(text)
  }
  const breakLine = () => {
    lines.push([])
    used = 0
  }
  for (const piece of pieces)
    for (const token of piece.text.split(/( +)/)) {
      if (!token) continue
      const isSpace = token.startsWith(' ')
      if (isSpace) {
        if (used > 0 && used + width(token) <= columns) push({ ...piece, text: token })
        continue // a space at a line's start or past its end is dropped
      }
      let word = token
      if (used > 0 && used + width(word) > columns) breakLine()
      while (width(word) > columns) {
        if (used >= columns) breakLine()
        const head = [...word].slice(0, columns - used).join('')
        push({ ...piece, text: head })
        word = word.slice(head.length)
        breakLine()
      }
      if (word) push({ ...piece, text: word })
    }
  // Trailing spaces on a wrapped line would shift the cell's padding.
  for (const line of lines) {
    const last = line[line.length - 1]
    if (last && last.text.endsWith(' ') && !last.mark) last.text = last.text.trimEnd()
  }
  return lines
}

const lengthOf = (pieces: Piece[]) => pieces.reduce((sum, piece) => sum + width(piece.text), 0)

/**
 * A table as the lines of a box grid, in at most `columns` columns: a centred
 * header, a rule under every row, cells wrapped to their column.
 */
export const grid = (table: Table, query: string, tally: Tally, columns: number): Piece[][] => {
  const all = [table.header, ...table.rows]
  const count = Math.max(...all.map(row => row.length))
  const marked = all.map(row => Array.from({ length: count }, (_, n) => mark(row[n] ?? [], query, tally)))
  const widths = Array.from({ length: count }, (_, n) =>
    Math.max(3, ...marked.map(row => lengthOf(row[n] as Piece[]))),
  )
  // Narrow the widest column until the grid fits (3 cells of frame per column, 1 more).
  const room = Math.max(count * 6, columns - (3 * count + 1))
  while (widths.reduce((a, b) => a + b, 0) > room) {
    const widest = widths.indexOf(Math.max(...widths))
    if ((widths[widest] as number) <= 5) break
    widths[widest] = (widths[widest] as number) - 1
  }
  const rule = (left: string, mid: string, right: string): Piece[] => [
    { text: left + widths.map(w => '─'.repeat(w + 2)).join(mid) + right },
  ]
  const out: Piece[][] = [rule('┌', '┬', '┐')]
  marked.forEach((row, r) => {
    const wrapped = row.map((cell, n) => wrap(cell, widths[n] as number))
    const height = Math.max(...wrapped.map(lines => lines.length))
    for (let l = 0; l < height; l++) {
      const line: Piece[] = [{ text: '│' }]
      wrapped.forEach((lines, n) => {
        const cell = lines[l] ?? []
        const spare = (widths[n] as number) - lengthOf(cell)
        const left = r === 0 ? Math.floor(spare / 2) : 0
        line.push({ text: ' '.repeat(1 + left) }, ...cell, { text: ' '.repeat(spare - left + 1) + '│' })
      })
      out.push(line)
    }
    out.push(r === marked.length - 1 ? rule('└', '┴', '┘') : rule('├', '┼', '┤'))
  })
  return out
}

/** How many matches a block's visible text holds. */
export const matchesIn = (drawn: Drawn[], query: string) =>
  units(drawn).reduce((sum, unit) => sum + ranges(visible(unit), query).length, 0)

/** About how many rows a block takes in `columns` columns (its markers count as text). */
export const rowsOf = (block: string, columns: number) =>
  block
    .split('\n')
    .reduce((sum, line) => sum + Math.max(1, Math.ceil(width(line) / Math.max(1, columns))), 0)
