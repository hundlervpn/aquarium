# Abyssal · Living Aquarium

A premium, full-screen aquarium that runs entirely in the browser. Procedurally
drawn fish drift through layered deep water, and you can feed them: drop food and
watch the nearest fish break formation, dart over, and snap it up.

**No build step, no dependencies.** Open `index.html` and it runs.

## Features

- **Living fish** — each fish steers on its own (lazy wander, edge avoidance,
  light schooling separation), with a tail beat that speeds up as it accelerates.
  Seven colour species, randomised size, parallax depth sorting.
- **Feeding** — tap anywhere on the water to drop sinking food, or use **Feed**
  to scatter a shoal of pellets from the surface. Hungry fish sense food within
  range, accelerate toward the nearest pellet, and eat it (with a little spark
  burst). Uneaten food settles on the sand and slowly dissolves.
- **Atmosphere** — animated god rays, rising bubbles, drifting marine snow,
  swaying kelp, and a sculpted sandy floor over an OKLCH deep-water gradient.
- **Controls** — add or remove fish, and switch between a *Calm tide* and a
  *Lively current* to change how briskly the school moves.
- **Respectful defaults** — honours `prefers-reduced-motion`, scales to device
  pixel ratio, and adapts to any viewport.

## Run it

Just open the file:

```bash
open index.html        # macOS
xdg-open index.html    # Linux
```

Or serve the folder (recommended, avoids any file-protocol quirks):

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```

### GitHub Pages

This is a static site. To publish it, enable **Settings → Pages → Deploy from a
branch**, pick `main` / root, and the aquarium will be live at
`https://hundlervpn.github.io/aquarium/`.

## Project structure

```
index.html    Markup + HUD (title, readouts, control dock)
styles.css    Deep-water theme, OKLCH palette, control styling
aquarium.js   Canvas engine: fish steering, food physics, environment, render loop
```

## How the fish think

Every frame, each fish picks a desired heading from: the nearest food in sense
range (if any), a slow wander otherwise, plus soft pushes away from the walls,
the surface, the sand, and crowded neighbours. It turns toward that heading at a
capped rate (faster when hunting) and accelerates while excited. When its mouth
reaches a pellet, the food is eaten and the *fed* counter ticks up.

Tuning lives at the top of `aquarium.js` (`MAX_FISH`, the `SPECIES` palette, and
the constants inside `makeFish` / `update`).
