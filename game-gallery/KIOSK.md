# Kiosk Mode

Hands-free arcade mode for the D13 Game Gallery: browse the grid and play games
using only a **keyboard**, a **Makey Makey** wired as arcade controls, or a
**USB/Bluetooth game controller** — no mouse needed. Built for a shared arcade
station at the STEM center.

## Turn it on

Add `?kiosk=1` to the gallery URL:

```
https://<site>/game-gallery/?kiosk=1
```

The currently selected game gets a highlighted border. Everything else looks the
same — kiosk mode only adds controller navigation on top of the normal site.

For a dedicated station, open that URL in the browser's own full-screen/kiosk
mode (Chrome: `--kiosk` flag, or F11) so there's no address bar to escape to.

## Controls

| Action | Keyboard | Makey Makey (default wiring) | Game controller |
|--------|----------|------------------------------|-----------------|
| Move selection | Arrow keys or WASD | Up / Down / Left / Right pads | D-pad or left stick |
| Play selected game | Space or Enter | Space pad | A / bottom button |
| Back to gallery | Esc | *see below* | B button or Start |

When a game is open, the same **Back** control returns you to the grid.

## The one catch: getting *out* of a game

While a game is playing it captures the keyboard so its own controls work. That
means the page underneath **can't see keystrokes during play** — with one
exception: **Esc**, which the browser always handles (it exits full-screen), so
we use it as the reliable keyboard "back".

What this means per input device:

- **Game controller (recommended for kiosks):** Works completely. The Gamepad
  API is read continuously, even while the game is focused, so **B** or **Start**
  always returns to the gallery. A cheap USB gamepad is the most reliable arcade
  station setup.
- **Keyboard:** **Esc** returns to the gallery from any game.
- **Makey Makey:** Its pads emulate a keyboard, so they're blocked during play
  just like a keyboard — *except* Esc. To get a working "back" pad, **remap one
  Makey Makey input to the Esc key** using the
  [Makey Makey remapping tool](https://makeymakey.com/pages/how-to-remap), then
  label that pad "BACK". The four arrows + Space (front connectors) already work
  for browsing and launching.

> Why not just forward controls into the game? MakeCode share embeds only accept
> injected input if each individual game opts in (`control.simmessages`), which
> student games don't. So we drive navigation from the page and let MakeCode
> handle in-game play natively.

## Optional: auto-return when idle

To bounce an abandoned game back to the gallery after a while, set
`KIOSK_IDLE_MS` near the top of `kiosk.js` (milliseconds; `0` = off, the
default). Note: idle is only reset by **controller/gamepad** activity — keyboard
play mid-game is invisible to the page — so keep this generous (e.g. `300000` for
5 minutes) or leave it off.

## Recommended station setup

1. A computer running the gallery in browser kiosk/full-screen mode at
   `?kiosk=1`.
2. A **USB game controller** (simplest, fully working back button), **or** a
   Makey Makey with the four arrows + Space wired, plus one pad **remapped to
   Esc** for back.
3. That's it — no mouse or keyboard needed for players.

## How it works (for maintainers)

- `kiosk.js` is loaded by `index.html` and activates only when `?kiosk=1` is
  present.
- Navigation, launching, and return all happen **on the gallery page** — a
  selected game opens as a full-screen overlay iframe rather than navigating
  away, so a single input loop stays in control the whole time.
- Input is unified into six actions (`up/down/left/right/select/back`) from both
  keyboard events and polled Gamepad state. See the comments in `kiosk.js`.
- The game iframe is loaded with `?nofooter=1` to hide MakeCode's footer chrome.
