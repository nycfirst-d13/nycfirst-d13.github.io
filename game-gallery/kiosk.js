// Gallery navigation + play. Always on: browse and play with a mouse, a
// keyboard, a Makey Makey wired as arcade controls, or a USB/BT gamepad. A
// selected game opens as a full-screen overlay (site header on top, game
// below). Full controls docs: KIOSK.md.
//
// How input reaches us:
//   - Keyboard events only arrive while THIS page has focus. Once a game
//     iframe grabs focus (to play), the parent stops seeing keys — the one
//     exception is Esc, which the browser handles at the document level.
//   - The Gamepad API is *polled*, so it works even while the game has focus.
//     That's why a gamepad can always exit a game; a keyboard-only setup exits
//     via Esc (map one Makey Makey input to Esc). See KIOSK.md.

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

  let sel = 0
  const highlight = () => {
    cards.forEach((c, i) => c.classList.toggle('sel', i === sel))
    cards[sel].scrollIntoView({ block: 'nearest' })
  }
  highlight()

  cards.forEach((card, i) => {
    // Hovering moves the selection, so mouse and keyboard/controller share one
    // highlight — never two lit at once. Arrow keys continue from the hovered card.
    card.addEventListener('mouseenter', () => { sel = i; highlight() })
    // Clicking plays the game in the overlay instead of navigating away.
    card.addEventListener('click', e => { e.preventDefault(); sel = i; highlight(); open(games[i]) })
  })

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
    const codeUrl = game.student_url || game.d13_url
    // Help panel lives INSIDE the overlay: in fullscreen only the fullscreened
    // element's subtree renders, so a body-level popover wouldn't show.
    overlay.innerHTML = `
      <header class="top">
        <button class="chip" data-back><span class="ico">←</span> Gallery</button>
        <div class="play-meta">
          <span class="g-title">${game.game_title}</span>
          <span class="g-by">${game.student_name} · ${gradeLabel(game.grade)}</span>
        </div>
        <button class="chip" data-help>Help</button>
      </header>
      <div class="kiosk-stage">
        <iframe src="${url}" title="${game.game_title}" allowfullscreen
          sandbox="allow-scripts allow-same-origin allow-popups allow-forms"></iframe>
      </div>
      <div class="popover game-help" hidden>
        <button class="pop-close" aria-label="Close">✕</button>
        <div class="pop-inner">
          <h1 class="pop-title">Playing ${game.game_title}</h1>
          <h2 class="pop-h">Controls</h2>
          ${controlsVis()}
          <ul>
            <li>The game also shows its controls on screen.</li>
          </ul>
          <h2 class="pop-h">See &amp; learn from the code</h2>
          <ul>
            <li>Open this game in MakeCode to view and remix it:</li>
            <li><a class="chip" href="${codeUrl}" target="_blank" rel="noreferrer">Open in MakeCode <span class="ico">↗</span></a></li>
            <li>Switch <b>Blocks</b> / <b>JavaScript</b> / <b>Python</b> to see how it works, then <b>Edit</b> to make your own copy.</li>
          </ul>
        </div>
      </div>`
    document.body.appendChild(overlay)
    overlay.querySelector('[data-back]').addEventListener('click', close)
    const help = overlay.querySelector('.game-help')
    overlay.querySelector('[data-help]').addEventListener('click', () => { help.hidden = false })
    help.querySelector('.pop-close').addEventListener('click', () => { help.hidden = true })
    help.addEventListener('click', e => { if (e.target === help) help.hidden = true })
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
