# snake — v2.0

A monochrome grid-based Snake game with no external dependencies or network requests. It supports English and Spanish, remembers the selected language in the browser, and works with a keyboard, touch controls, and a gamepad. It is served from its own domain, **https://snake.jaime-gaming.com**, via **Cloudflare Workers**.

Competitive is a quick match on **four separate boards**: one per snake, all with the same map, the same modifier and the same difficulty. Before playing, a menu shows your **rank and cups**, then the **draw** (map + modifier) is announced, a **3-second countdown** starts the match, and whoever survives longest wins. Placing earns **cups** that climb **ranks**. Frenzy throws **waves of extra fruit** and **speed pulses**, time attack shows a **big clock** that **keeps accelerating** (and a **poisoned apple** hidden among the fruit), and the site is served from its own domain via **Cloudflare Workers**.

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
- **Time attack** — You start with **30 seconds**, shown as a **big clock** over the board. Every fruit adds 3 seconds (up to a cap), but the clock **keeps speeding up** (up to twice as fast after 60 seconds); the *slow* power-up now **halves the clock** instead of the snake, **boost is disabled**, and under 10 seconds the clock turns red and blinks.

  Two apples always appear together and one of them is **poisoned**: it looks identical except for a tiny notch in one corner. Eating it **costs 5 seconds** and **resets the chain**.
- **Competitive** — Four **separate boards**, one per snake (you and three rivals). They never share cells or fruit: each board is a full 20×20 grid, and your board is marked in the corner of the screen along with each rival's name and score. Every match **draws a map** (the walls of a campaign map) and **one modifier** — *walls that appear*, a *clock* (45 s, extended by fruit), the *hunter*, or *no boost* — and all four boards play exactly the same draw.

  The flow is: **menu** (rank, cups, wins, rules) → **draw** (map and modifier announced) → **3-second countdown** → match. **Whoever survives longest wins**; walls, your own body, the clock and the hunter are what end a run.

  Placing awards **cups**: 1st +25, 2nd +10, 3rd +5, 4th +0. Cups climb six **ranks** — bronze (0), silver (100), gold (250), platinum (500), diamond (750), master (1000) — shown on the menu, the result screen and the profile, with the remaining cups to the next rank. Rivals steer towards the power-ups that help them (shield, ghost, slow) and the golden apple.

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
  engine.js         game engine, collisions, powers, clock, modifiers, and drawing
  grid.js           BFS and grid utilities
  levels.js         groups, five modes, and 30 levels with modifiers
  audio.js          synthesized audio; no audio files
  input.js          keyboard, gestures, and gamepad
  i18n.js           English/Spanish strings and localized names
  main.js           screens, routes, progress, profile, four-board arena, and game loop
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
