# Discipline & Consistency

Day by day. Big RPJ's personal training app, live at https://rob23238.github.io/Workout/

## What's in here

| File | What it does |
|---|---|
| `index.html` | The whole app: the look (CSS), the workouts (data) and how it behaves (JavaScript), all in one file |
| `manifest.json` | Tells your phone the app's name and icon when you add it to the home screen |
| `icon-180.png`, `icon-512.png` | The home-screen icons |

## How `index.html` is organized

Think of it like a gym binder with three sections:

1. **`<style>`: the look.** Colors live at the top in `:root` (like `--accent` for the green). Change one color there and it changes everywhere.
2. **`DAYS`, `NIGHT`, `PLANS`: the program.** Each exercise is one line:
   `["Name", "Sets × reps", "How to do it", source, video link, superset tag]`
   Adding an exercise means adding one line to the right day.
3. **The `render...` functions: the screens.** `renderDay`, `renderStair`, `renderAM` (morning StairMaster), `renderNight`, `renderIdeas` (feedback loop), `renderLog`. Each one builds the HTML for one tab.

Your checkmarks, logs, morning days and ideas save on your phone (browser storage), not on GitHub.

## Weekly loop

1. Train with the app all week; save ideas in the **Ideas** tab whenever you see something.
2. At the end of the week: **Log → Copy log**, paste it to Claude.
3. Claude builds the next week and pushes it here. Your icon picks it up next time you open it.
