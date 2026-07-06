// D13 Game Gallery — data + rendering. No build step, no framework.

// Data source. Point this at the published "Approved" Google Sheet CSV when
// real games are ready. Form:
//   https://docs.google.com/spreadsheets/d/<id>/pub?gid=<n>&single=true&output=csv
// Until then it reads the committed fixture beside this file.
const CSV_URL = 'dev-games.csv'

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
      return r
    })
    .filter(g => g.id)
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

async function fetchGames() {
  const res = await fetch(CSV_URL)
  if (!res.ok) throw new Error(`CSV fetch failed: ${res.status}`)
  return sortByNewest(parseGamesCsv(await res.text()))
}

const esc = s => String(s).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

// ---- self-check: parser handles commas-in-quotes + newest-first sort ----
function selfCheck() {
  const csv =
    'id,game_title,submitted_at\n' +
    'a,"Run, Jump, Win",2025-01-01T00:00:00Z\n' +
    'b,Plain,2025-06-01T00:00:00Z\n'
  const g = parseGamesCsv(csv)
  console.assert(g.length === 2, 'row count')
  console.assert(g[0].game_title === 'Run, Jump, Win', 'quoted comma field')
  console.assert(sortByNewest(g)[0].id === 'b', 'newest first')
  console.assert(findGame(g, 'A').id === 'a', 'case-insensitive lookup')
}
if (new URLSearchParams(location.search).get('selftest') === '1') selfCheck()
