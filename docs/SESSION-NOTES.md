# To-Zoo — session notes

Everything from this working session in one place: the pitch and application
writing, the product strategy, and the build changes with how each was checked.

---

## 1. Pitch competition category

**Competition categories:** EdTech, FinTech, FMCG, Health.
**Recommendation: EdTech.**

- **FinTech and FMCG are out.** The tokens are play money, not a financial
  service, and there is no physical product.
- **EdTech over Health.**
  - The user is a student, the demo tasks are coursework and applications, and
    the problem (work sitting undone) is an academic-performance problem.
  - Health is defensible (Finch is a virtual pet plus self-care checklist and
    sits in Health & Fitness), but a health track asks for evidence of an
    outcome, and To-Zoo is a prototype, not a study.
- **Expect the objection** "this doesn't teach anything."
  - Answer: the binding constraint in education is execution, not knowledge.
  - Completion and retention are education metrics.
- **Lead with the reversal, not the 3D.** Version 1 punished you for having a
  long list, which is exactly what makes people avoid a to-do app. Now a busy
  zoo is a thriving zoo and only neglect costs anything.
- **Demo it live.** A playable 3D world in a browser beats slides.

---

## 2. Standing out in a YC application

**The test:** can you remove the animals and still have the product? If yes,
it's a skin. Today the answer is yes, and that's the thing to fix.

**Strongest wedge: a shared zoo.**
- Individual productivity is crowded; mutual accountability is not.
  Flatmates, study groups, couples and small teams all drop things they
  promised each other.
- **Neglect becomes social.** A rabbit lying on its side that your flatmate
  can see is stronger than a red badge only you see.
- **Retention comes from other people**, not willpower.
- **The metaphor becomes load-bearing.** A shared list is admin; a shared
  place is somewhere you visit.

**Next MVPs, ranked:**
1. **Shared zoo.** This is the company.
2. **Frictionless capture.** Forward or share an email, Slack or WhatsApp
   message into the zoo so it holds real commitments.
3. **Ambient surface.** Widget, lock screen or second monitor, so you see it
   without opening it.
4. **ADHD / executive-function positioning.** Narrow, underserved, and the
   neglect-not-volume insight fits overwhelm avoidance. Avoid clinical claims.

**What makes the application stand out:**
- **Traction.** Forty UCL students using it for three weeks, with a retention
  number.
- **The demo video.** Most consumer apps show a form; this shows a world.
- **The v1 → v2 reversal** as the answer to "something you built and what you
  learned."

---

## 3. Claude Ambassador application

### Describe one way you use Claude that more students should know about (≤150 words)

Final version, 149 words, no dashes, colons or semicolons:

> Most students just use Claude as a search engine. I use it to deal with the elephant in the room… literally.
>
> I built To-Zoo List, a 3D to-do app where every task becomes an animal in your zoo. Elephants are the big jobs you keep avoiding. Lions are medium jobs, rabbits are quick wins. New tasks arrive as happy animals, but leave one untouched and it turns miserable. Finish the task and the animal goes free, earning you tokens for accessories and decorations.
>
> Having never written a line of graphics code, I had it running in days with Claude. I gamified my procrastination. Next comes the web version, then hopefully the App Store.
>
> That's what more students should know. Claude doesn't only make you productive at searching, it can make you productive at everything. You don't have to settle for the tools you're given, you can build your own.

### Anything else you'd like us to know? (≤500 characters)

Final version, 427 characters:

> I've recently been offered a role as campus ambassador and growth intern at VoiceOS, a YC P25 startup. I haven't signed a contract yet, and being a Claude Ambassador is still the role I really want. Claude is the tool that made me believe I could build things, and that's the feeling I want to share with other students. Growth marketing is what I love doing, and I'd bring real momentum to helping Claude reach more of campus.

- **Before signing:** check the VoiceOS contract for exclusivity or
  conflict-of-interest terms. Promoting two AI products on one campus is what
  those clauses cover.
- **Spare room:** about 70 characters, enough for "My TikTok already
  reaches 2,700 followers."

Earlier TikTok version, 452 characters, kept in case it's useful:

> The first time Claude helped me build something I thought was beyond me, I felt like a door had opened. I started my TikTok, now at 2,700 followers, because I wanted every student to feel that too. Growth marketing and digital transformation are what I care about most, because they decide who gets access to new technology and who gets left behind. Claude changed what I believe I can do. I'd love the chance to help it do the same for other students.

---

## 4. Build changes

### 4.1 Brighter world

**Cause:** the vendored three.js (r169) uses physically correct lights, where
Lambert shading is `albedo × light / π`. The lighting keyframes had been tuned
for the old legacy lights, so every surface showed about a third of its real
colour.

**Changes:**
- `js/zoo/daylight.js`
  - Added `LIGHT_SCALE = Math.PI`. Keyframe intensities now mean "fraction of
    full light".
  - Retuned every keyframe, weighted toward the hemisphere bounce so shadowed
    flanks lift.
  - Lighter bounce colours.
- `js/zoo/scene.js`: the pre-daylight fallback intensities use the same scale.
- `css/tokens.css`
  - Grass, sand, sky and water tokens brightened slightly.
  - Dark-theme overrides removed for world colours (grass, sand, sky, water,
    animals). Night comes from the moon, so darkening those tokens made night
    dark twice.
  - Dusk panels lifted slightly off near-black.
  - New UI token `--art-sky` for the shop-card and card gradients
    (`css/components.css`).
- `js/main.js`: `?debug` in the URL exposes `window.__zoo` for measuring.

### 4.2 Sky and sun

- **Camera tilted up** (`scene.js`). Values were solved numerically so the
  horizon sits about 31–33% from the top, the back fence about 55%, and an
  elephant stays the same height on screen as before.
  - Landscape: fov 42, camera `(0, 3.8, 13)`, looking at `(0, 1.4, -2)`.
  - Portrait: fov 48, camera `(0, 5, 16.5)`, looking at `(0, 1.8, -2)`.
  - Far plane raised from 200 to 260.
- **Shared `zoo.atmosphere` uniforms**: zenith, horizon, sun direction, colour
  and intensity, ambient, night, moon direction. `daylight.js` writes them;
  the sky and sea read them.
- **New sky shader** (`environment.js`):
  - blue deepening overhead, with horizon haze;
  - sun disc with a tight bloom and a wide halo;
  - warm horizon at dawn and dusk;
  - painted fbm clouds that drift and dim at night;
  - dithering against banding;
  - correct colour-space output (it previously rendered darker than its own
    colours).
- **Clouds:** the old low-poly blob clouds were removed. With the taller sky
  they sat in the foreground like boulders.
- **Sun and moon path** (`daylight.js`): they cross the visible band of sky
  left to right. The band is computed from the camera fov and pitch, capped
  below the top bar, and recomputed on resize. The moon disc follows the same
  arc at night.
- **Fog:** 26–88 changed to 34–150, and its colour now always equals the
  horizon.
- **Stars shader:** now outputs in the correct colour space.

### 4.3 Summer ocean

`js/zoo/seasons.js`, `buildSea()`: the flat Lambert plane, wet strip and surf
plane were replaced with one shader.

- **Waves:**
  - three travelling waves rolling toward the camera;
  - they calm to zero at the waterline;
  - peak height about 0.13.
- **Colour:** shallow turquoise, then blue, then deep blue with distance,
  from new tokens `--sea-shallow`, `--sea`, `--sea-deep` and `--foam`.
- **Reflection:** Fresnel sky reflection, capped so the sea doesn't turn into
  a pale mirror from a low camera.
- **Sun glitter** sits under the visible sun disc. At night it becomes a dim
  moon path.
- **Foam:**
  - an animated, ragged lapping edge;
  - foam lines rolling in;
  - faint whitecaps.
- **Beach:** a wet-sand gradient between the beach and the water.
- **Shore:** `SHORE_Z = -35` is exported. The fence is at z −6.2.
- **Palms** are kept on the beach, and outside grass is skipped past the
  shore.

### 4.4 Elephant (and lion, rabbit) lying down

**Cause:** the old pose tipped the animal about its feet and pushed it down,
which buried it to the belly.

**Changes** (`js/zoo/animals.js`):
- **`rollTableFor()`:** samples each species' silhouette once. For any roll
  angle it gives the lift that puts the lowest point on the grass and the
  sideways shift that keeps the animal over its spot.
- **New `poseGroup`:** posture rotates this group, so the contact shadow stays
  flat on the ground.
- **Lie poses:** elephant `roll 1.5`, lion `roll 1.4`, rabbit `roll 1.5`,
  each with a small settle.
- **Head droop** is disabled while rolled, so the head doesn't go into the
  ground.

**Measured depth below ground when lying:** elephant 0.04 (deliberate settle),
lion 0.02, rabbit 0.01.

### 4.5 Background trees

- **No bobbing.** The merged canopy mesh was rotated around the world origin,
  so outer trees rose and fell by more than a unit. The bushes had the same
  problem. Both animations were removed; the ink wobble keeps them alive.
- **Not merged with hills.** `clearOfHills()` pushes each tree radially just
  past its nearest hill and never toward the fence. It uses the same random
  draws, so nothing else moves.

### 4.6 Bug fixed along the way

- **Frame-callback leak.** Every season change left sway and surf callbacks
  running on disposed meshes. `build()` now keeps the unsubscribers and
  `teardown()` calls them.

---

## 5. Verification results

| Check | Result |
|---|---|
| Horizon position, 1280×760 | 30.5% from top |
| Horizon position, 375×812 | 32.4% from top |
| Sun on screen through the day (1280×760) | x 224 → 662 → 1026 at 07:00 / 13:00 / 18:00, y 128–196, always below the top bar |
| Sky horizon pixel at noon vs `#e6f2ee` | (240, 243, 233): matches |
| Sea nearest edge | z −33.1 (fence at −6.2) |
| Summer trees | all at z > −32.1, none in the sea |
| Trees inside hills (spring / autumn / winter) | 0 of 26 each |
| Background meshes moving over 1.2 s, all seasons | 0 |
| Frame callbacks after 10 season switches | 9 → 9 (no leak) |
| Lying animals below ground | elephant 0.04, lion 0.02, rabbit 0.01 |
| Console errors | none |

**Screenshots reviewed:**
- summer at dawn, noon, sunset and night;
- spring at noon;
- autumn at 14:00;
- portrait.

**`/run` end-to-end** (Browser pane, port 5700):
1. Opened the app and skipped onboarding.
2. Added "Print reading list"; a rabbit was suggested and spawned.
3. Opened its card and clicked "Mark done & send home".
4. The release animation played, a "Rabbit went home!" toast appeared with
   Undo, and the daily counter went 0/3 → 1/3.

No errors. The user's existing task "Hi" was left untouched; the test task is
saved as completed.

**Noticed while running:**
- **Typing lost after "Add task".** The form animates in for about half a
  second, and keystrokes typed immediately after the click are lost.

---

## 6. Tooling

- **Installed** `web-design-guidelines` (vercel-labs/agent-skills) into
  `.claude/skills/`. It fetches Vercel's Web Interface Guidelines and reviews
  files against them.
- **Memory updated:** Node, npm and npx are now installed on this machine
  (used only for CLI tools). The projects are still static ES modules served by
  Python.

---

## 7. Open items

### UI guideline findings (not yet fixed)

- `css/components.css` lines 132, 159, 362, 503, 597, 826, 864, 1116:
  `transition: all` should list the properties it animates.
- `css/components.css:445`: the search input removes its outline and only
  changes the border colour in its place.
- `css/components.css:81`: should use `:focus-visible` rather than `:focus`.
- `index.html:9`: `theme-color` is fixed to the light background and doesn't
  follow night.
- `index.html`: no skip link, and no `<h1>` outside the no-JavaScript fallback.
- `js/ui/addTask.js:64`, `js/ui/tasksView.js:95`: placeholders should end
  with "…".
- `js/ui/addTask.js:94`, `js/ui/profileView.js:70`: inputs are missing `name`
  or `autocomplete`.
- `js/ui/views.js`: the active tab isn't in the URL, so it can't be
  deep-linked.
- No `touch-action: manipulation` on tap targets.

### Product backlog carried over

- **Animals playing together** (`zoo/ai.js`): states, flocking, trunk touches,
  and play suppressed by low mood.
- **Placement and drag** (`zoo/placement.js`), plus an inventory view.
- **Accessories mode:** per-animal assignment, instead of global.
- **Decorations:** placement affordances and upgrades.
- **Product development journal:** `docs/PRODUCT-JOURNAL.md`.
- **Add-task form:** fix the lost-keystrokes timing issue.
