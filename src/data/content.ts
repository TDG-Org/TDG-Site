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
  // Last, and a ROUTE rather than a section anchor, because the Store is its own page.
  // The slash is what keeps '#/store' from colliding with '#story', which is
  // one letter away and would otherwise be a coin flip for whoever matched first.
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
    chapter: 'CH. 01 · 2017',
    phase: 'THEN',
    numeral: '01',
    title: 'Gaming',
    copy: 'One clan tag, late-night lobbies, and a name that stuck.',
  },
  {
    chapter: 'CH. 02',
    phase: 'NEXT',
    numeral: '02',
    title: 'Game dev',
    copy: "Playing other people's worlds got old, so we started making our own.",
  },
  {
    chapter: 'CH. 03',
    phase: 'THE TURN',
    numeral: '03',
    title: 'Found the Truth',
    copy: 'We met Jesus, and TDG became The Disciples of God.',
    turn: true,
  },
  {
    chapter: 'CH. 04',
    phase: 'CRAFT',
    numeral: '04',
    title: 'Software',
    copy: 'Bible tools, student apps, and little utilities we use every day.',
  },
  {
    chapter: 'CH. 05',
    phase: 'NOW',
    numeral: '05',
    title: 'Still building',
    copy: 'Nights and weekends, building things we want to last.',
  },
]

export type AppCard = {
  id: string
  index: string
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
    title: 'Bible Educator',
    copy: 'Read, listen, study, highlight and take rich notes on Scripture. 16 public-domain translations, and you can download any of them so the whole thing works offline.',
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
    title: 'Makullveny',
    copy: 'A calm desk for studying. Write and draw in your own books, import a syllabus, convert class files, run flashcards. Nine full themes, and none of it leaves your machine.',
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
    title: 'Music Everything',
    copy: 'Learn music by doing. Scales, chords, a playable piano, live pitch tracking, and a note track you can export straight to MIDI.',
    chips: [{ label: 'DESKTOP' }, { label: 'IN DEV', hot: true }, { label: 'MIDI + MIC' }],
    status: 'Coming soon',
    slotPlaceholder: 'Drop a Music Everything screenshot',
  },
  {
    id: 'app-veditor',
    index: '06',
    title: 'TDG Veditor',
    copy: 'A desktop video editor with a timeline, effects, colour and audio, plus an export and format-conversion pipeline you set up the way you want it.',
    chips: [{ label: 'DESKTOP' }, { label: 'IN DEV', hot: true }, { label: 'FFMPEG' }],
    status: 'Coming soon',
    slotPlaceholder: 'Drop a TDG Veditor screenshot',
  },
]

export type ToolCard = {
  index: string
  title: string
  copy: string
  chips: { label: string; hot?: boolean }[]
  cta: string
  href?: string
}

export const TOOLS: ToolCard[] = [
  {
    index: '07',
    title: 'Volume Controller',
    copy: 'Global and per-site volume from 0 to 600%, with a 2–10 band EQ, loudness normalize, and per-site memory.',
    chips: [{ label: 'EXTENSION' }, { label: 'LIVE', hot: true }, { label: 'FREE' }],
    cta: 'Add to Chrome →',
    href: VOLUME_CONTROLLER,
  },
  {
    index: '08',
    title: 'VidHelper',
    copy: 'A local video downloader. The extension spots the video, a small backend on 127.0.0.1 grabs it and serves your own library.',
    chips: [{ label: 'EXTENSION' }, { label: 'WIP', hot: true }, { label: 'LOCAL' }],
    cta: 'Coming soon',
  },
  {
    index: '09',
    title: 'N8-Tools',
    copy: 'A browser workspace for music and sound. Transcripts, a melody reader that exports MIDI, tuner, metronome, key and BPM detection.',
    chips: [{ label: 'BROWSER' }, { label: 'WIP', hot: true }, { label: 'MIC' }],
    cta: 'Coming soon',
  },
]

/** The Building-now feature: MARANATHA. */
export const MARANATHA = {
  heading: 'A calm walk through Scripture.',
  copy: 'Walk the real events of Scripture in a hand-drawn world, with the World English Bible on screen and read aloud on every beat. No install, no login.',
  note: 'Runs in the browser',
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
