# snake — v2.0

A monochrome grid-based Snake game with no external dependencies or network requests. It supports English and Spanish, remembers the selected language in the browser, and works with GitHub Pages, a keyboard, touch controls, and a gamepad.

v2.0 adds a **time attack** mode, a **bot duel**, ten more campaign levels (30 total), and a **profile** screen with lifetime stats. The competitive mode retired in v1.0 is back, rebuilt as a free-for-all against three bots.

## Controls

| Action | Keyboard | Touch / gamepad |
| --- | --- | --- |
| Turn | Arrow keys or WASD | Swipe / D-pad or stick |
| Boost | Space or Shift | Tap the board / A button; unavailable in Hunter |
| Pause | P or Esc | Pause button / Start |
| Restart | R | Button |
| Sound | M | Sound button |
| Menus | Arrow keys and Enter | Select an option |

Group, mode, level, help, profile, and settings navigation all support the keyboard and keep a visible focus indicator. In the level grid, use `↑↓` to move between rows. The compact settings button is below the mode list; use it to change sound and the screen effect, or clear saved records and progress.

## Modes

The home screen has three groups: **progress**, **endless**, and **duel**. Switch groups with `←→` on the mode screen.

- **Campaign** — 30 hand-designed levels. Clear each level to unlock the next. There is no score: progress is measured by apples collected and remaining.
- **Classic** — Endless play. Each fruit speeds up the snake; walls begin to appear after 30 fruits.
- **Frenzy** — The edges wrap around, and the snake gradually speeds up over time.
- **Hunter** — A red snake eats blue pellets and then pursues you. Its head is dangerous; its body and pellets are safe. If it collides with your body, it disappears and returns smaller. You can eat the blue pellets too.
- **Time attack** (v2.0) — You start with 75 seconds. Every fruit adds 3 seconds (up to a cap), the HUD clock flashes red under 10 seconds, and when time runs out the run ends.
- **Duel** (v2.0) — Three bot snakes share the arena with you. Walls, your own body, and any rival's body are deadly; head-on collisions knock out both snakes. The last one standing wins, and if you fall you see your placing (e.g. "3rd of 4").

Power-ups vary by mode:

- **Campaign:** ghost, slow, and shrink.
- **Classic:** ghost, slow, shrink, and double score.
- **Frenzy:** slow, shield, and double score.
- **Hunter:** ghost, shrink, and shield.
- **Time attack:** slow, shield, double, and ghost.
- **Duel:** ghost, shield, slow, and shrink. Rivals can pick them up too.

Ghost passes through hazards; slow reduces speed; shrink shortens the tail; shield saves you from one collision; double multiplies score.

## Profile

The home screen has a **profile** link (route `/snake/perfil`, `/snake/profile`). It shows lifetime stats saved in the browser: games played, duel wins, fruits collected, time played, best chain, and best score. Clearing records in settings wipes them too.

## Home screen

The `snake.` title is drawn as five independent snakes, one per letter. Only the `e` follows the apple, moving slowly and continuously until it reaches it. The design keeps crisp blocks and a high-contrast palette.

## Language and routes

The **EN / ES** selector changes the text and route names, and remembers the preference in the browser. The site uses project paths under `/snake/`, for example:

- `https://<owner>.github.io/snake/`
- Spanish: `/snake/campaña`, `/snake/clásico`, `/snake/contrarreloj`, `/snake/duelo`, `/snake/perfil`
- English: `/snake/campaign`, `/snake/classic`, `/snake/timed`, `/snake/versus`, `/snake/profile`

Routes support direct access and reloads. `serve.mjs` falls back to `index.html` locally; `404.html` restores deep routes on GitHub Pages.

## Project files

```text
index.html          document and accessible interface elements
404.html            GitHub Pages deep-route recovery
.nojekyll           disables Jekyll processing for branch-based Pages
styles.css          block design, responsive layout, and accessibility
snake.js            generated classic-script bundle loaded by the page
js/
  engine.js         game engine, collisions, powers, bots, clock, and drawing
  grid.js           BFS and grid utilities
  levels.js         groups, five modes, and 30 levels
  audio.js          synthesized audio; no audio files
  input.js          keyboard, gestures, and gamepad
  i18n.js           English/Spanish strings and localized names
  main.js           screens, routes, progress, profile, title, and game loop
serve.mjs           local server with no-cache headers and route fallback
tools/build.mjs     bundles js/ into snake.js without dependencies
tools/check.mjs     level, engine, language, and publishing tests
.github/workflows/checks.yml   source and game checks; does not deploy the site
```

The page loads `snake.js` as a classic script, not a module, so `index.html` can also be opened directly with `file://`. To edit the game, change `js/` and regenerate the bundle:

```sh
node tools/build.mjs          # regenerate snake.js
node tools/check.mjs          # test levels, engine, language, and routes
node tools/build.mjs --check  # verify that snake.js is current
```

## Run locally

```sh
node serve.mjs 8123
```

Open `http://localhost:8123/snake/`. The server also handles `http://localhost:8123/` and deep routes such as `http://localhost:8123/snake/campaign`.

## Publish directly from a branch

The site is laid out for GitHub Pages to publish the repository root directly; no Pages deployment workflow or build step is required. After the changes are on `main`, open **Settings → Pages → Build and deployment**, select **Deploy from a branch**, choose **`main`** and **`/(root)`**, then save. GitHub Pages will serve `index.html`, `404.html`, `styles.css`, and `snake.js` from that branch. The Pages URL is `https://<owner>.github.io/snake/`.

The workflow in `.github/workflows/checks.yml` only validates the source and bundle; it does not upload or deploy the site. Regenerate the bundle with `node tools/build.mjs` before publishing source changes.
