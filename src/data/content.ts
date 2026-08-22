export const GITHUB_ORG = 'https://github.com/TDG-Org'
export const CONTACT = 'https://natemci.com'
export const VOLUME_CONTROLLER =
  'https://chromewebstore.google.com/detail/volume-controller/lamahdjkmgpfpcoccinmipdonifnadcf'

export const NAV_LINKS = [
  { href: '#story', label: 'Story' },
  { href: '#apps', label: 'Apps' },
  { href: '#tools', label: 'Tools' },
  { href: '#building', label: 'Building' },
  { href: '#faith', label: 'Faith' },
  // The last two are ROUTES rather than section anchors, because each is its
  // own page. The slash is what keeps '#/store' from colliding with '#story',
  // which is one letter away and would otherwise be a coin flip for whoever
  // matched first; every route since carries it for the same reason.
  { href: '#/about', label: 'About' },
  { href: '#/store', label: 'Store' },
] as const

/** A real screenshot, served as AVIF with a WebP fallback at 1x and 2x. */
export type Shot = {
  slug: string
  widths: [number, number]
  alt: string
  /** object-position, for crops where the subject is not centred */
  position?: string
}

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
    copy: 'Everything since has come from the same question: what do we wish existed? Scripture you can read with the internet off. A game you walk the Bible through. A desk for a student drowning in browser tabs. The small utilities came after, because our own days kept needing them.',
  },
  {
    chapter: 'CH. 07',
    phase: 'NOW',
    numeral: '07',
    title: 'Still building',
    copy: 'The trials came, and we are still growing through them. Nights and weekends, on things we want to outlast us.',
  },
]

export type AppCard = {
  id: string
  index: string
  /**
   * The slug of this app's own page, in `src/data/appPages.ts`. It is what
   * turns the card into a link, so a card without one goes nowhere.
   */
  page: string
  title: string
  copy: string
  chips: { label: string; hot?: boolean }[]
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
}

export const APPS: AppCard[] = [
  {
    id: 'app-bible',
    index: '01',
    page: 'bible-educator',
    title: 'Bible Educator',
    copy: 'Open a passage, have it read aloud while you follow, and mark it up as you go. Download any of the 16 translations once and the whole thing keeps working with the internet off.',
    chips: [
      { label: 'PWA' },
      { label: 'IN DEV', hot: true },
      { label: 'FREE · NO ACCOUNT' },
      { label: 'OFFLINE' },
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
    title: 'Say2Quill',
    copy: 'Press one key anywhere, speak, and clean formatted text lands in whatever field has focus. The speech runs on your own machine, so there is no cloud and no account.',
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
  },
  {
    id: 'app-makullveny',
    index: '03',
    page: 'makullveny',
    title: 'Makullveny',
    copy: 'A calm desk for studying. Write and draw straight into books of your own, hand it a syllabus and get the dates back, and drill the hard parts with flashcards. None of it leaves your machine.',
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
  },
  {
    id: 'app-devfleet',
    index: '04',
    page: 'devfleet',
    title: 'DevFleet',
    copy: 'Point it at a folder and every git repo becomes a live card. Open up to sixteen panes, each with its own terminal, diff review and notebook.',
    chips: [{ label: 'WINDOWS' }, { label: 'IN DEV', hot: true }, { label: 'GIT' }, { label: 'ELECTRON' }],
    status: 'Coming soon',
    slotPlaceholder: 'Drop a DevFleet screenshot',
    shot: {
      slug: 'devfleet',
      widths: [560, 1120],
      alt: 'The DevFleet workspace: a project list on the left and an open project pane on the right',
      position: 'left top',
    },
  },
  {
    id: 'app-music',
    index: '05',
    page: 'music-everything',
    title: 'Music Everything',
    copy: 'Learn music by playing it, not by reading about it. Scales and chords on a piano you can play, your own singing drawn back at you as pitch, and a note track you can export as MIDI.',
    chips: [{ label: 'DESKTOP' }, { label: 'IN DEV', hot: true }, { label: 'MIDI + MIC' }],
    status: 'Coming soon',
    slotPlaceholder: 'Drop a Music Everything screenshot',
  },
  {
    id: 'app-veditor',
    index: '06',
    page: 'veditor',
    title: 'TDG Veditor',
    copy: 'A desktop video editor: cut on a timeline, grade the colour, mix the audio, then hand it an export pipeline you set up yourself instead of one somebody else chose for you.',
    chips: [{ label: 'DESKTOP' }, { label: 'IN DEV', hot: true }, { label: 'FFMPEG' }],
    status: 'Coming soon',
    slotPlaceholder: 'Drop a TDG Veditor screenshot',
  },
]

export type ToolCard = {
  index: string
  /** The slug of this tool's own page, in `src/data/appPages.ts`. */
  page: string
  title: string
  copy: string
  /**
   * The tool's own app icon, as a filename in `public/assets/`. The extension
   * is part of it on purpose: two of these are vector, because we have the
   * geometry that drew them, and Volume Controller's is a raster icon we
   * already shipped to the Chrome Web Store and would rather not redraw.
   */
  icon: string
  chips: { label: string; hot?: boolean }[]
  cta: string
  href?: string
}

export const TOOLS: ToolCard[] = [
  {
    index: '07',
    page: 'volume-controller',
    title: 'Volume Controller',
    icon: 'icon-volume-controller.webp',
    copy: 'For the video that is too quiet to hear. Any site up to six times louder, shaped with an equalizer and levelled out, and it remembers what you set for each one.',
    chips: [{ label: 'EXTENSION' }, { label: 'LIVE', hot: true }, { label: 'FREE' }],
    cta: 'Add to Chrome →',
    href: VOLUME_CONTROLLER,
  },
  {
    index: '08',
    page: 'vidhelper',
    title: 'VidHelper',
    icon: 'icon-vidhelper.svg',
    copy: 'Keep your own copy of the video you are watching. The extension spots it, a small server on your own machine downloads it, and your library lives there.',
    chips: [{ label: 'EXTENSION' }, { label: 'WIP', hot: true }, { label: 'LOCAL' }],
    cta: 'Coming soon',
  },
  {
    index: '09',
    page: 'n8-tools',
    title: 'N8-Tools',
    icon: 'icon-n8-tools.svg',
    copy: 'Hum a tune and get the notes back as a MIDI file you can keep. There is a tuner and a metronome too, and it will name the key and tempo of whatever you play at it.',
    chips: [{ label: 'BROWSER' }, { label: 'WIP', hot: true }, { label: 'MIC' }],
    cta: 'Coming soon',
  },
]

/** The Building-now feature: MARANATHA, the game. */
export const MARANATHA = {
  /** Its own page, same as every card under Apps and Tools. */
  page: 'maranatha',
  heading: 'A Bible game you walk through.',
  copy: 'A video game that runs in a browser tab. You walk a character through the real events of Scripture in a hand-drawn world, with the World English Bible on screen and read aloud on every beat. No install, no login.',
  note: 'Plays in the browser',
  status: 'Coming soon',
  count: '1 in playtest · 3 more queued',
  // The game's own home screen. It carries the wordmark, so the panel does not
  // overlay a second one.
  shot: {
    slug: 'maranatha',
    widths: [720, 1440],
    alt: 'The MARANATHA home screen at night: the story path winding through Genesis, with Joseph selected and ready to play',
  } satisfies Shot,
}

export const NEXT_UP = [
  'A shared design system',
  'More Bible tools',
  'Utilities for students',
] as const
