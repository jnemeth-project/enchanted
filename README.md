# Lights Out

**A quiet night in a glowing forest. Sit down, put your hands out, and tuck the forest in to sleep.**

Lights Out is a seated, hands-only VR wind-down for Meta Quest and Meta VR Glasses. Each night takes about ten minutes, needs no instructions, and ends with the forest asleep around you.

**▶ Play it:** open **https://jnemeth-project.github.io/lights-out/** in the Meta Quest browser and tap **Enter the forest**.

![The glowing forest, seen from your seat, with the ghost butterfly resting on a golden glowdrop](docs/forest.jpg)

---

## A night in the forest

1. **Arrive.** The forest is awake and bright. Boop a mushroom, brush a fern, poke a puffball, blow a dandelion. There's no rush.
2. **Tuck it in.** Sleepy golden glowdrops float out of the mushroom clusters and drift into your reach. Squish one, and the cluster it came from settles down to sleep: the caps dim, the fairy dust falls, the light ribbons fade.
3. **Rain.** When most of the forest is asleep, soft rain begins. Cup your hand, catch the rain, and tip it into the terracotta pot beside you.
4. **Goodnight.** Your seed grows. The butterfly bows and drifts up toward the moon. The forest stays dark and quiet for as long as you'd like to sit in it.

Nothing can go wrong. Nothing is timed. There are no menus floating in the air.

## Taught by a ghost butterfly, not by text

A small butterfly made of soft light shows you each gesture instead of explaining it. It closes its wings over a glowdrop to show the squeeze, twirls when you get it right, and cups its wings to gather rain before carrying it to the pot.

| Shows you the squeeze | Shows you how to catch the rain |
| --- | --- |
| ![The ghost butterfly closing its wings over a golden glowdrop](docs/butterfly-squeeze.jpg) | ![The butterfly holding its wings up like cupped hands to gather rain beside the terracotta pot](docs/butterfly-gathers-rain.jpg) |

## A reason to come back

- **Your magic mushroom.** One seed, watered once a night: sprout, then young, then bloom. Its colour is a secret until it blooms, and rare colours (Moonlight, Aurora) are, well, rare.
- **Your own corner of the forest.** Pick up each grown mushroom and place it around your seat. A new seed appears in the pot.
- **The real moon.** The moon follows tonight's actual phase. A full moon lights the treetops; a new moon leaves a darker, starrier sky.
- **On your first night,** the mushroom grows all the way to bloom, so you see the whole cycle before you take the headset off.

| Its colour is a mystery until it blooms | Tonight's moon, through the canopy |
| --- | --- |
| ![A pale lilac magic mushroom blooming in the terracotta pot](docs/mystery-bloom.jpg) | ![The moon glowing through a gap in the dark forest canopy](docs/moon.jpg) |

## Everything you can touch

| In the forest | With your hands | With gaze and pinch (Meta VR Glasses) |
| --- | --- | --- |
| Glowdrop | Pinch, grab or poke it | Look at it, pinch |
| Mushroom near you | Tap the cap: a deep, soft *boop*, and it slowly changes colour | Look, pinch |
| Fern | Brush through it for a soft swoosh | Look, pinch |
| Puffball | Tap it to release a cloud of glowing spores | Look, pinch |
| Dandelion | Brush it and its seeds drift away | Look, pinch |
| Rain | Cup your palm up to catch it, tip it over the pot | Look at the pot, pinch |
| Your grown mushroom | Pinch it, carry it, let go | Look and pinch to lift, look and pinch to place |

Every sound is generated live and kept low, round and soft: no chimes, nothing sharp.

## Made for everyone

![The look-to-select ring filling around a glowdrop](docs/look-to-select.jpg)

- **Look to select:** no hands needed. Look at anything you can touch and a soft ring fills; when it's full, it's done.
- **One hand is enough** for everything, including catching and pouring the rain.
- **Just sit:** no tasks at all. The forest falls asleep on its own while you watch.
- **Brighter glow:** larger glowdrops and brighter things to touch.
- **Fully seated,** everything within arm's reach, no walking, no flashing, no fail states.
- **Pauses** the moment the headset comes off.

The options are on the start screen and remembered between visits.

## Playing

- **Meta Quest 3 / 3S:** turn on hand tracking (*Settings → Movement tracking → Hand and body tracking*), open the link in the Meta Quest browser, put the controllers down, and tap **Enter the forest**. Sit comfortably with a little space around you.
- **Meta VR Glasses:** works with gaze and pinch.
- **On a computer:** choose **Look around on this screen**. Drag to look, click to touch.
- **Quick tour:** add `?demo=1` to the link for a one-minute walkthrough of three nights.

Best with headphones.

## How it's built

- The forest was modelled and textured in [Blender](https://www.blender.org/) (every model, texture and material made for this project), then exported as a single glTF file.
- The game is plain JavaScript on [three.js](https://threejs.org/) with WebXR: no install step, no build step.
- All sound effects are synthesised in the browser with the Web Audio API.
- Progress is saved on the device only. No account, no tracking.

```
index.html        start screen and options
src/main.js       the night: arrival, tucking in, rain, goodnight
src/glowdrops.js  golden jelly glowdrops and the squish
src/guide.js      the ghost butterfly
src/touch.js      boops, swooshes, puffs, dandelions
src/rain.js       rain, cupped hands, pouring
src/seed.js       the magic mushroom and your collection
src/gaze.js       look to select
src/audio.js      every sound
assets/           the forest and the background recording
```

To run it locally, serve the folder (for example `python3 -m http.server`) and open `http://localhost:8000`.

## Credits

- Concept, direction and design: **Joops**
- Background recording: *Evening nature with crickets, birds and distant dogs (part 2)* by **eryliaa**
- [three.js](https://threejs.org/) (MIT licence)

Made for the **Meta VR Start Developer Competition 2026**.
