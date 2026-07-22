// D13 Game Gallery — data + rendering. No build step, no framework.

// Data source. Reads the live Google Sheet via gviz; falls back to the committed
// dev-games.csv fixture offline / on CORS error / until SHEET_ID is filled in.
// The Sheet is owned by d13-internal@ (see plans/submission-form.md). One tab;
// gviz returns the first tab, so no gid needed.
const SHEET_ID = '12Hk1XPXvSNmTpBzqEn-hjxQepYFsdij9vYH0GL4nRdk'   // paste the game-gallery Sheet id once created
const GVIZ_CSV = SHEET_ID
  ? `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv`
  : ''
const FALLBACK_CSV = 'dev-games.csv'

async function loadCSV() {
  if (GVIZ_CSV) {
    try {
      const r = await fetch(GVIZ_CSV)
      if (r.ok) return await r.text()
    } catch { /* offline / CORS → fall through to fixture */ }
  }
  return (await fetch(FALLBACK_CSV)).text()
}

// ponytail: minimal RFC-4180 CSV parser — game titles contain commas, so a
// bare split() is wrong. Handles quoted fields and "" escapes. Upgrade to a
// library only if the sheet starts carrying embedded newlines inside cells.
function parseCsv(text) {
  const rows = []
  let row = [], field = '', inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ }
        else inQuotes = false
      } else field += c
    } else if (c === '"') inQuotes = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field); field = ''
      if (row.some(v => v !== '')) rows.push(row)
      row = []
    } else field += c
  }
  if (field !== '' || row.length) { row.push(field); if (row.some(v => v !== '')) rows.push(row) }
  return rows
}

function parseGamesCsv(text) {
  const rows = parseCsv(text)
  if (!rows.length) return []
  const header = rows[0].map(h => h.trim())
  return rows.slice(1)
    .map(cells => {
      const r = {}
      header.forEach((h, i) => { r[h] = (cells[i] ?? '').trim() })
      // No D13 re-host yet? Play the student's own share URL. d13_url drives
      // the gate, iframe, and thumbnail, so filling it here covers all three.
      if (!r.d13_url) r.d13_url = r.student_url || ''
      return r
    })
    // Publish gate: shown only when approved (active) AND playable (d13_url)
    // AND linkable (id). active alone isn't enough — staff may tick it before
    // finishing the D13 re-host that fills d13_url + id.
    .filter(g => g.id && g.d13_url && /^true$/i.test(g.active || ''))
}

const sortByNewest = games =>
  [...games].sort((a, b) => (b.submitted_at || '').localeCompare(a.submitted_at || ''))

const findGame = (games, id) => {
  const key = String(id).trim().toLowerCase()
  return games.find(g => g.id.trim().toLowerCase() === key)
}

function extractShareId(d13Url) {
  try {
    const seg = new URL(d13Url).pathname.split('/').filter(Boolean)
    return seg.length ? seg[seg.length - 1] : null
  } catch { return null }
}

const thumbUrl = shareId => `https://makecode.com/api/${shareId}/thumb`

// "5" -> "Grade 5"; "Intern"/"Instructor" pass through unchanged.
const gradeLabel = grade => /^\d+$/.test(grade) ? `Grade ${grade}` : grade

async function fetchGames() {
  return sortByNewest(parseGamesCsv(await loadCSV()))
}

const esc = s => String(s).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

// ---- self-check: parser handles commas-in-quotes + newest-first sort ----
function selfCheck() {
  const D = 'https://arcade.makecode.com/_x'   // any non-empty d13_url
  const csv =
    'id,game_title,student_url,d13_url,active,submitted_at\n' +
    `a,"Run, Jump, Win",,${D},TRUE,2025-01-01T00:00:00Z\n` +
    `b,Plain,,${D},true,2025-06-01T00:00:00Z\n` +   // lowercase true still passes
    `c,Pending,,${D},FALSE,2025-07-01T00:00:00Z\n` + // not active → filtered out
    `d,NoUrl,,,TRUE,2025-07-01T00:00:00Z\n` +        // no url at all → filtered out
    `e,StudentOnly,${D},,TRUE,2025-07-02T00:00:00Z\n` // d13_url empty → falls back to student_url → passes
  const g = parseGamesCsv(csv)
  console.assert(g.length === 3, 'gate keeps active rows with a playable url (d13_url or student_url)')
  console.assert(g.every(r => r.id !== 'c' && r.id !== 'd'), 'gate drops pending / no-url')
  console.assert(g.some(r => r.id === 'e'), 'empty d13_url falls back to student_url')
  console.assert(g[0].game_title === 'Run, Jump, Win', 'quoted comma field')
  console.assert(sortByNewest(g)[0].id === 'e', 'newest first')
  console.assert(findGame(g, 'A').id === 'a', 'case-insensitive lookup')
}
if (new URLSearchParams(location.search).get('selftest') === '1') selfCheck()
