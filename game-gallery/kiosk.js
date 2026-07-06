// Kiosk mode — browse the gallery and play games hands-free with a keyboard
// or a game controller (a Makey Makey wired as arcade controls, or a USB/BT
// gamepad). Turn it on with ?kiosk=1 on the gallery. Full docs: KIOSK.md.
//
// How input reaches us:
//   - Keyboard events only arrive while THIS page has focus. Once a game
//     iframe grabs focus (to play), the parent stops seeing keys — the one
//     exception is Esc, which the browser handles at the document level.
//   - The Gamepad API is *polled*, so it works even while the game has focus.
//     That's why a gamepad can always exit a game; a keyboard-only setup exits
//     via Esc (map one Makey Makey input to Esc). See KIOSK.md.

const KIOSK = new URLSearchParams(location.search).has('kiosk')

// Return to gallery after this many ms with no controller activity (safety net
// for abandoned sessions). 0 disables it. Keyboard-only play can't be detected
// mid-game, so keep this generous or off.
const KIOSK_IDLE_MS = 0

// Unified semantic input: up / down / left / right / select / back.
function kioskInput(handle) {
  const KEY = {
    ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
    ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
    Space: 'select', Enter: 'select',
    Escape: 'back', Backspace: 'back',
  }
  addEventListener('keydown', e => {
    const a = KEY[e.code]
    if (!a) return
    if (a !== 'back') e.preventDefault() // let Esc do its native fullscreen-exit
    handle(a)
  })

  // Gamepad: edge-detect buttons, auto-repeat held directions.
  const down = {}
  const lastRepeat = {}
  const REPEAT_MS = 180
  function poll(t) {
    const gp = (navigator.getGamepads?.() || [])[0]
    if (gp) {
      const dir = {
        up: gp.buttons[12]?.pressed || gp.axes[1] < -0.5,
        down: gp.buttons[13]?.pressed || gp.axes[1] > 0.5,
        left: gp.buttons[14]?.pressed || gp.axes[0] < -0.5,
        right: gp.buttons[15]?.pressed || gp.axes[0] > 0.5,
      }
      for (const [d, on] of Object.entries(dir)) {
        if (on && (!down[d] || t - lastRepeat[d] > REPEAT_MS)) { handle(d); lastRepeat[d] = t }
        down[d] = on
      }
      const edge = (i, a) => {
        const p = !!gp.buttons[i]?.pressed
        if (p && !down['b' + i]) handle(a)
        down['b' + i] = p
      }
      edge(0, 'select')            // A / bottom face button
      // NOT B (button 1) — that's a live in-game arcade button. MakeCode's own
      // kiosk exits via Reset, never B. We mirror that: Start/Select = back.
      edge(8, 'back')              // Select
      edge(9, 'back')              // Start
    }
    requestAnimationFrame(poll)
  }
  requestAnimationFrame(poll)
}

// Grid columns = how many cards share the top row's offsetTop.
function gridColumns(cards) {
  if (!cards.length) return 1
  const top = cards[0].offsetTop
  let n = 0
  for (const c of cards) { if (c.offsetTop !== top) break; n++ }
  return n || 1
}

// games[] is aligned with the rendered cards (same order).
function startKiosk(games) {
  const cards = [...document.querySelectorAll('.card')]
  if (!cards.length) return
  document.body.classList.add('kiosk')

  let sel = 0
  const highlight = () => {
    cards.forEach((c, i) => c.classList.toggle('sel', i === sel))
    cards[sel].scrollIntoView({ block: 'nearest' })
  }
  highlight()

  let overlay = null
  let idleTimer = null
  const resetIdle = () => {
    if (!KIOSK_IDLE_MS) return
    clearTimeout(idleTimer)
    idleTimer = setTimeout(close, KIOSK_IDLE_MS)
  }

  function open(game) {
    if (overlay) return
    const url = new URL(game.d13_url)
    url.searchParams.set('nofooter', '1') // hide MakeCode footer chrome
    overlay = document.createElement('div')
    overlay.className = 'kiosk-overlay'
    // Header + game in one container, then fullscreen the container — keeps the
    // site header on top while the game fills the rest, and Esc still fires
    // fullscreenchange on the container to exit.
    overlay.innerHTML = `
      <header class="top">
        <span class="brand">
          <img src="nycfirst-pixel.png" alt="NYC FIRST District 13" width="40" height="40">
          <span class="title">D13 Game Gallery</span>
        </span>
        <div class="play-meta">
          <span class="g-title">${game.game_title}</span>
          <span class="g-by">${game.student_name} · ${gradeLabel(game.grade)}</span>
        </div>
        <span class="kiosk-badge">Reset / Esc / Start → gallery</span>
      </header>
      <div class="kiosk-stage">
        <iframe src="${url}" title="${game.game_title}" allowfullscreen
          sandbox="allow-scripts allow-same-origin allow-popups allow-forms"></iframe>
      </div>`
    document.body.appendChild(overlay)
    // Best-effort real fullscreen (works when launched by a keyboard gesture;
    // a gamepad press isn't a user gesture, so this may no-op — the overlay
    // covers the screen either way).
    overlay.requestFullscreen?.().catch(() => {})
    overlay.querySelector('iframe').focus() // route play input to the game
    resetIdle()
  }

  function close() {
    if (!overlay) return
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {})
    overlay.remove()
    overlay = null
    clearTimeout(idleTimer)
    document.body.focus()
    highlight()
  }

  // Esc exits fullscreen even while the game iframe is focused — treat that as "back".
  addEventListener('fullscreenchange', () => { if (!document.fullscreenElement) close() })

  kioskInput(action => {
    resetIdle()
    if (overlay) { if (action === 'back') close(); return }
    if (action === 'back') return
    if (action === 'select') { open(games[sel]); return }
    const cols = gridColumns(cards)
    const delta = { left: -1, right: 1, up: -cols, down: cols }[action]
    sel = Math.max(0, Math.min(cards.length - 1, sel + delta))
    highlight()
  })
}
