# AgenTank Replay Viewer

Standalone local replay viewer for official AgenTank match payloads.

## Features

- Skill casts are highlighted on the board with a colored pulse, active skill ring, and skill label.
- The right panel shows tank skill usage, active skill duration, and last skill event.
- The behavior list shows recent frame-by-frame actions such as movement, turns, shots, stars, crashes, and skill events.
- Bullets follow the official two-cell-per-frame movement when positions must be inferred, and mound hits remove the mound tile from the replay map.
- Skill effect timers use the current official rules: shield 4f, freeze 2f, stun 6f, overload 10f, cloak 8f, poison 4f, and boost 6f.

## Run

```bash
npm start
```

By default the app starts at `http://127.0.0.1:5177/`. If that port is busy, it tries the next ports automatically.
The terminal prints the exact `Access URL` after startup.

You can also choose a port:

```bash
npm start -- --port=5199
```

You can deep-link a replay with `?match=`:

```text
http://127.0.0.1:5177/?match=https%3A%2F%2Fagentank.ai%2Fhistory%2Fmat_6i5lPWY81tqAkHfge
```

## Supported Inputs

- `https://agentank.ai/history/mat_...`
- `mat_...`
- `https://agentank.ai/api/matches/mat_.../agent.json`
- `https://agentank.ai/api/matches/mat_.../agent.json?view=raw`

The local server includes a tiny proxy for official AgenTank match JSON, so the browser can load replays without CORS issues.
