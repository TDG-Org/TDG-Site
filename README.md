<div align="center">

<img src="docs/hero-dark.webp" alt="The TDG landing page" width="100%">

# ✝️ TDG — The Disciples of God

**Brothers building software, games, and tools — for the glory of Jesus.**

Two brothers, Nate & Luke. This is our landing page.

### 🌐 [**tdg-org.github.io/TDG-Site**](https://tdg-org.github.io/TDG-Site/)

<br>

![Live](https://img.shields.io/github/deployments/TDG-Org/TDG-Site/github-pages?style=flat-square&label=live&logo=github)
![Vite](https://img.shields.io/badge/Vite-7-646cff?style=flat-square&logo=vite&logoColor=white)
![React](https://img.shields.io/badge/React-19-61dafb?style=flat-square&logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178c6?style=flat-square&logo=typescript&logoColor=white)
![CSS](https://img.shields.io/badge/CSS-no%20frameworks-264de4?style=flat-square&logo=css3&logoColor=white)
![License](https://img.shields.io/badge/license-TDG%20Source--Available-8957e5?style=flat-square)

</div>

---

## 📸 A look around

|  |  |
|:--|:--|
| <img src="docs/story.webp" alt="The story timeline"> **Our story** — five chapters on a timeline that fills as you read | <img src="docs/apps.webp" alt="The apps grid"> **Apps** — cards that tilt toward your cursor and light their edge nearest it |
| <img src="docs/building.webp" alt="The MARANATHA feature"> **Building now** — what's on our screens right now | <img src="docs/faith.webp" alt="The faith section"> **Faith** — a slow gradient field and one verse |

<div align="center">

**🌗 One toggle, two worlds** — colour crosses the page as a wave, not a snap.

| Dark | Light |
|:--:|:--:|
| <img src="docs/hero-dark.webp" alt="Dark theme" width="420"> | <img src="docs/hero-light.webp" alt="Light theme" width="420"> |

<img src="docs/mobile.webp" alt="The site on mobile" width="260">

**📱 Built down to 320px.**

</div>

---

## 🛠️ What we're building

### 💻 Apps

| # | Project | What it does | Status |
|:--|:--|:--|:--|
| 01 | **Bible Educator** | Read, listen, study and take rich notes on Scripture. 16 translations, fully offline. | 🟡 In dev |
| 02 | **Say2Quill** | Press one key, speak, and clean text lands wherever your cursor is. On-device. | 🟡 In dev |
| 03 | **Makullveny** | A calm desk for studying — books, syllabus import, flashcards, nine themes. | 🟡 In dev |
| 04 | **DevFleet** | Every git repo on your machine as a live card, sixteen panes at once. | 🟡 In dev |
| 05 | **Music Everything** | Scales, chords, a playable piano, live pitch tracking, MIDI export. | 🟡 In dev |
| 06 | **TDG Veditor** | A desktop video editor — timeline, effects, colour, audio, FFmpeg export. | 🟡 In dev |
| 07 | **MVTrade** | A paper-trading robot that learns from every trade. Real money stays locked. | ⚪ Dev only |

### 🧩 Tools & extensions

| # | Project | What it does | Status |
|:--|:--|:--|:--|
| 08 | **[Volume Controller](https://chromewebstore.google.com/detail/volume-controller/lamahdjkmgpfpcoccinmipdonifnadcf)** | Global & per-site volume 0–600%, with EQ and loudness normalize. | 🟢 **Live on the Chrome Web Store** |
| 09 | **VidHelper** | A local video downloader — extension plus a small backend on `127.0.0.1`. | 🟠 WIP |
| 10 | **N8-Tools** | A browser workspace for music and sound — transcripts, melody → MIDI, tuner. | 🟠 WIP |

### 🎮 Games

| Project | What it does | Status |
|:--|:--|:--|
| **MARANATHA** | Walk the real events of Scripture in a hand-drawn world. The World English Bible on screen and read aloud on every beat. No install, no login. | 🔵 In playtest |

> Most of what we build lives in private repos while it's in the oven — you can watch
> what's public at **[github.com/TDG-Org](https://github.com/TDG-Org)**.

---

## ⚡ Fast, and easy on your battery

A page that hits 60fps by burning most of a CPU core isn't fast — it's expensive. So the
number we optimised is **main-thread work per second of just sitting there reading**.

| Section | Before | After | |
|:--|--:|--:|:--|
| Hero | `762 ms/s` | **`93 ms/s`** | ▓▓░░░░░░░░ 8× less |
| Story | `56 ms/s` | **`3.7 ms/s`** | ▓░░░░░░░░░ 15× less |
| Apps | `85 ms/s` | **`2.5 ms/s`** | ░░░░░░░░░░ 34× less |
| Tools | `67 ms/s` | **`2.3 ms/s`** | ░░░░░░░░░░ 29× less |
| Building | `88 ms/s` | **`4.8 ms/s`** | ░░░░░░░░░░ 18× less |
| Faith | `45 ms/s` | **`0.9 ms/s`** | ░░░░░░░░░░ 50× less |

**~24× less work** away from the hero, with the design pixel-for-pixel unchanged.

How: the animation loop **parks itself** when nothing needs a frame · the hero's point
cloud paints into one buffer instead of 4,200 canvas calls a frame · animations that
repaint were rebuilt to run on the compositor · nothing writes a style twice with the
same value.

<div align="center">

`176 kB` total page weight · `0.0008` CLS · `60 fps` · **~0 CPU** when you stop scrolling

</div>

---

## 🚀 Run it

```bash
npm install
npm run dev
```

That's it — **http://localhost:5180**.

```bash
npm run build       # typecheck + production bundle into dist/
npm run typecheck   # types only
```

---

## 🧩 How it's built

Vite + React + TypeScript, plain CSS with custom-property tokens. **No UI or animation
libraries** — the motion is small enough to own, and owning it is what keeps the timings
exact.

```
src/
├── styles/      tokens (both themes) + shared primitives
├── lib/         the single animation loop everything subscribes to
├── theme/       theme state + the colour wave
├── hooks/       reveal · tilt · parallax · offscreen pause
├── components/  one file + one stylesheet per section
└── data/        all copy, cards and links  ← edit here
docs/            screenshots for this README
public/shots/    product screenshots (AVIF + WebP, 1x and 2x)
```

**Want to change the copy or add a project?** It's all in
[`src/data/content.ts`](src/data/content.ts). Nothing else needs touching.

<details>
<summary><b>The four things that carry the character</b></summary>

<br>

**🌗 The theme wave.** Every element gets a transition delay based on how far it sits from
the toggle, so colour crosses the page like a wave. The trick that makes it animate rather
than snap is forcing a reflow between setting the delays and flipping the theme.

**✨ The hero point cloud.** Up to 4,200 points — scaled to the device — morphing between
twelve forms on a 2D canvas.
It rotates **only** while you hold and drag — never on hover — with inertia. Every point is
splatted into one alpha buffer and uploaded in a single call.

**🎨 Section blending.** Story, Tools and Faith fade between neighbours; Apps and Building
stay flat as contrast anchors. Every boundary meets on an identical colour value.

**🖱️ The cursor.** A dot that tracks exactly plus a ring that trails and reacts — open over
links, dashed over the draggable hero, pinched on press. Fine pointers only; touch keeps
its native behaviour.

</details>

<details>
<summary><b>Accessibility & motion</b></summary>

<br>

Everything respects `prefers-reduced-motion`. Focus rings are visible on every interactive
element, including the story rows. Decorative layers are hidden from screen readers. The
hero model is never required to read anything, and animations pause while their section is
off screen.

</details>

---

## 📄 License

**TDG Source-Available License** — read it, run it, learn from it, fork it privately.
Just don't ship it as your own. See [LICENSE](LICENSE).

<div align="center">
<br>

**JESUS IS KING**

<sub>© 2026 TDG · Built by brothers, Nate & Luke · <a href="https://natemci.com">natemci.com</a></sub>

</div>
