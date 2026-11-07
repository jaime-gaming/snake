# snake — v2.1

A monochrome grid-based Snake game with no external dependencies or network requests. It supports English and Spanish, remembers the selected language in the browser, and works with a keyboard, touch controls, and a gamepad. It is served from its own domain, **https://snake.jaime-gaming.com**, via **Cloudflare Workers**.

v2.1 turns the competitive mode into a quick-match arena: every match draws a **random map and modifier** (the same for everyone), each snake starts in **its own quadrant**, and placing earns **cups** that climb **ranks**. Frenzy now throws **waves of extra fruit** and short **speed pulses**, time attack shows a **big clock** over the board, and clearing a campaign level just says so. The site moved from GitHub Pages to **Cloudflare Workers** on its own domain.

## Controls

| Action | Keyboard | Touch / gamepad |
| --- | --- | --- |
| Turn | Arrow keys or WASD | Swipe / D-pad or stick |
| Boost | Space or Shift | Tap the board / A button; unavailable in Hunter and in no-boost levels |
| Pause | P or Esc | Pause button / Start |
| Restart | R | Button |
| Sound | M | Sound button |
| Menus | Arrow keys and Enter | Select an option |

Group, mode, level, help, profile, and settings navigation all support the keyboard and keep a visible focus indicator. In the level grid, use `↑↓` to move between rows. The compact settings button is below the mode list; use it to change sound and the screen effect, or clear saved records and progress.

## Modes

The home screen has three groups: **progress**, **endless**, and **competitive**. Switch groups with `←→` on the mode screen.

- **Campaign** — 30 hand-designed levels. Clear each level to unlock the next. There is no score: progress is measured by apples collected and remaining. Some levels carry a **modifier** that changes the rules instead of (or besides) the map: level 8 and 21 get *walls that appear*, level 12 is *no boost*, level 16 and 30 have a *clock*, and level 26 brings the *hunter* into the campaign. The HUD shows the active modifier next to the level name.
- **Classic** — Endless play. Each fruit speeds up the snake; walls begin to appear after 30 fruits.
- **Frenzy** — The edges wrap around and the snake gradually speeds up. Every 16 seconds a **wave of three extra fruits** lands (they blink before vanishing) and every 11 seconds a **speed pulse** pushes everyone faster for a moment.
- **Hunter** — A red snake eats blue pellets and then pursues you. Its head is dangerous; its body and pellets are safe. If it collides with your body, it disappears and returns smaller. You can eat the blue pellets too.
- **Time attack** — You start with **30 seconds**, shown as a **big clock** over the board. Every fruit adds 3 seconds (up to a cap); under 10 seconds the clock turns red and blinks, and when time runs out the run ends.
- **Competitive** — Quick match against three bots on a board split into **four quadrants**, one per snake. Each match **draws an arena** (the walls of a campaign map) and **one modifier** — *walls that appear*, a *clock* (45 s, extended by fruit), the *hunter*, or *no boost* — and everyone plays the same draw; the HUD shows both. Walls, your own body, and any rival's body are deadly; head-on collisions knock out both snakes. The last one standing wins.

  Placing awards **cups**: 1st +25, 2nd +10, 3rd +5, 4th +0. Cups climb six **ranks** — bronze (0), silver (100), gold (250), platinum (500), diamond (750), master (1000) — and both cups and rank appear on the result screen and in the profile. The draw is new on every match, so the result screen is a one-minute loop: retry and you get another arena.

Power-ups vary by mode:

- **Campaign:** ghost, slow, and shrink.
- **Classic:** ghost, slow, shrink, and double score.
- **Frenzy:** slow, shield, and double score.
- **Hunter:** ghost, shrink, and shield.
- **Time attack:** slow, shield, double, and ghost.
- **Competitive:** ghost, shield, slow, and shrink. Rivals can pick them up too.

Ghost passes through hazards; slow reduces speed; shrink shortens the tail; shield saves you from one collision; double multiplies score.

## Profile

The home screen has a **profile** link (route `/perfil`, `/profile`). It shows lifetime stats saved in the browser: games played, competitive wins, fruits collected, time played, best chain, best score, plus competitive **cups** and the current **rank**. Clearing records in settings wipes them too.

## Home screen

The `snake.` title is drawn as five independent snakes, one per letter. Only the `e` follows the apple, moving slowly and continuously until it reaches it. The design keeps crisp blocks and a high-contrast palette.

## Language and routes

The **EN / ES** selector changes the text and route names, and remembers the preference in the browser. The site is served from the domain root, for example:

- `https://snake.jaime-gaming.com/`
- Spanish: `/campaña`, `/clásico`, `/contrarreloj`, `/competitivo`, `/perfil`
- English: `/campaign`, `/classic`, `/timed`, `/competitive`, `/profile`

Routes support direct access and reloads: the Worker resolves any extensionless path to `index.html` (SPA fallback). A legacy `/snake/` prefix is still detected automatically, so old links keep working. Locally, `serve.mjs` offers the same behaviour on both `/` and `/snake/`.

## Project files

```text
index.html          document, canonical domain, and accessible interface elements
wrangler.toml       Cloudflare Workers config: static assets + SPA fallback
styles.css          block design, responsive layout, and accessibility
snake.js            generated classic-script bundle loaded by the page
js/
  engine.js         game engine, collisions, powers, bots, clock, modifiers, and drawing
  grid.js           BFS and grid utilities
  levels.js         groups, five modes, and 30 levels with modifiers
  audio.js          synthesized audio; no audio files
  input.js          keyboard, gestures, and gamepad
  i18n.js           English/Spanish strings and localized names
  main.js           screens, routes, progress, profile, title, and game loop
serve.mjs           local server with no-cache headers and SPA route fallback
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

Open `http://localhost:8123/` (root, like the domain) or `http://localhost:8123/snake/` (legacy prefix). The server also handles deep routes such as `http://localhost:8123/competitivo`.

## Publish on Cloudflare Workers (own domain)

The site is a plain static bundle, so the Worker only serves the repository files and falls back to `index.html` for game routes:

1. `wrangler.toml` already declares the assets: `directory = "./"` with `not_found_handling = "single-page-application"` — that is the whole SPA fallback, no code needed.
2. Install the CLI once (`npm install -g wrangler` or use `npx wrangler`) and log in (`npx wrangler login`).
3. Deploy from the repository root:

   ```sh
   npx wrangler deploy
   ```

4. In the Cloudflare dashboard, add the custom domain **snake.jaime-gaming.com** to the `snake` Worker (Workers & Pages → snake → Triggers → Custom Domains). SSL is automatic.

The workflow in `.github/workflows/checks.yml` only validates the source and bundle (`node tools/build.mjs --check` + `node tools/check.mjs`); it never deploys. Regenerate the bundle with `node tools/build.mjs` before running `npx wrangler deploy`.
