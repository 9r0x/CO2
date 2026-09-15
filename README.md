# Breath Trainer

Single-page web app for breathing training: freediving CO2 and O2 tables, a max static attempt with a count-up timer, scuba 4 s in / 6 s out, box breathing, 4-7-8, coherent 5-5, custom patterns, and full sessions that chain any of these. Audio cues mark every segment and keep playing on iPhone with the screen locked or another app in front. No build, no dependencies; everything stays in the browser.

Live: https://9r0x.github.io/CO2/

## Run

Open `index.html` directly (share links and the wake lock need a served page), or serve the folder:

```
python3 -m http.server 8000
```

Tests: `node test/run.js` (pure modules) and `node test/browser.js` (drives headless Chrome through the whole app, including an offline start over a local https server when `openssl` is available; set `CHROME=/path/to/chrome` if it is not found, `SHOTS=dir` to save screenshots).

## How the audio works

On Start the whole session is rendered into one 8 kHz WAV (about 1 MB per minute) with a tone at each transition, and a plain `<audio>` element plays it. iOS treats it like a music track, so it continues under lock and in the background, the lock screen shows play, pause and the current phase, and the on-screen timer follows the audio clock.

On iPhone use a Safari tab, not a Home Screen web app (the app shows a warning when it runs that way), and do not mute the tab. Cues play even with the ringer on silent. Wake lock and offline caching need https. Starting a session pauses other apps' music; the Mix with other apps setting (Safari on iOS 17 or later) keeps the music playing and dips it for each cue, but then cues stop when the screen locks or you leave Safari, and the ringer switch mutes them.

## Presets

- CO2 table: fixed hold, shrinking breathe. O2 table: fixed breathe, growing hold. Both take a max static time and suggest starting values, and every round can also be edited by hand for pyramids and other shapes.
- Max static attempt: breathe-up, then a hold that counts up with a tick every 30 s (or the interval from Settings). Urge records the first urge to breathe; after the first three seconds one tap on Stop ends the hold, which is logged and, if it is your longest, becomes the max static the suggestions start from.
- Patterns: scuba 4-6, box 4-4-4-4, 4-7-8, coherent 5-5 and a custom editor with up to six phases.
- Full session: several presets back to back as one track, for example a calm-down, a table, and a max static attempt to finish (an attempt only counts as the last part). Each part keeps its own settings, the number in front of a part moves it, and the share link carries the parts along.

Tap a round in the preview (or a part of a full session) to start the session from there; time, holds and rounds are counted from that point (Again always restarts from the beginning). Every preset is editable and can be saved under its own name with a short description. Limits: 20 rounds, 6 phases, 6 parts, 90 minutes of audio. Share link puts it into the address (`#p=...`) so someone opening it gets the preset, description included, added to their list. Press and hold any stepper button to change values quickly.

## Settings

Cue volume, three cue sounds (classic beeps, soft tones, wood blocks) with a cue guide that plays each tone on its own, 3-2-1 countdown ticks, ticks during holds (off, 15, 30 or 60 s), keep the screen awake, vibrate on cues (Android), mix with other apps, a weekly goal, and the theme. The whole state (settings, presets, history) can be exported to a file and imported on another device; importing merges the history.

## History

Finished and stopped sessions (at least one round done) are logged with rounds, total time, time on hold and, for attempts, the hold and urge times. After a session you can mark it easy, OK or hard and share or copy a one-line summary; three easy sessions in a row on a preset put a suggestion on the Train tab with an Apply button, two hard ones suggest holding steady. In a full session the rounds and cycles of all parts count as rounds; the CSV kind column is table, pattern, chain or attempt. The History tab shows the last seven days against the weekly goal, a two-week chart, the current streak, recent max static attempts, totals per preset and the full list, with CSV export.

## Controls

During a session: Pause, Back, Skip and Stop (two taps, or one tap during a max hold). The lock screen or headphones give play, pause, next (Skip) and previous (Back). On a keyboard: Space pauses, the arrow keys move between segments, U marks the urge, Escape stops. Tapping a History row opens its preset.

## GitHub Pages

Push to `main`, then in the repository choose Settings, Pages, Source "Deploy from a branch", branch `main`, folder `/ (root)`. Asset links carry a `?v=N` query that must match the list in `sw.js` and the build label in Settings; a unit test checks this.

## Safety

Dry training only. Never hold your breath in or near water without a trained buddy watching. Stop if you feel dizzy or unwell. Not medical advice.
