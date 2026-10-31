# Project instructions

## Player patch log

Until the user explicitly says to stop, include every implemented game change or addition in the player-facing patch log in `index.html`, inside `#patch-notes-content`.

- Add concise player-facing notes to the current dated entry, or create a new entry above older entries for a new update date.
- Use the user's America/New_York calendar date and keep the latest entry's version consistent with `GAME_VERSION` in `core.js`.
- Keep older entries available from the main-menu Patch Notes button.
- Document completed changes accurately. Do not claim planned work, tests, advice, or troubleshooting suggestions are shipped features.
- The initial October 28, 2026 entry groups the recent house, furniture, TV, and tournament work at the user's request.

## Character rendering maintenance

- 2D mode is temporarily unavailable to players through `TWO_D_MODE_AVAILABLE` in `core.js`; retain its renderer and assets.
- Keep the 2D path compatible and update its corresponding features alongside future 3D additions where applicable. Do not remove it as dead code.
