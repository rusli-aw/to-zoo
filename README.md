# To-Zoo

A to-do list that lives in a small 3D safari. Every unfinished task is an animal
in your zoo; finish the task and the animal walks out of the gate and back into
the wild.

The size of the animal *is* the priority of the task:

| | | |
|---|---|---|
| 🐘 **Elephant** | Major | The thing you keep not doing |
| 🦁 **Lion** | Medium | Important but manageable |
| 🐑 **Sheep** | Small | A quick win |

A short task list is a clean, green zoo. Let things pile up and the grass thins,
leaf litter gathers, and the animals get restless. Releasing them earns tokens,
which buy decorations. That is the whole loop.

---

## Running it

```bash
python to-zoo/serve.py
```

Then open <http://localhost:5700>. There is no build step and nothing to
install — the only dependency, Three.js, is vendored in `vendor/` and resolved
by a native import map.

`serve.py` is the standard library's static server with caching switched off.
That matters more than it sounds: `python -m http.server` sends no cache headers
at all, so a browser will happily mix freshly-edited modules with cached ones,
and a mismatched module graph usually fails at import time — which leaves the
page sitting on the loading screen. If you ever do serve this with plain
`http.server`, hard-reload (Ctrl-Shift-R) after editing.

Opening `index.html` by double-clicking it will *not* work: browsers block ES
modules over `file://`. The page detects this and tells you so rather than
spinning.

## Deploying it

The folder *is* the deployable artifact. Drag `to-zoo/` onto Netlify, or commit
it and enable GitHub Pages. Any static host will do; there is no server, no
bundler, and no runtime dependency on a CDN except the two web fonts, which
degrade to system fonts if they fail to load.

`serve.py` is a development convenience and is not needed in production — a real
host sets its own cache headers, and there you *want* caching.

---

## Why plain ES modules

The obvious stack for this is React + React Three Fiber. This machine has no
Node.js, and the project lives inside a synced Drive folder where a
`node_modules` directory would be a liability. Vanilla ES modules and a single
vendored Three.js build cost the component model and JSX, and buy back: it runs
immediately, it deploys by copying a folder, and it will still open in a browser
in five years without a lockfile resolution.

TypeScript is replaced by JSDoc annotations, which editors typecheck without a
compiler. Tailwind is replaced by CSS custom properties in `css/tokens.css`.
Framer Motion is replaced by `js/ui/motion.js`, about eighty lines of tweening.

---

## How it fits together

```
index.html          app shell, import map, the loading state
css/
  tokens.css        the whole design system: colour, type, space, motion
  app.css           shell, HUD, navigation, responsive tiers
  components.css    cards, dialogs, sheets, shop, friends, profile
js/
  model.js          pure domain logic — urgency, zoo health, rewards
  store.js          observable state + localStorage
  suggest.js        "which animal is this?" and English date parsing
  data/seed.js      shop catalogue, mock friends, the demo zoo
  main.js           boot, and the wiring between store and world
  zoo/              everything that draws
  ui/               everything that reads
```

### The parts worth knowing about

**The ink line** (`zoo/inkline.js`). Every solid object wears a second, larger
copy of itself rendered inside-out — an inverted hull, because WebGL caps
`lineWidth` at 1px on nearly every driver and real strokes would come out thin
and sickly. Body and hull share one vertex-wobble shader, so the silhouette
dances as a single drawing instead of the ink sliding off the animal.

**Zoo health** (`model.js`). One number, derived from how many tasks are open,
how old they are, and how overdue. It drives clutter count, grass density and
colour, ground and path tint, and how restless the animals look. Deriving it
rather than storing it means the world can never disagree with the task list.

**The release** (`zoo/release.js`). One timeline, not a chain of tweens.
Skipping cancels it, which snaps `t` to 1, and `t = 1` is *defined* as the
finished world — so a skipped release and a watched one provably end in the same
state. The task is committed to the store before any of it runs, so closing the
tab mid-animation still keeps your tokens.

**Completion ordering** (`main.js`). Committing a completion notifies
subscribers synchronously, which despawns the animal for the now-completed task.
Every completion therefore goes through one function that reserves the animal
first. This is the single sharpest edge in the codebase and the comment there
says so.

**Keyboard access to a 3D scene** (`zoo/picking.js`). A real `<button>` is kept
over each animal, invisible until focused, labelled "Elephant: Finish economics
essay. 2 days overdue." Tab walks the zoo in priority order and Enter opens the
task. The 2D Tasks view is the equivalent path for anyone who would rather not
use the scene at all.

---

## Accessibility and preferences

- **Reduced motion** stills the ink wobble, the wind, the camera drift, the
  particles and the coin flight, and collapses the release to its end state. The
  app stays fully usable. It follows the OS setting and can be overridden in
  Profile → Settings.
- **Dusk mode** re-reads the same design tokens into the 3D scene, so it turns
  the zoo to evening rather than just inverting the panels.
- Every animal is reachable by keyboard and announced by a screen reader.
- Focus is trapped in dialogs and restored on close.

## Data

Everything is in `localStorage` under `to-zoo:v1`. Nothing is sent anywhere.
Sharing produces a link containing only counts — released, health, streak,
tokens — and never task titles. The friends list is sample data; it sits behind
`data/seed.js` so a real backend can replace it without touching any view.

---

## Known limits

This is a prototype, and these are deliberate:

- Friends are mock data. Sharing works, but there is nobody to share with.
- Decorations are placed deterministically. You cannot drag them around.
- Reminders are stored on the task but nothing delivers them; there is no
  notification permission flow.
- The demo zoo is seeded relative to *today*, so its overdue elephant stays
  overdue no matter when you open it.
