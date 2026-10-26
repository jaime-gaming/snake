# snake — v1.0

A monochrome grid-based Snake game with no external dependencies or network requests. It supports English and Spanish, remembers the selected language in the browser, and works with GitHub Pages, a keyboard, touch controls, and a gamepad.

## Controls

| Action | Keyboard | Touch / gamepad |
| --- | --- | --- |
| Turn | Arrow keys or WASD | Swipe / D-pad or stick |
| Boost | Space or Shift | Tap the board / A button; unavailable in Hunter |
| Pause | P or Esc | Pause button / Start |
| Restart | R | Button |
| Sound | M | Sound button |
| Menus | Arrow keys and Enter | Select an option |

Group, mode, level, help, and settings navigation all support the keyboard and keep a visible focus indicator. In the level grid, use `↑↓` to move between rows. The compact settings button is below the mode list; use it to change sound and the screen effect, or clear saved records and progress.

## Modes

The home screen has two groups: **progress** and **endless**. Switch groups with `←→` on the mode screen.

- **Campaign** — 20 hand-designed levels. Clear each level to unlock the next. There is no score: progress is measured by apples collected and remaining.
- **Classic** — Endless play. Each fruit speeds up the snake; walls begin to appear after 30 fruits.
- **Frenzy** — The edges wrap around, and the snake gradually speeds up over time.
- **Hunter** — A red snake eats blue pellets and then pursues you. Its head is dangerous; its body and pellets are safe. If it collides with your body, it disappears and returns smaller. You can eat the blue pellets too.

Power-ups vary by mode:

- **Campaign:** ghost, slow, and shrink.
- **Classic:** ghost, slow, shrink, and double score.
- **Frenzy:** slow, shield, and double score.
- **Hunter:** ghost, shrink, and shield.

Ghost passes through hazards; slow reduces speed; shrink shortens the tail; shield saves you from one collision; double multiplies score.

Competitive mode was retired for v1.0. It is not shown in the menu and cannot be started.

### `BORRAR-COMPETITIVO` retirement markers

Harmless `BORRAR-COMPETITIVO` comments remain to mark removed work; they do not represent playable code. Find them with:

```sh
grep -rn BORRAR-COMPETITIVO .
```

## Home screen

The `snake.` title is drawn as five independent snakes, one per letter. Only the `e` follows the apple, moving slowly and continuously until it reaches it. The design keeps crisp blocks and a high-contrast palette.

## Language and routes

The **EN / ES** selector changes the text and route names, and remembers the preference in the browser. The site uses project paths under `/snake/`, for example:

- `https://<owner>.github.io/snake/`
- Spanish: `/snake/campaña`, `/snake/clásico`
- English: `/snake/campaign`, `/snake/classic`

Routes support direct access and reloads. `serve.mjs` falls back to `index.html` locally; `404.html` restores deep routes on GitHub Pages.

## Project files

```text
index.html          document and accessible interface elements
404.html            GitHub Pages deep-route recovery
.nojekyll           disables Jekyll processing for branch-based Pages
styles.css          block design, responsive layout, and accessibility
snake.js            generated classic-script bundle loaded by the page
js/
  engine.js         game engine, collisions, powers, and drawing
  grid.js           BFS and grid utilities
  levels.js         groups, three modes, and 20 levels
  audio.js          synthesized audio; no audio files
  input.js          keyboard, gestures, and gamepad
  i18n.js           English/Spanish strings and localized names
  main.js           screens, routes, progress, title, and game loop
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
