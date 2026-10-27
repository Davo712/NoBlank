# NoBlank

Browser first-person shooter with bots.

- Modes: Bomb Defusal, Deathmatch, Team Deathmatch, Arms Race, Elimination
- Maps: Luxville, Outpost, Downtown, Dunes
- Sides: Special Forces and Terrorists, 11 characters
- Weapons: G-18, Desert Eagle, MP5-SD, AK-47, M4A1, AWP, Nova, HE grenade, smoke, combat knife, kukri, machete
- English / Russian UI

## Run

```bash
npm install
npm run dev
```

Open http://localhost:5173

```bash
npm run build
npm run preview
```

## Controls

| Key | Action |
|---|---|
| WASD | Move |
| Shift | Walk quietly |
| Ctrl | Crouch |
| Space | Jump |
| LMB | Fire / slash / throw |
| RMB | Zoom toggle / heavy attack / lob |
| R | Reload |
| 1–5 / Q / wheel | Switch weapon |
| F | Inspect |
| E | Plant, defuse, pick up |
| G | Drop weapon or bomb |
| B | Change loadout |
| Tab | Scoreboard |
| Esc | Pause |

With fullscreen enabled the game locks the keyboard, so Ctrl+W does not close the tab. Without fullscreen the browser asks before leaving a running match.

## Performance

Low and Medium use simplified shading and baked shadows; High enables PBR materials and dynamic shadows. Resolution scales automatically to hold the display refresh rate, and graphics step down on their own if the frame budget is still missed.
