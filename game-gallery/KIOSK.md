# Controls & Kiosk

The D13 Game Gallery is playable with a **mouse**, a **keyboard**, a **Makey
Makey** wired as arcade controls, or a **USB/Bluetooth game controller** — no
setup, no special URL. This makes it work equally as a normal web page and as a
shared arcade station at the STEM center.

The currently selected game shows a highlighted border once you start navigating
with keys/controller. A selected game opens as a full-screen overlay with the
site header on top and the game below.

## Running as a dedicated arcade station

Just open the gallery in the browser's own full-screen/kiosk mode (Chrome:
`--kiosk` flag, or F11) so there's no address bar. Everything else already works.

Players can also tap **Help** (top-right) any time for a controls + how-to
reference.

## Controls

| Action | Keyboard | Makey Makey (default wiring) | Game controller |
|--------|----------|------------------------------|-----------------|
| Move selection | Arrow keys or WASD | Up / Down / Left / Right pads | D-pad or left stick |
| Play selected game | Space or Enter | Space pad | A / bottom button |
| Back to gallery | Esc | Esc (see below) | Start / Select |

This mirrors MakeCode Arcade's own kiosk, where **Reset** (bound to **Esc** or
the key **2**) returns you to the menu. We deliberately **do not** use the **B**
button for back — B is a live in-game action, so overloading it would fire both
"jump/shoot" and "exit" at once. Exit is always a dedicated control (Esc /
Start), never a gameplay button.

## The one catch: getting *out* of a game

While a game is playing it captures the keyboard so its own controls work. That
means the page underneath **can't see keystrokes during play** — with one
exception: **Esc**, which the browser always handles (it exits full-screen), so
we use it as the reliable keyboard "back".

**Esc is the one input that always works** — the browser handles it at the
document level (exit full-screen), so it reaches the page even while the game
holds keyboard focus. It's also MakeCode's own Reset key, so it's the natural
"back". This is why every recommended setup routes "back" through Esc.

What this means per input device:

- **Keyboard:** **Esc** returns to the gallery from any game. Done.
- **Makey Makey (native MakeCode controller style):** Its pads emulate a
  keyboard, so during play they're blocked by iframe focus — *except* Esc. Wire
  the four arrows + Space (front connectors) for browsing/launching, then **remap
  one extra input to the Esc key** with the
  [Makey Makey remapping tool](https://makeymakey.com/pages/how-to-remap) and
  label that pad **RESET / BACK**.
- **USB game controller:** **Start** or **Select** returns to the gallery
  (polled via the Gamepad API, which is read even while the game is focused).
  Caveat: MakeCode's browser player is keyboard-first — direct Gamepad-API input
  into games is unreliable (some controllers make the game reload its title
  screen). Most MakeCode arcade controllers (Adafruit, `pxt-maker-controller`)
  **emulate a keyboard** rather than using the Gamepad API, so treat them as the
  Keyboard/Makey Makey row above. A plain USB gamepad is best for *navigating*
  and *exiting*, not necessarily for *playing*.

> Why not forward controls into the game instead? MakeCode share embeds only
> accept injected input if each game opts in (`control.simmessages`), which
> student games don't. So we drive navigation from the page and let MakeCode
> handle in-game play natively — the same split MakeCode's own kiosk uses.

## Optional: auto-return when idle

To bounce an abandoned game back to the gallery after a while, set
`KIOSK_IDLE_MS` near the top of `kiosk.js` (milliseconds; `0` = off, the
default). Note: idle is only reset by **controller/gamepad** activity — keyboard
play mid-game is invisible to the page — so keep this generous (e.g. `300000` for
5 minutes) or leave it off.

## Recommended station setup

1. A computer running the gallery in browser kiosk/full-screen mode at
   `?kiosk=1`.
2. A keyboard-emulating arcade controller or **Makey Makey**: four arrows +
   Space for browse/launch/play, plus one input **remapped to Esc** for
   reset/back. (This is the native MakeCode arcade setup and plays games
   reliably.) A plain USB gamepad also works for navigating and exiting via
   Start/Select, but may not play every game cleanly.
3. That's it — no mouse or keyboard needed for players.

## How it works (for maintainers)

- `kiosk.js` is loaded by `index.html` and always active — it drives mouse,
  keyboard, and gamepad navigation for the whole gallery.
- `help.js` injects the Help button + popover into the header on both pages.
- Navigation, launching, and return all happen **on the gallery page** — a
  selected game opens as a full-screen overlay rather than navigating away, so a
  single input loop stays in control the whole time.
- The overlay puts the **site header + game in one container** and fullscreens
  *that container* (not just the iframe), so the header stays visible above the
  game while still getting real full-screen + the focus-independent Esc exit.
- Input is unified into six actions (`up/down/left/right/select/back`) from both
  keyboard events and polled Gamepad state. See the comments in `kiosk.js`.
- The game iframe is loaded with `?nofooter=1` to hide MakeCode's footer chrome.
