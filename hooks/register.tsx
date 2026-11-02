import type { Register } from 'claude-code'

// Matches the user's omp screenshots. Bold = bold only, no color.
const CODE = '#89d281' // green: inline code, paths, commands
const PATH = '#89d281'
const MARK = '#0088fa' // blue: list dashes and numbers
const STR = '#d7ba7d' // yellow: strings in shell code blocks
const RULE = '#777d88' // gray: table lines

// Split reply text into blocks at blank lines, keeping ``` fences whole.
function blocks(text: string): string[] {
  const out: string[] = []
  let cur: string[] = []
  let inFence = false
  for (const line of text.split('\n')) {
    if (line.trim().startsWith('```')) inFence = !inFence
    if (!inFence && line.trim() === '') {
      if (cur.length) out.push(cur.join('\n'))
      cur = []
    } else cur.push(line)
  }
  if (cur.length) out.push(cur.join('\n'))
  return out
}

type Seg = { t: string; kind: 'plain' | 'bold' | 'code' | 'path' | 'italic' | 'link' | 'url' | 'strike' }

// **bold**, `code`, [link](url), ~~strike~~, *italic* / _italic_, paths like ~/x.
function inline(line: string): Seg[] {
  const segs: Seg[] = []
  const re = /\*\*([^*]+)\*\*|`([^`]+)`|((?:~|\/)[\w.\-/]+[\w/])|\[([^\]]+)\]\(([^)\s]+)\)|~~([^~]+)~~|(?<![\w*])\*([^*\s][^*]*?)\*(?!\w)|(?<!\w)_([^_\s][^_]*?)_(?!\w)/g
  let last = 0
  for (const m of line.matchAll(re)) {
    if (m.index! > last) segs.push({ t: line.slice(last, m.index), kind: 'plain' })
    if (m[1]) segs.push({ t: m[1], kind: 'bold' })
    else if (m[2]) segs.push({ t: m[2], kind: 'code' })
    else if (m[3]) segs.push({ t: m[3], kind: 'path' })
    else if (m[4]) {
      segs.push({ t: m[4], kind: 'link' })
      if (m[5] && m[5] !== m[4]) segs.push({ t: ' (' + m[5] + ')', kind: 'url' })
    }
    else if (m[6]) segs.push({ t: m[6], kind: 'strike' })
    else segs.push({ t: m[7] ?? m[8] ?? '', kind: 'italic' })
    last = m.index! + m[0].length
  }
  if (last < line.length) segs.push({ t: line.slice(last), kind: 'plain' })
  return segs
}

const plainLen = (s: string) => inline(s).reduce((n, g) => n + g.t.length, 0)

// "| a | b |" -> ["a", "b"]
const cells = (row: string) =>
  row.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim())

// Shell line -> segments: quoted strings yellow, command words green.
type CSeg = { t: string; color?: string }
function shell(line: string): CSeg[] {
  const out: CSeg[] = []
  const re = /('[^']*'|"[^"]*")|(\s+)|([|;&]+)|([^\s'"|;&]+)/g
  let cmdNext = true
  for (const m of line.matchAll(re)) {
    if (m[1]) out.push({ t: m[1], color: STR })
    else if (m[2]) out.push({ t: m[2] })
    else if (m[3]) { out.push({ t: m[3] }); cmdNext = true }
    else if (m[4]) {
      if (cmdNext && !m[4].includes('=')) { out.push({ t: m[4], color: CODE }); cmdNext = false }
      else out.push({ t: m[4] })
    }
  }
  return out
}

export const register: Register = on => {
  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    if (e.surface !== 'terminal') return next(e)
    const { Box, Text, Markdown } = $.ui.resolve(e)
    const cols = e.viewport?.columns ?? 100

    const segs = (s: string, k: string) =>
      inline(s).map((g, j) =>
        g.kind === 'bold' ? <Text key={k + j} bold>{g.t}</Text>
        : g.kind === 'code' ? <Text key={k + j} color={CODE}>{g.t}</Text>
        : g.kind === 'path' ? <Text key={k + j} color={PATH}>{g.t}</Text>
        : g.kind === 'link' ? <Text key={k + j} color={MARK} underline>{g.t}</Text>
        : g.kind === 'url' ? <Text key={k + j} color={RULE}>{g.t}</Text>
        : g.kind === 'italic' ? <Text key={k + j} italic>{g.t}</Text>
        : g.kind === 'strike' ? <Text key={k + j} strikethrough>{g.t}</Text>
        : <Text key={k + j}>{g.t}</Text>,
      )

    const drawLine = (line: string, i: number) => {
      if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line))
        return <Text key={String(i)} color={RULE}>{'─'.repeat(Math.min(cols - 2, 40))}</Text>
      const quote = line.match(/^\s*>\s?(.*)$/)
      if (quote) return <Text key={String(i)}><Text color={RULE}>│ </Text><Text color={RULE}>{segs(quote[1] ?? '', 'q')}</Text></Text>
      const head = line.match(/^(#{1,6})\s+(.*)$/)
      if (head) return <Text key={String(i)} bold>{segs(head[2] ?? '', 'h')}</Text>
      const li = line.match(/^(\s*)([-*]|\d+\.)\s+(.*)$/)
      const body = li ? li[3] ?? '' : line
      return (
        <Text key={String(i)}>
          {li ? <Text color={MARK}>{(li[1] ?? '') + (li[2] === '*' ? '-' : li[2] ?? '') + ' '}</Text> : null}
          {segs(body, 's')}
        </Text>
      )
    }

    const drawTable = (b: string, i: number) => {
      const rows = b.split('\n').filter(r => !/^\s*\|?[\s:\-|]+\|?\s*$/.test(r)).map(cells)
      const n = Math.max(...rows.map(r => r.length))
      const w = Array.from({ length: n }, (_, c) => Math.max(...rows.map(r => plainLen(r[c] ?? ''))))
      const total = w.reduce((a, x) => a + x + 3, 1)
      if (total > cols) return <Markdown key={String(i)} text={b} />
      const rule = (l: string, m: string, r: string) =>
        <Text color={RULE}>{l + w.map(x => '─'.repeat(x + 2)).join(m) + r}</Text>
      return (
        <Box key={String(i)} flexDirection="column">
          {rule('┌', '┬', '┐')}
          {rows.map((r, ri) => (
            <Box key={String(ri)} flexDirection="column">
              <Text>
                {w.map((x, c) => {
                  const cell = r[c] ?? ''
                  const pad = ' '.repeat(x - plainLen(cell))
                  return (
                    <Text key={String(c)}>
                      <Text color={RULE}>│ </Text>
                      {ri === 0 ? <Text bold>{segs(cell, 'c')}</Text> : segs(cell, 'c')}
                      {pad + ' '}
                    </Text>
                  )
                })}
                <Text color={RULE}>│</Text>
              </Text>
              {ri < rows.length - 1 ? rule('├', '┼', '┤') : null}
            </Box>
          ))}
          {rule('└', '┴', '┘')}
        </Box>
      )
    }

    const drawFence = (b: string, i: number) => {
      const lines = b.split('\n')
      const lang = (lines[0] ?? '').trim().slice(3).trim()
      if (lang && !/^(bash|sh|zsh|shell|console)$/.test(lang)) return <Markdown key={String(i)} text={b} />
      const body = lines.slice(1, lines[lines.length - 1]?.trim().startsWith('```') ? -1 : undefined)
      return (
        <Box key={String(i)} flexDirection="column">
          {body.map((l, li) => (
            <Text key={String(li)}>
              {shell(l).map((s, j) => s.color ? <Text key={String(j)} color={s.color}>{s.t}</Text> : <Text key={String(j)}>{s.t}</Text>)}
            </Text>
          ))}
        </Box>
      )
    }

    return (
      <Box flexDirection="column">
        {blocks(e.props.text).map((b, i) => {
          const t = b.trimStart()
          return (
            <Box key={String(i)} flexDirection="column" marginBottom={1}>
              {t.startsWith('```') ? drawFence(b, i)
                : t.startsWith('|') ? drawTable(b, i)
                : b.split('\n').map(drawLine)}
            </Box>
          )
        })}
      </Box>
    )
  })
}
