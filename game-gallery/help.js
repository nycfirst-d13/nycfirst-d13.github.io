// Help button + popover, shared by the gallery and the game page.
// Call initHelp() once after the header exists.

const HELP_HTML = `
  <button class="pop-close" aria-label="Close">✕</button>
  <h2 class="pop-h">How to get around</h2>
  <ul>
    <li><b>Mouse:</b> click any game to play. Click <b>← Gallery</b> (top-left) to come back.</li>
    <li><b>Keyboard:</b> <b>arrow keys</b> or <b>W A S D</b> move the highlight, <b>Space</b>/<b>Enter</b> plays, <b>Esc</b> goes back.</li>
    <li><b>Controller / Makey Makey:</b> D-pad or joystick to move, <b>A</b> to play, <b>Start</b> (or <b>Esc</b>/Reset) to go back.</li>
  </ul>

  <h2 class="pop-h">Playing a game</h2>
  <ul>
    <li>The game fills the screen under the header. Use the controls the game shows on-screen.</li>
    <li>MakeCode Arcade keys: <b>arrows / WASD</b> to move, <b>Space</b> = A button, <b>Menu</b> = 1.</li>
    <li>Done or stuck? Press <b>Esc</b>, <b>Start</b>, or <b>← Gallery</b> to return.</li>
  </ul>

  <h2 class="pop-h">See &amp; learn from the code</h2>
  <ul>
    <li>While playing, click <b>See code ↗</b> to open the game in MakeCode Arcade.</li>
    <li>In MakeCode, switch between <b>Blocks</b>, <b>JavaScript</b>, and <b>Python</b> to see how it works.</li>
    <li>Hit <b>Edit</b> to make your own copy and remix it — change sprites, speed, or rules.</li>
  </ul>

  <h2 class="pop-h">Make your own</h2>
  <ul>
    <li>Build a game from scratch at
      <a href="https://arcade.makecode.com" target="_blank" rel="noreferrer">arcade.makecode.com</a>.</li>
    <li>Ask your instructor how to submit it to the gallery.</li>
  </ul>
`

function initHelp() {
  const header = document.querySelector('header.top')
  if (!header || header.querySelector('.help-btn')) return

  const wrap = document.createElement('div')
  wrap.className = 'top-right'
  wrap.innerHTML = `<button class="chip help-btn" aria-expanded="false">Help</button>`
  header.appendChild(wrap)

  const pop = document.createElement('div')
  pop.className = 'popover'
  pop.hidden = true
  pop.innerHTML = HELP_HTML
  document.body.appendChild(pop)

  const btn = wrap.querySelector('.help-btn')
  const toggle = show => { pop.hidden = !show; btn.setAttribute('aria-expanded', String(show)) }

  btn.addEventListener('click', e => { e.stopPropagation(); toggle(pop.hidden) })
  pop.addEventListener('click', e => e.stopPropagation())
  pop.querySelector('.pop-close').addEventListener('click', () => toggle(false))
  document.addEventListener('click', () => { if (!pop.hidden) toggle(false) })
  addEventListener('keydown', e => { if (e.key === 'Escape' && !pop.hidden) toggle(false) })
}
