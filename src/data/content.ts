export const GITHUB_ORG = 'https://github.com/TDG-Org'
export const CONTACT = 'https://natemci.com'
export const VOLUME_CONTROLLER =
  'https://chromewebstore.google.com/detail/volume-controller/lamahdjkmgpfpcoccinmipdonifnadcf'

export const NAV_LINKS = [
  { href: '#origin', label: 'Origin' },
  { href: '#apps', label: 'Apps' },
  { href: '#tools', label: 'Tools' },
  { href: '#games', label: 'Games' },
  { href: '#faith', label: 'Faith' },
  // The last two are ROUTES rather than section anchors, because each is its
  // own page, and every route carries a leading slash. The rule was learned
  // from one near miss: this section used to be '#story', one letter from
  // '#/store', which without the slash would have been a coin flip for whoever
  // matched first. It is '#origin' now, so that pair cannot clash any more, and
  // the slash stays on every route regardless — it is what stops a section
  // anchor added later from colliding with a route that already exists.
  { href: '#/about', label: 'About' },
  { href: '#/store', label: 'Store' },
] as const

/**
 * The lines the hero types out under the wordmark.
 *
 * **The first entry is the one the page always opens on.** It is the line the
 * site is known by, it is the line every screenshot and every share card
 * carries, and a visitor who arrives twice should meet the same sentence both
 * times — so it is fixed, not drawn. The rest are drawn **without repeats**:
 * one is picked at random, typed, and taken out of the bag, and the bag is only
 * refilled once every line has had its turn. A plain `Math.random()` per swap
 * would show the same line twice in a row about one time in four, which reads
 * as the animation having stalled rather than as chance.
 *
 * They are all one sentence, all about the same length, and they all say the
 * same thing a different way. A line that needs two rows at 375px would move
 * the CTAs down every time it came up.
 */
export const HERO_TAGLINES = [
  'Brothers building software, games, and tools for the glory of Jesus.',
  'Two brothers, nights and weekends, building what we wish existed.',
  'Apps, tools, and games, made to be useful and to point back to Him.',
  'Two brothers, one name, and everything we build with it.',
  'Everything we make, we make for the glory of Jesus.',
] as const

/** A real screenshot, served as AVIF with a WebP fallback at 1x and 2x. */
export type Shot = {
  slug: string
  widths: [number, number]
  alt: string
  /** object-position, for crops where the subject is not centred */
  position?: string
  /**
   * Width over height of the file, when it is not the site's 16:10.
   *
   * Every surface that draws a shot writes `width` and `height` on the `<img>`
   * so the box is laid out before the file arrives, and the browser turns the
   * pair into `aspect-ratio: auto w/h` — then swaps to the file's real ratio
   * the moment it decodes. A ratio typed wrong is therefore a layout shift on
   * every cold open, and it was: MARANATHA's shot is 16:9 (720x405) and every
   * component assumed 16:10, so its page moved everything under the picture
   * up by 54px when the image landed. Stated once here and read through
   * `shotHeight()`, so no component carries the number.
   */
  ratio?: number
}

/** The site's own screenshot ratio; every `public/shots/` file but one is cut to it. */
export const SHOT_RATIO = 16 / 10

/** The `height` attribute for a shot drawn at `width`, from the file's own ratio. */
export const shotHeight = (shot: Shot, width: number) => Math.round(width / (shot.ratio ?? SHOT_RATIO))

export type Chapter = {
  chapter: string
  phase: string
  numeral: string
  title: string
  copy: string
  /** the turn: halo + pulsing node dot */
  turn?: boolean
}

export const CHAPTERS: Chapter[] = [
  {
    chapter: 'CH. 01 · BEFORE',
    phase: 'ORIGIN',
    numeral: '01',
    title: 'The Diamond Staff',
    copy: 'Before any of this we ran a Minecraft: Pocket Edition server of our own, and we called it TDS, short for The Diamond Staff. Every server we had played on called the people in charge Staff, and Black Ops II had just handed us four elemental staffs to fight with, so the word stuck.',
  },
  {
    chapter: 'CH. 02 · 2016',
    phase: 'THEN',
    numeral: '02',
    title: 'The clan tag',
    copy: 'When we started a Black Ops II clan we could not think of anything better, so we reached back for the name we already had. TDS became TDG, The Diamond Gamers.',
  },
  {
    chapter: 'CH. 03',
    phase: 'DRIFT',
    numeral: '03',
    title: 'The lobbies emptied',
    copy: 'The clan grew, and then our friends bought the next generation of consoles while we were still on our Xbox 360s. The lobbies emptied out. We wore the tag anyway, because by then it was a brother thing more than a gaming one.',
  },
  {
    chapter: 'CH. 04',
    phase: 'NEXT',
    numeral: '04',
    title: 'Game dev',
    copy: "Playing in other people's worlds got old before we did, so we started building our own instead.",
  },
  {
    chapter: 'CH. 05 · 2024',
    phase: 'THE TURN',
    numeral: '05',
    title: 'Found the Truth',
    copy: 'Then we were called out of that life and into a far greater one. The three letters never changed; what they stood for did. TDG became The Disciples of God.',
    turn: true,
  },
  {
    chapter: 'CH. 06',
    phase: 'CRAFT',
    numeral: '06',
    title: 'Making what we needed',
    copy: 'Everything since has come from the same question: what do we wish existed? Scripture you can read, hear and mark up in one place. A game you walk the Bible through. A desk for a student drowning in browser tabs. The small utilities came after, because our own days kept needing them.',
  },
  {
    chapter: 'CH. 07',
    phase: 'NOW',
    numeral: '07',
    title: 'Still building',
    copy: 'The trials came, and we are still growing through them. Nights and weekends, on things we want to outlast us.',
  },
]

/** See the `iconShape` field below. */
export type IconShape = 'tile' | 'glyph'

/**
 * One 9px mono tag on a card, and on the head of that card's own page.
 *
 * Declared once rather than inline on each card type, because `src/content/`
 * validates a chip arriving from the Developer console against exactly this
 * shape — and a shape written in three places is three things to keep in step
 * the day a chip gains a field.
 */
export type Chip = { label: string; hot?: boolean }

/**
 * The backdrop a piece of key art is drawn on.
 *
 * A small closed vocabulary on purpose, the same way `pageBlocks.ts` is: each
 * name is one restrained treatment — a tone, a light source, and at most one
 * cutout from the parallax art kit — and `components/KeyArt.tsx` owns what
 * each one actually draws. Adding a sixth app picks one of these; it does not
 * describe a picture here. A scene per app is how a data file turns back into
 * a component.
 */
export type KeyArtScene =
  /** Cold blue night, a faceted pine pair at the right edge. */
  | 'pines'
  /** Warm lamplight, a garden arch at the right edge. The nearest of the five
   *  to Bible Educator's own cover. */
  | 'arch'
  /** Indigo distance, a low mountain ridge running off the right. */
  | 'ridge'
  /** Slate blue-green, a stone footbridge low and to the right. */
  | 'bridge'
  /** Plum graphite and the light source alone. No cutout at all. */
  | 'dusk'

/**
 * A card's own key art: the cover `components/KeyArt.tsx` draws instead of a
 * screenshot.
 *
 * Bible Educator's cover is a raster in `public/shots/`, and the user called it
 * right; these five are the same composition drawn as an SVG so it stays crisp
 * at every card width, costs no image bytes for the type, and stays editable in
 * git. **The layout is identical across all five** — one set of constants at the
 * top of `KeyArt.tsx` — because that is what makes six cards read as one set.
 * What varies is the scene and the words.
 *
 * The words are held to the same rules as everything else in this folder: the
 * title is a name, the line is one sentence a stranger can decide from, and
 * every fact is checkable against that app's own page in `appPages.ts`. Do not
 * write a capability into a cover that the page does not already claim.
 */
export type KeyArtSpec = {
  /** The app's own icon, the same filename its card already names. */
  icon: string
  iconShape: IconShape
  /** Title Case: it is a name. */
  title: string
  /** One sentence, sentence case, ending in a full stop. */
  line: string
  /**
   * Three or four very short facts, joined with `·` on the strip. Sentence case
   * unless the fact is a proper noun or an acronym, which keep their own form
   * (`Windows`, `FFmpeg`, `MIDI`, `Git`) — rule 7 of `AGENTS.md`.
   *
   * Keep the joined strip under about 56 characters. It is drawn as one line of
   * SVG text, which cannot wrap, so a long one runs off the right edge instead
   * of reflowing. Bible Educator's own strip is the length to match: `Free · No
   * account · No ads · 16 translations`.
   */
  facts: string[]
  /** Which backdrop `KeyArt` draws. */
  scene: KeyArtScene
}

/**
 * The line at the foot of every cover.
 *
 * One constant rather than a field on `KeyArtSpec`, because it is the same
 * sentence on all of them and a per-app field would be five places to state one
 * thing. It matches Bible Educator's raster word for word — that cover is the
 * sibling the other five have to sit beside.
 */
export const KEY_ART_BYLINE = 'Developed by TDG, The Disciples of God'

/**
 * What this site is CALLED — the one place the app reads its own name from.
 *
 * It is `TDG Cebu` as of 2026-08-31, and it was `TDG Site` before that. Three
 * different things used to be spelled the same way and only one of them
 * changed, so they are worth separating here once:
 *
 * | | |
 * | --- | --- |
 * | **The name** | `TDG Cebu`. This constant, plus `<title>`, `apple-mobile-web-app-title`, `application-name` and the manifest's `name`/`short_name` in `index.html` and `public/manifest.webmanifest` — AGENTS.md rule 18 checks those five together. |
 * | **The repo and the address** | still `TDG-Site`, still served from `/TDG-Site/`. Renaming those moves the published URL and breaks every cross-app link, every OAuth redirect and every Payment Link return. |
 * | **The database id** | still `tdg-site`. It keys feedback rows, ownership rows and the `tdg-site-*` Edge Functions that already exist; renaming it orphans them. |
 *
 * So a slug is never the place to read the name from. `prettyId('tdg-site')`
 * would happily answer `TDG Site` forever — which is why `src/account/appNames`
 * maps the id to THIS constant before it reaches that fallback.
 */
export const SITE_NAME = 'TDG Cebu'

/**
 * What the DATABASE calls this site, and it is not what the site is called.
 *
 * Every TDG app files feedback and owns products under an app id; this one's
 * is `tdg-site`, written here beside `SITE_NAME` precisely so the pair is read
 * as a pair. It is frozen: rows in tdg-core already carry it, and so do the
 * `tdg-site-account` and `tdg-site-deploys` Edge Functions.
 */
export const SITE_APP_ID = 'tdg-site'

export type AppCard = {
  id: string
  index: string
  /**
   * The slug of this app's own page, in `src/data/appPages.ts`. It is what
   * turns the card into a link, so a card without one goes nowhere.
   */
  page: string
  /**
   * The app's repository in the TDG-Org GitHub organisation — the name only,
   * exact case, the way GitHub spells it: `Bible-Educator`, never a URL.
   *
   * It is what lets a card answer for itself whether the app is live.
   * `src/live/` asks GitHub about the org's repositories and asks GitHub
   * Pages whether `https://tdg-org.github.io/<repo>/` exists — the second
   * question works even for a private repository with a public deploy, which
   * is what Bible Educator is — and a card whose app turns out to be deployed
   * swaps its status caption for a real link, with no edit here. The repo's
   * own Website field wins over the derived Pages URL when somebody set one,
   * and a `#download` anchor in it makes the button say Download rather than
   * Open. A hand-written `download` on the card outranks all of it: that is a
   * human decision, and the runtime never argues with one.
   *
   * A wrong name fails QUIETLY — the card simply never upgrades — so when an
   * app first deploys and its button does not appear, this string is the
   * first thing to check against the repository's real name. Names marked
   * "expected" below were written before their repos deployed and have not
   * been checked against a live one yet.
   */
  repo?: string
  /**
   * What this app calls itself when it writes to the shared TDG database —
   * `bea`, `veditor`, `devfleet`, `makullveny`. It is the `app` column of
   * `tdg_badges`, `tdg_streaks` and `tdg_feedback`, and the id
   * `tdg_store_apps()` discovers.
   *
   * It is here so the Account page can say **Bible Educator** where the
   * database says `bea`. Nothing else on this site needed the mapping, because
   * nothing else drew a row the database had named — and the moment one did,
   * the alternative was a lookup table inside a component, which is what rule 1
   * forbids: a product's name is copy, and copy lives in this file.
   *
   * **Optional, and a missing one is not a bug.** An app that has never written
   * a row has nothing to map, and an id this file has never heard of still gets
   * a face: `prettyId` turns `music-everything` into `Music Everything`. So the
   * list is allowed to be incomplete. (`tdg-site` is the one id that fallback
   * gets wrong now that the site is called TDG Cebu; `SITE_NAME` above is what
   * `src/account/appNames` maps it to instead.) What
   * it must never be is WRONG — only ids actually observed in the database are
   * written here, because a guessed one produces a mapping that silently never
   * matches, which reads exactly like not having it at all.
   */
  backend?: string
  title: string
  copy: string
  /**
   * The app's own icon, as a filename in `public/assets/`.
   *
   * Every one is the mark the app itself ships, exported the same way: trimmed
   * to the art, squared, and written at 128px. Two are drawn by us, in vector,
   * for apps that have no icon of their own yet, and both say so where they are
   * drawn. See `IconShape` for why the shape matters.
   */
  icon: string
  /**
   * A rounded TILE (its own background and corners, filling the square) or a
   * free GLYPH (a mark on nothing). It decides whether the icon is drawn with
   * the site's ring and radius around it: a ring belongs on a tile, and around
   * a glyph it is a box drawn about thin air.
   */
  iconShape: IconShape
  chips: Chip[]
  status: string
  /**
   * Optional real action. When it is present the card renders this link where
   * the plain status caption would go; when it is absent the card is exactly
   * what it was. The linked page owns everything about the download itself:
   * per-OS builds, version, install notes. Nothing here restates it.
   */
  download?: { href: string; label: string }
  slotPlaceholder: string
  shot?: Shot
  /**
   * Custom key art for this card's cover.
   *
   * **`art` and `shot` are not alternatives, and a card that has key art keeps
   * its `shot`.** They are for two different places: `ImageSlot` prefers `art`
   * on the card, and `shotForPage()` in `appPages.ts` reads `APPS[].shot` to put
   * the real screenshot at the head of that app's own page, which is where a
   * screenshot genuinely belongs — somebody who has opened the page wants to see
   * the software. A card in a grid at 280px does not: the screenshot is a grey
   * rectangle at that size, and six of them side by side say nothing.
   *
   * Delete a `shot` to "clean up" after adding `art` and the app's page loses
   * its screenshot silently.
   */
  art?: KeyArtSpec
}

export const APPS: AppCard[] = [
  {
    id: 'app-bible',
    index: '01',
    page: 'bible-educator',
    // Private repo, public deploy — the probe in src/live/ is what finds it.
    repo: 'Bible-Educator',
    backend: 'bea',
    title: 'Bible Educator',
    copy: 'Open a passage, have it read aloud while you follow, and mark it up as you go. Any of the 17 translations can be downloaded to your device in one file.',
    icon: 'icon-bible-educator.webp',
    iconShape: 'glyph',
    chips: [
      { label: 'PWA' },
      { label: 'IN DEV', hot: true },
      { label: 'FREE · NO ACCOUNT' },
      { label: 'NO ADS' },
    ],
    status: 'Coming soon',
    slotPlaceholder: 'Drop a Bible Educator screenshot',
    shot: {
      slug: 'bible-educator',
      widths: [560, 1120],
      alt: 'Bible Educator: read, listen, study, and take notes on Scripture',
      position: 'left center',
    },
  },
  {
    id: 'app-say2quill',
    index: '02',
    page: 'say2quill',
    repo: 'Say2Quill', // expected name — check against the repo when it first deploys
    title: 'Say2Quill',
    copy: 'Press one key anywhere, speak, and clean formatted text lands in whatever field has focus. The speech runs on your own machine, so there is no cloud and no account.',
    icon: 'icon-say2quill.webp',
    iconShape: 'tile',
    chips: [
      { label: 'WINDOWS' },
      { label: 'IN DEV', hot: true },
      { label: 'ON-DEVICE' },
      { label: 'NO TELEMETRY' },
    ],
    status: 'Coming soon',
    slotPlaceholder: 'Drop a Say2Quill screenshot',
    shot: {
      slug: 'say2quill',
      widths: [560, 1120],
      alt: 'The Say2Quill dashboard, showing the dictate tab and a live transcript',
      position: 'left top',
    },
    art: {
      icon: 'icon-say2quill.webp',
      iconShape: 'tile',
      title: 'Say2Quill',
      line: 'Speak anywhere, and clean text lands where you type.',
      facts: ['Windows', 'On-device speech', 'No account', 'Works offline'],
      scene: 'pines',
    },
  },
  {
    id: 'app-makullveny',
    index: '03',
    page: 'makullveny',
    // Named for the claim alone: the hand-written `download` below outranks
    // discovery, so the runtime never asks anything about this repo.
    repo: 'Makullveny',
    backend: 'makullveny',
    title: 'Makullveny',
    copy: 'A calm desk for studying. Write and draw straight into books of your own, hand it a syllabus and get the dates back, and drill the hard parts with flashcards. None of it leaves your machine.',
    icon: 'icon-makullveny.webp',
    iconShape: 'tile',
    chips: [
      { label: 'WINDOWS' },
      { label: 'EARLY BUILD', hot: true },
      { label: 'LOCAL' },
      { label: 'STUDENTS' },
    ],
    status: 'Early build',
    download: {
      // Its own site owns the download: per-OS buttons, the version that is
      // actually published, and the unsigned-installer note.
      href: 'https://tdg-org.github.io/makullveny-site/#download',
      label: 'Download Makullveny',
    },
    slotPlaceholder: 'Drop a Makullveny screenshot',
    shot: {
      slug: 'makullveny',
      widths: [560, 1120],
      alt: 'The Makullveny dashboard in the Cozy Cabin theme, with verse of the day and the app dock',
      position: 'center top',
    },
    art: {
      icon: 'icon-makullveny.webp',
      iconShape: 'tile',
      title: 'Makullveny',
      line: 'A calm desk for studying, kept on your own machine.',
      facts: ['Windows', 'Nine themes', 'Flashcards', 'Kept on your machine'],
      scene: 'arch',
    },
  },
  {
    id: 'app-devfleet',
    index: '04',
    page: 'devfleet',
    repo: 'DevFleet', // expected name — check against the repo when it first deploys
    backend: 'devfleet',
    title: 'DevFleet',
    copy: 'Point it at a folder and every git repo becomes a live card. Open up to sixteen panes, each with its own terminal, diff review and notebook.',
    icon: 'icon-devfleet.webp',
    iconShape: 'glyph',
    chips: [{ label: 'WINDOWS' }, { label: 'IN DEV', hot: true }, { label: 'GIT' }, { label: 'ELECTRON' }],
    status: 'Coming soon',
    slotPlaceholder: 'Drop a DevFleet screenshot',
    shot: {
      slug: 'devfleet',
      widths: [560, 1120],
      alt: 'The DevFleet workspace: a project list on the left and an open project pane on the right',
      position: 'left top',
    },
    art: {
      icon: 'icon-devfleet.webp',
      iconShape: 'glyph',
      title: 'DevFleet',
      line: 'Every git repo on your machine, as a live card.',
      facts: ['Windows', 'Git', 'Sixteen panes', 'Terminal and diff'],
      scene: 'ridge',
    },
  },
  {
    id: 'app-music',
    index: '05',
    page: 'music-everything',
    repo: 'Music-Everything', // expected name — check against the repo when it first deploys
    title: 'Music Everything',
    copy: 'Learn music by playing it, not by reading about it. Scales and chords on a piano you can play, your own singing drawn back at you as pitch, and a note track you can export as MIDI.',
    icon: 'icon-music-everything.webp',
    iconShape: 'tile',
    chips: [{ label: 'DESKTOP' }, { label: 'IN DEV', hot: true }, { label: 'MIDI + MIC' }],
    status: 'Coming soon',
    slotPlaceholder: 'Drop a Music Everything screenshot',
    art: {
      icon: 'icon-music-everything.webp',
      iconShape: 'tile',
      title: 'Music Everything',
      line: 'Learn music by playing it, not by reading about it.',
      facts: ['Desktop', 'Scales and chords', 'Pitch tracking', 'MIDI export'],
      scene: 'bridge',
    },
  },
  {
    id: 'app-veditor',
    index: '06',
    page: 'veditor',
    repo: 'TDG-Veditor', // expected name — check against the repo when it first deploys
    backend: 'veditor',
    title: 'TDG Veditor',
    copy: 'A desktop video editor: cut on a timeline, grade the colour, mix the audio, then hand it an export pipeline you set up yourself instead of one somebody else chose for you.',
    icon: 'icon-veditor.webp',
    iconShape: 'tile',
    chips: [{ label: 'DESKTOP' }, { label: 'IN DEV', hot: true }, { label: 'FFMPEG' }],
    status: 'Coming soon',
    slotPlaceholder: 'Drop a TDG Veditor screenshot',
    art: {
      icon: 'icon-veditor.webp',
      iconShape: 'tile',
      title: 'TDG Veditor',
      line: 'Cut, grade, mix, and export it the way you want.',
      facts: ['Desktop', 'Timeline and grading', 'Nine themes', 'FFmpeg'],
      scene: 'dusk',
    },
  },
  {
    id: 'app-mvtrade',
    index: '07',
    page: 'mvtrade',
    // Confirmed against the clone line in the app's own README, not guessed:
    // `git clone https://github.com/TDG-Org/MVTrade.git`.
    repo: 'MVTrade',
    title: 'MVTrade',
    copy: 'A day-trading robot that runs on your own machine and learns from every trade it makes. It only ever spends paper money — real-money trading is locked in the code on purpose, and stays locked until the strategy proves itself.',
    icon: 'icon-mvtrade.svg',
    iconShape: 'tile',
    chips: [
      { label: 'WINDOWS' },
      { label: 'IN DEV', hot: true },
      { label: 'PAPER ONLY' },
      { label: 'LOCAL' },
    ],
    status: 'Coming soon',
    slotPlaceholder: 'Drop an MVTrade screenshot',
    art: {
      icon: 'icon-mvtrade.svg',
      iconShape: 'tile',
      title: 'MVTrade',
      line: 'A trading robot that only ever spends pretend money.',
      facts: ['Windows', 'Paper money only', 'Learns every night'],
      // The second cover drawn on `ridge`, and the only repeat in the set.
      // `KeyArtSpec` above says a new app picks one of the five rather than
      // describing a picture of its own; this card sits three along from
      // DevFleet's, so the pair is never side by side in the grid.
      scene: 'ridge',
    },
  },
]

export type ToolCard = {
  index: string
  /** The slug of this tool's own page, in `src/data/appPages.ts`. */
  page: string
  /** The tool's repository in TDG-Org. Same contract as `AppCard.repo`. A
   *  hand-written `href` below outranks discovery the way `download` does. */
  repo?: string
  title: string
  copy: string
  /**
   * The tool's own app icon, as a filename in `public/assets/`. The extension
   * is part of it on purpose: two of these are vector, because we have the
   * geometry that drew them, and Volume Controller's is a raster icon we
   * already shipped to the Chrome Web Store and would rather not redraw.
   */
  icon: string
  /** Tile or glyph. See `AppCard`'s own field for what it decides. */
  iconShape: IconShape
  chips: Chip[]
  cta: string
  href?: string
}

export const TOOLS: ToolCard[] = [
  {
    index: '08',
    page: 'volume-controller',
    // Named for the claim alone: the hand-written `href` below outranks
    // discovery, so the runtime never asks anything about this repo.
    repo: 'Volume-Controller',
    title: 'Volume Controller',
    icon: 'icon-volume-controller.webp',
    iconShape: 'tile',
    copy: 'For the video that is too quiet to hear. Any site up to six times louder, shaped with an equalizer and levelled out, and it remembers what you set for each one.',
    chips: [{ label: 'EXTENSION' }, { label: 'LIVE', hot: true }, { label: 'FREE' }],
    cta: 'Add to Chrome →',
    href: VOLUME_CONTROLLER,
  },
  {
    index: '09',
    page: 'vidhelper',
    repo: 'VidHelper', // expected name — check against the repo when it first deploys
    title: 'VidHelper',
    icon: 'icon-vidhelper.svg',
    iconShape: 'tile',
    copy: 'Keep your own copy of the video you are watching. The extension spots it, a small server on your own machine downloads it, and your library lives there.',
    chips: [{ label: 'EXTENSION' }, { label: 'WIP', hot: true }, { label: 'LOCAL' }],
    cta: 'Coming soon',
  },
  {
    index: '10',
    page: 'n8-tools',
    repo: 'N8-Tools', // expected name — check against the repo when it first deploys
    title: 'N8-Tools',
    icon: 'icon-n8-tools.svg',
    iconShape: 'tile',
    copy: 'Hum a tune and get the notes back as a MIDI file you can keep. There is a tuner and a metronome too, and it will name the key and tempo of whatever you play at it.',
    chips: [{ label: 'BROWSER' }, { label: 'WIP', hot: true }, { label: 'MIC' }],
    cta: 'Coming soon',
  },
]

/** The Games feature: MARANATHA, the game. */
export const MARANATHA = {
  /** Its own page, same as every card under Apps and Tools. */
  page: 'maranatha',
  /**
   * The game's NAME, in the form it is always written in.
   *
   * Every card under Apps and Tools has carried a `title` from the start; this
   * panel did not, because it draws a `heading` instead and had nothing else to
   * name itself to. It does now: a feedback report filed from inside the game
   * says which app it is about, and the name has to survive being derived from
   * an id — `maranatha` prettified is `Maranatha`, and this game is written in
   * capitals everywhere it appears (rule 7 keeps a proper noun in its own
   * form). See `appName` in src/feedback/api.ts.
   */
  title: 'MARANATHA',
  /** Same contract as `AppCard.repo`; expected name, unchecked until the game
   *  first deploys. A Content-tab `href` on the panel outranks discovery. */
  repo: 'MARANATHA',
  /** Drawn by us: the game has no icon of its own. See the file itself. */
  icon: 'icon-maranatha.svg',
  iconShape: 'tile' as IconShape,
  heading: 'A Bible game you walk through.',
  copy: 'A video game that runs in a browser tab. You walk a character through the real events of Scripture in a hand-drawn world, with the World English Bible on screen and read aloud on every beat. No install, no login.',
  note: 'Plays in the browser',
  /**
   * The chip over the card. Uppercase rather than Title Case because the site's
   * chips are 9px mono tags and every one of them is set that way — `LIVE`,
   * `IN DEV`, `EARLY BUILD` — so this is rendered verbatim, not title-cased.
   *
   * It lives here rather than in `Games.tsx` because it is a word a visitor
   * reads (rule 1), and because it and `status` below are about the same card:
   * two claims typed in two files drift, and this pair already had — the
   * component said `IN PLAYTEST` eleven lines above a `status` of `Coming soon`.
   */
  tag: 'IN PLAYTEST',
  /**
   * The chips its own page carries under the title.
   *
   * They used to be typed inside `chipsForPage()` in `appPages.ts`, which said
   * in as many words: "If that panel ever gains chips of its own, read them
   * from there instead." This is that. The Games panel still prints `tag`
   * and `status` in prose rather than a chip row, so these are the page's — and
   * each one restates something the facts row directly below it already says,
   * so there is no second claim to go stale.
   */
  chips: [{ label: 'BROWSER' }, { label: 'IN PLAYTEST', hot: true }, { label: 'FREE' }] as Chip[],
  status: 'Coming soon',
  count: '1 in playtest · 3 more queued',
  // The game's own home screen. It carries the wordmark, so the panel does not
  // overlay a second one.
  shot: {
    slug: 'maranatha',
    widths: [720, 1440],
    alt: 'The MARANATHA home screen at night: the story path winding through Genesis, with Joseph selected and ready to play',
    // A game's screen, cut at 16:9 (720x405 / 1440x810) where every other
    // shot is 16:10. See `Shot.ratio`.
    ratio: 16 / 9,
  } satisfies Shot,
}

/**
 * The queue behind the one playable game, as pills under the Games panel.
 *
 * They are GAMES, or things you would play inside one. The section was called
 * "Building now" until 2.51.0 and these three said "A shared design system",
 * "More Bible tools" and "Utilities for students" — true of the workshop, and
 * read under a heading that says Games they would each have been a promise of
 * a game we are not making. `MARANATHA.count` counts them, so a fourth pill
 * means editing that line too.
 */
export const NEXT_UP = [
  'More Bible stories to walk',
  "Noah's ark, with its story",
  'A second game after this',
] as const
