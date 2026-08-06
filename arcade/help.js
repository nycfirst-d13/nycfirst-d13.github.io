// Help button + popover, shared by the gallery and the game page.
// Call initHelp() once after the header exists.

// Animated key/button visual. WASD and the arrows are laid out like a keyboard
// and share press timing (--i) so W+↑, A+←, S+↓, D+→ light up together — showing
// kids which key maps to which direction. Space and Esc/Start follow.
function controlsVis() {
  return `
  <div class="ctrls">
    <div class="ctrls-move">
      <div class="keypad" aria-hidden="true">
        <span class="key" style="--i:0">W</span>
        <span class="key" style="--i:1">A</span>
        <span class="key" style="--i:2">S</span>
        <span class="key" style="--i:3">D</span>
      </div>
      <span class="ctrls-eq">=</span>
      <div class="keypad" aria-hidden="true">
        <span class="key" style="--i:0"><span class="arw">↑</span></span>
        <span class="key" style="--i:1"><span class="arw" style="--r:-90deg">↑</span></span>
        <span class="key" style="--i:2"><span class="arw" style="--r:180deg">↑</span></span>
        <span class="key" style="--i:3"><span class="arw" style="--r:90deg">↑</span></span>
      </div>
      <span class="ctrls-lbl">Move</span>
    </div>
    <div class="ctrls-row">
      <span class="key wide" style="--i:4">Space</span>
      <span class="ctrls-lbl">Play / Action</span>
    </div>
    <div class="ctrls-row">
      <span class="key wide" style="--i:5">EXIT</span>
      <span class="key wide" style="--i:5">Esc</span>
      <span class="key wide" style="--i:5">Start</span>
      <span class="ctrls-lbl">Back to gallery</span>
    </div>
  </div>`
}

function helpHtml() {
  return `
  <button class="pop-close" aria-label="Close">✕</button>
  <div class="pop-inner">
  <h1 class="pop-title">Help</h1>
  <h2 class="pop-h">How to get around</h2>
  ${controlsVis()}
  <ul>
    <li><b>Mouse:</b> click any game to play.</br>Click <span class="ref"><span class="ico">←</span> Gallery</span> (top-left) to come back.</li>
    <li><b>Controller:</b> D-pad or joystick to move, <b>A</b> to play, <b>Start</b> (or <b>Esc</b>) to go back.</li>
  </ul>

  <h2 class="pop-h">Playing a game</h2>
  <ul>
    <li>The game fills the screen under the header.</br>Use the controls the game shows on-screen.</li>
    <li>Done or stuck? Press the <b>EXIT</b> button on the arcade panel (or <b>Esc</b> / <b>Start</b>), or click <span class="ref"><span class="ico">←</span> Gallery</span> to return.</li>
  </ul>

  <h2 class="pop-h">See &amp; learn from the code</h2>
  <ul>
    <li>While playing, open <span class="ref">Help</span> and click <span class="ref">Open in MakeCode <span class="ico">↗</span></span> to view the game's code.</li>
    <li>In MakeCode, switch between <b>Blocks</b>, <b>JavaScript</b>, and <b>Python</b> to see how it works.</li>
    <li>Hit <b>Edit</b> to make your own copy and remix it — change sprites, speed, or rules.</li>
  </ul>

  <h2 class="pop-h">Make your own</h2>
  <ul>
    <li>Build a game from scratch at
      <a href="https://arcade.makecode.com" target="_blank" rel="noreferrer">arcade.makecode.com</a>.</li>
    <li>Made one? <a href="submit.html">Add it to the gallery <span class="ico">→</span></a></li>
  </ul>
  </div>
`
}

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
  pop.innerHTML = helpHtml()
  document.body.appendChild(pop)

  const btn = wrap.querySelector('.help-btn')
  const toggle = show => { pop.hidden = !show; btn.setAttribute('aria-expanded', String(show)) }

  btn.addEventListener('click', e => { e.stopPropagation(); toggle(pop.hidden) })
  pop.addEventListener('click', e => e.stopPropagation())
  pop.querySelector('.pop-close').addEventListener('click', () => toggle(false))
  document.addEventListener('click', () => { if (!pop.hidden) toggle(false) })
  addEventListener('keydown', e => { if (e.key === 'Escape' && !pop.hidden) toggle(false) })
}
