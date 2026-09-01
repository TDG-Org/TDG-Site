import type { PageLink, PageSection } from './pageBlocks'

/**
 * One page per app, tool and game, as content rather than as components.
 *
 * Everything a reader sees on an app page is in this file. Adding an app is an
 * entry in `APP_PAGES` plus a `page:` on its card in `content.ts`; fixing a line
 * of a guide is one string. `AppPage.tsx` renders whatever is here and knows
 * nothing about any particular app, which is the only way ten pages stay
 * consistent with each other.
 *
 * ## The rules the copy follows
 *
 * **Two sentences at the top decide it.** Somebody who has never heard of the
 * app should know from `lede` alone whether it is for them.
 *
 * **A Guide is for somebody who has not installed it yet.** Every page's first
 * section starts from nothing: what you need, how you get it, what the first
 * five minutes look like. A feature list written for somebody already running
 * the app is a spec sheet, not help.
 *
 * **Only what it does today.** Where something is planned it is in a "coming"
 * section and says so in those words. A README describes what is built and what
 * is intended and does not always mark which; when the code did not settle it,
 * the line was left out.
 *
 * **Closed rows are informative.** Every section carries a `what`, one line
 * saying what is inside it, because a shut page is meant to read as an index.
 *
 * **`facts` is a spec sheet, not a highlight reel.** The strip under the
 * heading answers the four questions somebody asks before they try a thing:
 * what it runs on, what else they have to have, what it costs them or does
 * with their data, and whether it is finished. A row that sells a feature is
 * a row not answering one of those, and the feature is already in the lede,
 * the chips and the guide. Where an app genuinely has nothing to say under a
 * heading — a browser app needs nothing installed — that row is left out
 * rather than filled with "nothing"; `AppPage.tsx` drops empty ones and the
 * strip's last line grows to fill itself, so any count from one up reads
 * right.
 */

export type AppPage = {
  slug: string
  /** The number on its card, so the page and the list agree. */
  index: string
  group: 'Apps' | 'Tools' | 'Game'
  /** Where Back goes when the page was opened cold, from a shared link. */
  backHash: string
  backLabel: string
  title: string
  /** The two sentences that decide whether this is for you. */
  lede: string
  /** One more paragraph, for what the lede had to leave out. */
  intro: string
  /** The at-a-glance strip under the heading. */
  facts: { label: string; value: string }[]
  links?: PageLink[]
  sections: PageSection[]
}

const BIBLE_EDUCATOR: AppPage = {
  slug: 'bible-educator',
  index: '01',
  group: 'Apps',
  backHash: '#apps',
  backLabel: 'Apps',
  title: 'Bible Educator',
  lede: 'Bible Educator is for reading, listening to, studying and taking real notes on Scripture, all in one place. It opens in a browser, installs like an app, and a whole translation can be downloaded to your own device.',
  intro:
    'Sixteen public-domain translations are readable straight away and each one can be downloaded whole to your device. Everything you write, highlight and save stays on your own device.',
  facts: [
    {
      label: 'Where it runs',
      value:
        'Any modern browser, on a phone, tablet or computer. Nothing to install, and it can be added to your home screen or desktop so it opens in its own window',
    },
    {
      label: 'Downloads',
      value: 'A whole translation in one file, stored by the browser you downloaded it in',
    },
    { label: 'Price', value: 'Free, and no account is needed to use it' },
    { label: 'Status', value: 'In development — the current build is live to try' },
  ],
  sections: [
    {
      id: 'guide',
      title: 'Guide',
      what: 'From opening it for the first time to reading a chapter aloud with notes beside it.',
      tag: 'START HERE',
      blocks: [
        {
          kind: 'text',
          text: 'Nothing has to be installed before you can read. Bible Educator is a web app: it opens in a tab and you are on the first chapter. The steps below are the order the app itself expects, and none of them take long.',
        },
        {
          kind: 'steps',
          steps: [
            {
              title: 'Open it and read',
              text: 'It starts on the World English Bible. Pick a book and a chapter, then swipe or use the arrows to turn pages. Your place is remembered, and you can keep more than one reading tab open at once.',
            },
            {
              title: 'Choose your translation',
              text: 'Settings then Bible lists all sixteen. The NIV and NASB are listed too, and are honestly marked as needing a licence we do not have, so their text is never bundled or downloaded.',
            },
            {
              title: 'Download one to your device',
              text: 'Each translation is a one-file install with progress, retry and cancel. After it lands, that version reads from your own device, and its footnotes and cross-references come with it.',
            },
            {
              title: 'Install it as an app',
              text: 'Settings then Install app, or your browser’s own install button. It gets its own window and its own icon and stops looking like a tab.',
            },
            {
              title: 'Tap a verse',
              text: 'A verse opens an action panel: highlight it in any colour, save it with your own note, send it to Notes, bookmark it, play from it, or copy it. Select just a few words to do the same to those.',
            },
            {
              title: 'Play it aloud',
              text: 'The Read Aloud bar plays from where you are, highlights the verse being read, and carries on into the next chapter. Speed, pitch and volume all have exact numbers, not just sliders.',
            },
            {
              title: 'Take it into Notes',
              text: 'Notes keeps a notebook per book plus a General one. Anything you saved in Read is waiting in the Saved and Bookmarked panel, one tap from being on the page.',
            },
          ],
        },
      ],
    },
    {
      id: 'reading',
      title: 'Reading',
      what: 'The Read tab: chapters, bookmarks, highlights, cross-references and reading plans.',
      tag: 'READ',
      blocks: [
        {
          kind: 'features',
          items: [
            {
              name: 'Sixteen translations',
              text: 'Public-domain versions including WEB, KJV, ASV, YLT, Darby, the Clementine Vulgate and the Cherokee New Testament. Read one on demand or download it whole.',
            },
            {
              name: 'Highlights that stay',
              text: 'Colour a whole verse from a quick palette or an exact hex value, or select a few words and colour only those. They are stored on your device and survive a reload.',
            },
            {
              name: 'Footnotes and cross-references',
              text: 'Tap-to-open markers in the text. A cross-reference popover links straight to the passage it names, so following a chain never means typing a reference.',
            },
            {
              name: 'Reading plans',
              text: 'Build as many as you like. Each day gets a date, a time and one or more readings, whole chapters or exact verse ranges. Days you finish fill the progress bar and a day whose time passes unread is marked Missed.',
            },
            {
              name: 'Reminders',
              text: 'A plan can notify you when a day’s reading time arrives, and follow up once an hour later if it is still unread. There is a separate daily reminder for the Verse of the Day.',
            },
            {
              name: 'Search that keeps up',
              text: 'References, words and phrases, with results on every keystroke. Search the version you are in, everything installed, or a set you pick, with an option for whole words only.',
            },
          ],
        },
      ],
    },
    {
      id: 'read-aloud',
      title: 'Read Aloud',
      what: 'Scripture read to you, with the verse lit as it is spoken.',
      tag: 'LISTEN',
      blocks: [
        {
          kind: 'text',
          text: 'Play, pause, skip by verse, and set speed and pitch by slider or by typing the number. The verse being read is highlighted with the next one faintly ahead of it, and playback carries into the next chapter on its own unless you turn that off.',
        },
        {
          kind: 'features',
          items: [
            {
              name: 'Your device’s voices',
              text: 'Always available, run on your own device, and cost nothing. This is what it uses out of the box.',
            },
            {
              name: 'Natural voices',
              text: 'Microsoft Azure AI Speech and Google Cloud Text-to-Speech voices, grouped in the picker under friendly names. They are synthesized through a server route so the keys never reach the browser, and each chapter is cached after its first play.',
            },
            {
              name: 'Tap a verse to play from it',
              text: 'Optional, off by default. With it on, tapping any verse starts reading there instead of opening the action panel.',
            },
          ],
        },
        {
          kind: 'note',
          text: 'The natural voices need the app’s own server route running. On a plain static host it falls back to your device voices, which is the same reading with a plainer voice.',
        },
      ],
    },
    {
      id: 'study',
      title: 'Study',
      what: 'The Read tab with study cards beside it, for the verse you are on.',
      tag: 'STUDY',
      blocks: [
        {
          kind: 'text',
          text: 'Study is the reading tablet you already know on the left, with a stack of cards on the right for whatever verse you tap. Every section produces something for every book, chapter and verse, not just for the famous ones.',
        },
        {
          kind: 'features',
          items: [
            { name: 'What It Means', text: 'The verse put plainly, in the context of the passage around it.' },
            { name: 'Background', text: 'Who is speaking, to whom, where, and what was happening at the time.' },
            {
              name: 'Original Language',
              text: 'The Hebrew or Greek behind the verse’s key words, and what those words carry that English drops.',
            },
            {
              name: 'Cross-References',
              text: 'Classic references, ones matched by theme, and on-device discovery of passages connected by wording.',
            },
            { name: 'Chapter Context', text: 'Where this verse sits in the shape of the chapter.' },
            { name: 'Book Overview', text: 'All sixty-six books, each with its own overview.' },
            { name: 'Translations', text: 'The same verse across every version you have installed, side by side.' },
          ],
        },
        {
          kind: 'text',
          text: 'Sections can be dragged into the order you want and set to open by default, and any one of them expands full screen. Curated in-depth chapter datasets take over wherever they exist; John 1 is the first, at around ten thousand words.',
        },
      ],
    },
    {
      id: 'notes',
      title: 'Notes',
      what: 'Notebooks you can type in, draw in, and drop files into.',
      tag: 'WRITE',
      blocks: [
        {
          kind: 'features',
          items: [
            {
              name: 'A notebook per book',
              text: 'Plus a General one, each with as many pages as you want. It reopens on the book and page you left.',
            },
            {
              name: 'Text boxes',
              text: 'Font, size, colour, alignment and fill. Every object on a page moves, resizes, rotates, curves, layers, duplicates and deletes.',
            },
            {
              name: 'Drawing on layers',
              text: 'Pen, marker and dashed styles with size, colour and an eraser. Smooth writing steadies a shaky stroke as you draw and then refines it into a clean curve; turn it off for raw ink.',
            },
            {
              name: 'Anything you drop on it',
              text: 'Images, video and files, by button or by dragging them onto the page.',
            },
            {
              name: 'Saved and Bookmarked',
              text: 'Everything you kept while reading, each with its own note, one tap from being inserted into the current page or opened back in Read.',
            },
            {
              name: 'Export and import',
              text: 'A whole notebook, a set of pages you pick, or a single page, as one file. Importing on another device adds rather than replaces, and media travels inside the file.',
            },
          ],
        },
      ],
    },
    {
      id: 'appearance',
      title: 'Making it yours',
      what: 'Six themes, your own colours, your own background, and a battery mode.',
      tag: 'THEMES',
      blocks: [
        {
          kind: 'features',
          items: [
            {
              name: 'Six glass themes',
              text: 'Each with its own photographic scene and living particles. Cozy Cabin is the default.',
            },
            {
              name: 'A custom theme',
              text: 'Per-colour pickers with live preview and validated hex entry, so you can build one from scratch.',
            },
            {
              name: 'Your own background',
              text: 'A built-in scene or a picture you upload, with a tint that keeps the text readable over it.',
            },
            {
              name: 'Type you can read',
              text: 'App font and size for the whole interface, with the Bible text keeping its own font, size and line spacing.',
            },
            {
              name: 'Battery Saver',
              text: 'One shared animation driver runs everything that moves, and it steps down how often and at what resolution it works based on the device, the battery and this setting. Nothing gets turned off to save power.',
            },
          ],
        },
      ],
    },
    {
      id: 'data',
      title: 'Your data',
      what: 'Where everything you write is kept, and how to move it.',
      tag: 'PRIVACY',
      blocks: [
        {
          kind: 'text',
          text: 'Notes, highlights, bookmarks, plans, downloaded translations and settings live in your own browser’s storage on that device. There is no account required and nothing is sent anywhere for the app to work.',
        },
        {
          kind: 'facts',
          items: [
            { label: 'Kept on device', value: 'Notes, drawings, highlights, bookmarks, plans, downloads, settings' },
            { label: 'Moving devices', value: 'Settings then Data and storage then Export backup, then import it on the other one' },
            { label: 'Accounts today', value: 'Profiles, friends and sharing work between accounts on one device' },
          ],
        },
        {
          kind: 'note',
          text: 'Browsers keep storage per address, so the app at one address and the same app at another each keep their own library. The backup file is how you carry a setup across.',
        },
      ],
    },
    {
      id: 'coming',
      title: 'Coming',
      what: 'What is written but not finished, said plainly.',
      tag: 'NOT YET',
      blocks: [
        {
          kind: 'features',
          items: [
            {
              name: 'Cloud sync',
              text: 'Accounts, friends and sharing run on this device today. The adapter for a real backend is written and the data is snapshot-ready, but nothing syncs between devices yet.',
              soon: true,
            },
            {
              name: 'Licensed translations',
              text: 'The NIV and NASB are listed and will only ever be served through a properly licensed source. Their text is not bundled and cannot be downloaded.',
              soon: true,
            },
          ],
        },
      ],
    },
  ],
}

const SAY2QUILL: AppPage = {
  slug: 'say2quill',
  index: '02',
  group: 'Apps',
  backHash: '#apps',
  backLabel: 'Apps',
  title: 'Say2Quill',
  lede: 'Say2Quill is dictation for Windows that works everywhere you type. Press one key in any app, speak normally, and clean punctuated text lands in whatever field your cursor is already in.',
  intro:
    'Speech is turned into text by a model file on your own disk, so there is no account, no per-word cost and no limit, and it keeps working with the network unplugged. Notepad, VS Code, Chrome, Discord: it needs nothing from the app you are typing into.',
  facts: [
    { label: 'Where it runs', value: 'Windows 10 and 11, 64-bit' },
    {
      label: 'You will need',
      value:
        'Node.js 18 or newer on your PATH, and a microphone. No Visual Studio, no Python: the speech engine is a prebuilt binary',
    },
    {
      label: 'Disk space',
      value:
        'About 150 MB for the standard speech model, or 490 MB for the accurate one. It downloads on first launch',
    },
    {
      label: 'Speech',
      value: 'On your own machine, through whisper.cpp. No account, no per-word cost, and it works offline',
    },
    { label: 'Status', value: 'In development, no installer published yet' },
  ],
  sections: [
    {
      id: 'guide',
      title: 'Guide',
      what: 'What you need, what the first launch does, and your first sentence of dictation.',
      tag: 'START HERE',
      blocks: [
        {
          kind: 'text',
          text: 'Say2Quill runs from its own folder and needs one thing on the machine beforehand: Node.js 18 or newer. There is no compiler to install and no Python. The speech engine ships as a prebuilt binary, and the first launch fetches it for you.',
        },
        {
          kind: 'note',
          text: 'There is no installer to download yet, so today this is a folder you run rather than an app you install. The steps are the real ones, and when a build is published the first two become a download.',
        },
        {
          kind: 'steps',
          steps: [
            {
              title: 'Install Node.js',
              text: 'Version 18 or newer, from nodejs.org. This is the only thing Say2Quill expects to already be there.',
            },
            {
              title: 'Set up the folder',
              text: 'Run npm install once. Nothing is compiled, so it finishes in about the time it takes to download.',
            },
            {
              title: 'Start it',
              text: 'npm run app launches it straight from source. On the first launch it notices the speech engine is missing and downloads it with a progress bar, so you can skip fetching anything by hand.',
            },
            {
              title: 'Give it a place to live',
              text: 'npm run shortcut makes a real Desktop and Start Menu icon you can pin. Pin that shortcut rather than the running app’s taskbar button, which pins bare Electron and launches the wrong thing.',
            },
            {
              title: 'Pick a Quill Mode',
              text: 'Settings offers Turbo, Fast and Accurate. Fast is the default and downloads on its own. Switching modes downloads the new one and loads it without a restart.',
            },
            {
              title: 'Dictate for the first time',
              text: 'Put your cursor in any text field. Press Ctrl+Shift+Space. The pill appears and starts listening, and words stream into the field as you speak. Press the hotkey again, or say "stop listening", and the text is tidied in place.',
            },
            {
              title: 'Learn the two escape hatches',
              text: 'Esc throws a dictation away before it lands. Ctrl+Alt+Z undoes the last insertion using the target app’s own undo, so it can only ever remove what Say2Quill put there.',
            },
            {
              title: 'Have it there at login',
              text: 'npm run autostart starts it hidden in the tray with Windows, and npm run autostart -- off undoes that.',
            },
          ],
        },
      ],
    },
    {
      id: 'dictating',
      title: 'Dictating',
      what: 'What happens between pressing the key and the words being right.',
      tag: 'CORE',
      blocks: [
        {
          kind: 'features',
          items: [
            {
              name: 'One global hotkey',
              text: 'Ctrl+Shift+Space anywhere in Windows, rebindable, including to a mouse side button. There is an optional second hotkey and a push-to-talk mode.',
            },
            {
              name: 'Live typing',
              text: 'Text appears in the field as you speak and corrects itself in place as more context arrives. If you would rather it appeared all at once, switch to insert-on-stop or copy-to-clipboard.',
            },
            {
              name: 'Undo that cannot overreach',
              text: 'Ctrl+Alt+Z removes the last insertion through the app’s own undo stack, so it can never take text you typed yourself.',
            },
            {
              name: 'It reads the room',
              text: 'In a terminal or a code editor it stops auto-capitalizing and stops adding a trailing full stop, so ls -la stays ls -la.',
            },
            {
              name: 'Formatting worth sending',
              text: 'Sentence casing, smart punctuation, fillers like um and uh stripped out, and accidental repeats collapsed.',
            },
            {
              name: 'Voice commands',
              text: '"New line", "new paragraph", "delete that", "clear all" and "stop listening" are acted on rather than typed.',
            },
          ],
        },
      ],
    },
    {
      id: 'modes',
      title: 'Quill Modes',
      what: 'Three speed and accuracy tiers, and which one to be on.',
      tag: '3 TIERS',
      blocks: [
        {
          kind: 'text',
          text: 'A mode is a speech model. Switching to one you do not have downloads it and loads it without a restart, so trying another costs one click and a wait.',
        },
        {
          kind: 'features',
          items: [
            {
              name: 'Turbo, 75 MB',
              text: 'The fastest feedback while you are still speaking. Best for short notes and quick replies.',
            },
            {
              name: 'Fast, 148 MB',
              text: 'The default, and the one to stay on. The everyday balance between how quickly words appear and how right they are.',
            },
            {
              name: 'Accurate, 488 MB',
              text: 'For long-form writing and unusual vocabulary, where you would rather wait a moment than fix a name.',
            },
          ],
        },
        {
          kind: 'note',
          text: 'The accuracy numbers behind those choices come from a check you can run yourself against real audio, not from an estimate.',
        },
      ],
    },
    {
      id: 'accuracy',
      title: 'Getting your words right',
      what: 'Names, jargon and phrases you say often, taught once.',
      tag: 'PERSONAL',
      blocks: [
        {
          kind: 'features',
          items: [
            {
              name: 'A personal dictionary',
              text: 'Words you add both bias the model and correct the finished transcript, which is why unusual names start landing right instead of nearly right.',
            },
            {
              name: 'It learns from your edits',
              text: 'Fix a transcript in History and it offers, in one click, to add the corrected names and jargon to that dictionary.',
            },
            {
              name: 'Voice macros',
              text: 'Say a trigger, get your saved text. "Sign off" becomes your signature. A number in a trigger matches however you said it, so 133, 1-3-3 and "one thirty three" all fire the same macro.',
            },
            {
              name: 'Verse insertion',
              text: '"Insert John 3 16" drops the verse in from the World English Bible bundled with the app, offline.',
            },
          ],
        },
      ],
    },
    {
      id: 'pill',
      title: 'The pill',
      what: 'The small window that listens, and the 168 ways it can look.',
      tag: 'ON SCREEN',
      blocks: [
        {
          kind: 'text',
          text: 'While you dictate, one small frosted pill sits at the edge of the screen with a waveform driven by your actual voice, a timer and a word count. Drag it anywhere and it stays there, or snap it to any of nine positions from Settings.',
        },
        {
          kind: 'features',
          items: [
            {
              name: 'Four layouts',
              text: 'Waveform for the full readout, Compact for a slim bar, Orb for just the breathing circle, and Tiny Dot for barely there.',
            },
            {
              name: 'Seven themes',
              text: 'Classic, Liquid Glass, Aurora, Neon, Ember, Bubble and Kitty. Liquid Glass samples your actual Windows wallpaper and refracts it at the rim, because a transparent window cannot truly blur the desktop behind it.',
            },
            {
              name: 'Six accents',
              text: 'Violet, Ocean, Mint, Sunset, Rose and Slate, recolouring the orb, its glow and the waveform.',
            },
          ],
        },
        {
          kind: 'note',
          text: 'The three choices are independent, so picking the tiny dot never costs you your colours. Four by seven by six is 168 combinations.',
        },
      ],
    },
    {
      id: 'dashboard',
      title: 'The dashboard',
      what: 'History, stats, the teleprompter, the journal, and every setting.',
      tag: 'THE APP',
      blocks: [
        {
          kind: 'features',
          items: [
            {
              name: 'History',
              text: 'Every session saved on your machine. Search it, filter it, replay the audio, edit the text, or send it into a field again.',
            },
            {
              name: 'Stats',
              text: 'Live words per minute, lifetime words, your personal best, a daily streak and a four-month heatmap.',
            },
            {
              name: 'Teleprompter',
              text: 'Paste a script and read it aloud. The highlight follows your voice word by word instead of scrolling at a fixed speed.',
            },
            {
              name: 'Journal',
              text: 'Say "journal mode" and the session is written into a dated entry instead of into whatever has focus.',
            },
            {
              name: 'Settings',
              text: 'Ten single-purpose cards with live search across them: the pill’s look, formatting rules, hotkeys, sounds and AI.',
            },
            {
              name: 'The built-in guide',
              text: 'The whole app explained in the app, searchable, including the limits stated plainly.',
            },
          ],
        },
      ],
    },
    {
      id: 'ai',
      title: 'Local AI',
      what: 'Two optional buttons that rewrite what you just said, using your own Ollama.',
      tag: 'OPTIONAL',
      blocks: [
        {
          kind: 'text',
          text: 'If you already run Ollama with a qwen model, two buttons appear: Compact, which tightens what you said, and Sound Smarter, which rewrites it more formally. They talk to Ollama on your own machine.',
        },
        {
          kind: 'note',
          text: 'This is an extra, not a dependency. With no Ollama the buttons simply are not there and dictation is unaffected.',
        },
      ],
    },
    {
      id: 'privacy',
      title: 'Privacy',
      what: 'Every connection the app makes, and why none of them carry your voice.',
      tag: 'ON DEVICE',
      blocks: [
        {
          kind: 'text',
          text: 'Transcription happens on your machine. There is no speech API, no telemetry, no account and no usage limit, and your history, settings and macros are one JSON file in your Windows user profile.',
        },
        {
          kind: 'facts',
          items: [
            {
              label: 'First run, or a new mode',
              value: 'Downloads the speech model and engine. One time, and then the files are yours',
            },
            { label: 'First run', value: 'Downloads the Bible text used by verse insertion' },
            { label: 'Only on an AI button', value: 'Your own Ollama, on localhost' },
          ],
        },
        { kind: 'note', text: 'After the first two downloads, the app is fully offline.' },
      ],
    },
  ],
}

const MAKULLVENY: AppPage = {
  slug: 'makullveny',
  index: '03',
  group: 'Apps',
  backHash: '#apps',
  backLabel: 'Apps',
  title: 'Makullveny',
  lede: 'Makullveny is a study desk for students, built so that studying feels like sitting down at a good desk instead of opening twelve browser tabs. Write and draw in your own books, turn a syllabus into dates, run flashcards, and convert class files without leaving the app.',
  intro:
    'It is a desktop app and everything you write stays on your machine. Nine full themes change the whole room, not just an accent colour: background art, paper, type and chrome all move together.',
  facts: [
    {
      label: 'Where it runs',
      value:
        'Windows, macOS on Apple silicon, and Linux. The download page offers the build for the system you are on',
    },
    {
      label: 'You will need',
      value:
        'Nothing else — the installer carries everything. The Windows builds are not signed, so Windows may warn about an unknown publisher',
    },
    { label: 'Your work', value: 'Kept on your own machine by default' },
    { label: 'Status', value: 'Released, and still being added to' },
  ],
  links: [
    { label: 'Download Makullveny', href: 'https://tdg-org.github.io/makullveny-site/#download', external: true },
  ],
  sections: [
    {
      id: 'guide',
      title: 'Guide',
      what: 'Getting it, the first thing to make, and where everything lives.',
      tag: 'START HERE',
      blocks: [
        {
          kind: 'text',
          text: 'Makullveny’s own site owns the download, because that is where the per-platform builds, the current version and the install notes are kept honest. Once it is installed, this is the shape of it.',
        },
        {
          kind: 'steps',
          steps: [
            {
              title: 'Download and install',
              text: 'Get the build for your machine from the Makullveny site. It is not code-signed yet, so Windows will warn about an unknown publisher on first run.',
            },
            {
              title: 'Pick a theme',
              text: 'Nine ship with it, and the whole app changes rather than a highlight colour. Cozy Cabin is the one it opens on.',
            },
            {
              title: 'Open the Library Desk',
              text: 'This is the notes app. Make a bookshelf, then a book, and start on page one. Books, scrolls, journals, card boxes and blueprints all live on a shelf.',
            },
            {
              title: 'Write, then draw',
              text: 'Rich text, drawing, pasted images and text boxes on the same page. The paper stays the focus and the tools sit in the toolbar, the format band and the side rail.',
            },
            {
              title: 'Bring your class in',
              text: 'Import Desk turns a syllabus into a class book. File Workshop converts the files a class hands you. Both open from the dashboard and both can pop out into their own window.',
            },
            {
              title: 'Review what you wrote',
              text: 'Flashcards flip and grade. Study Hall gathers what is due, what is coming, and what you touched recently.',
            },
            {
              title: 'Keep a copy',
              text: 'Settings has Export data file and Import data file. That file is your whole library, which is how it moves to another machine.',
            },
          ],
        },
      ],
    },
    {
      id: 'library',
      title: 'The Library Desk',
      what: 'Your own books, written and drawn in, printed or exported.',
      tag: 'READY',
      blocks: [
        {
          kind: 'features',
          items: [
            {
              name: 'Shelves of your own things',
              text: 'Books, scrolls, journals, card boxes and blueprints, arranged on bookshelves you make.',
            },
            {
              name: 'Pages that take anything',
              text: 'Rich text, freehand drawing, pasted images, text boxes and a choice of paper formats.',
            },
            {
              name: 'Out of the app',
              text: 'Print a page or export it to PDF when something has to leave the desk.',
            },
            {
              name: 'Tools that stay out of the way',
              text: 'The toolbar, the format band and the side rail hold the controls, so the paper is what you are looking at.',
            },
          ],
        },
      ],
    },
    {
      id: 'tools',
      title: 'The study tools',
      what: 'Five small tools and two helpers, each able to pop out into its own window.',
      tag: 'MODULES',
      blocks: [
        {
          kind: 'features',
          items: [
            { name: 'Import Desk', text: 'A syllabus in, a class book out, with the dates where you can see them.' },
            { name: 'Flashcards', text: 'Flip a card, grade yourself, and let what you keep getting wrong come back.' },
            {
              name: 'File Workshop',
              text: 'PDF to images, merge, split, optimize, images to PDF, PNG and JPG both ways, and audio to MP3. It runs locally through a bundled FFmpeg, so nothing is uploaded.',
            },
            { name: 'Calculator', text: 'Scientific, offline, and one click from wherever you are working.' },
            { name: 'Typing Trials', text: 'Typing speed, for when the assignment is due and your hands are slow.' },
            {
              name: 'Study Hall',
              text: 'Everything to catch up on in one place: cards due, syllabus dates and recent notes. Still in beta.',
            },
            {
              name: 'Quick Reference',
              text: 'The things you keep looking up, kept where you can reach them, in the main window or popped out.',
            },
          ],
        },
      ],
    },
    {
      id: 'atmosphere',
      title: 'Themes and atmosphere',
      what: 'Nine rooms to work in, with sound if you want it.',
      tag: 'NINE',
      blocks: [
        {
          kind: 'text',
          text: 'Cozy Cabin, Snow Cabin, Neon Terminal, Cherry Blossom, Rainy Cafe, Garden of Eden, Lantern Study, Moonlit Observatory and Woodland Library. Each one re-dresses the whole app: art, paper, type and chrome.',
        },
        {
          kind: 'features',
          items: [
            { name: 'Ambience', text: 'Room sound that matches the theme, at whatever level you set it to.' },
            { name: 'Lofi radio', text: 'Built in, for the hours where silence is worse than noise.' },
            {
              name: 'Reduced motion',
              text: 'One switch that calms everything that moves, for when the animation is the distraction.',
            },
          ],
        },
      ],
    },
    {
      id: 'data',
      title: 'Your data',
      what: 'Where your library is kept, and how it moves.',
      tag: 'LOCAL',
      blocks: [
        {
          kind: 'text',
          text: 'Bookshelves, books, pages, drawings, covers and settings are written to one file in the app’s own data folder on your machine. Nothing about your notes leaves it.',
        },
        {
          kind: 'note',
          text: 'Importing a data file replaces the library on that device, so the app asks before it does it.',
        },
      ],
    },
    {
      id: 'coming',
      title: 'Still being built',
      what: 'The parts that are early, named rather than dressed up.',
      tag: 'NOT YET',
      blocks: [
        {
          kind: 'features',
          items: [
            {
              name: 'Luke',
              text: 'A quiet helper at the right edge for looking things up, converting units and keeping what you highlight. It is a prototype today, not a finished module.',
              soon: true,
            },
            {
              name: 'Study Hall',
              text: 'In beta. It works and it is useful, and it is still moving under you.',
              soon: true,
            },
            {
              name: 'Sync between devices',
              text: 'Not built. The export and import file is how a library moves for now, and notes are meant to stay local unless you ask for otherwise.',
              soon: true,
            },
          ],
        },
      ],
    },
  ],
}

const DEVFLEET: AppPage = {
  slug: 'devfleet',
  index: '04',
  group: 'Apps',
  backHash: '#apps',
  backLabel: 'Apps',
  title: 'DevFleet',
  lede: 'DevFleet is a Windows control panel for every git repository on your machine. Point it at a folder and each repo becomes a live card showing its branch, how far it has drifted, and what has changed.',
  intro:
    'Opening a project does not take you anywhere. It opens a pane beside the list with its own terminal, its own Claude Code session, its own diff review and its own notebook, and you can have sixteen open at once.',
  facts: [
    { label: 'Where it runs', value: 'Windows, 64-bit' },
    {
      label: 'You will need',
      value:
        'Node.js 20.19 or newer on your PATH, and nothing else. The launcher installs and builds on first run',
    },
    { label: 'Panes at once', value: 'Up to sixteen, stacked or tiled' },
    { label: 'Status', value: 'In development, no installer published yet' },
  ],
  /* No hand-typed link to this app's packs. `AppPage.tsx` derives the way on
     from `STORE_APPS` and draws it as the mirror of the Back control, so an
     app that starts selling gets one without an edit here (rule 17). */
  sections: [
    {
      id: 'guide',
      title: 'Guide',
      what: 'Starting it, pointing it at your code, and what opening a project gives you.',
      tag: 'START HERE',
      blocks: [
        {
          kind: 'text',
          text: 'DevFleet needs Node.js on the machine and nothing else. The launcher does the rest, including installing dependencies and building, the first time it runs.',
        },
        {
          kind: 'steps',
          steps: [
            {
              title: 'Start it',
              text: 'Double-click run-devfleet.bat. It installs, builds and launches inside a hidden console. Everything it did is appended to a log, and a failure raises a dialog pointing at it. run-devfleet.vbs is the same launcher with no window at any point.',
            },
            {
              title: 'Point it at your repositories',
              text: 'Use the Sources button. Sources is a list of folders, each with a name and an on/off switch, so repositories from several places appear together and can be filtered by where they came from.',
            },
            {
              title: 'Read the grid',
              text: 'Every repository under those sources is a card: its branch, how far ahead or behind it is, and whether it is Clean, Notes Only or Code Changes. Sort by last commit, name, last modified, created or size, and the choice survives a restart.',
            },
            {
              title: 'Open one',
              text: 'A project opens as a pane beside the list rather than replacing it. Open another and you have two. The pane has three tabs: Session, Changes and Logbook.',
            },
            {
              title: 'Work in it',
              text: 'Session is a real terminal with Claude Code in it. Changes is the review screen before you commit. Logbook is notes that live in the repository itself.',
            },
            {
              title: 'Tidy the grid',
              text: 'Archive puts a repository out of the grid and out of every fleet action while keeping it searchable. It is stored per machine, never written into your repository and never moves a folder.',
            },
          ],
        },
      ],
    },
    {
      id: 'fleet',
      title: 'The fleet',
      what: 'Every repository as a live card, and the state split that makes the grid readable.',
      tag: 'THE GRID',
      blocks: [
        {
          kind: 'features',
          items: [
            {
              name: 'Live, not polled',
              text: 'Cards update from a filesystem watcher. Nothing sits there asking git the same question every few seconds.',
            },
            {
              name: 'Three states, not "dirty"',
              text: 'Clean, Notes Only when every change is inside DevFleet’s own folder, and Code Changes. Notes you took are not work you forgot to commit, and the grid should not pretend they are.',
            },
            {
              name: 'Several sources at once',
              text: 'Repositories from different folders in one grid, grouped, filterable by origin, each source individually named and switchable.',
            },
            {
              name: 'Search across every Logbook',
              text: 'Fleet-wide. It separates Results, the entries that match, from Matches, the occurrences inside the entry you have open, because conflating those is what makes a search feel broken.',
            },
          ],
        },
      ],
    },
    {
      id: 'workspace',
      title: 'Panes and the workspace',
      what: 'Sixteen projects open at once, as a stack or a mosaic.',
      tag: '16 PANES',
      blocks: [
        {
          kind: 'text',
          text: 'Opening a project is never a navigation. Panes sit beside the list, up to sixteen of them, either stacked or laid out as a mosaic where the focused pane keeps the dominant cell and the rest tile around it.',
        },
        {
          kind: 'note',
          text: 'Two to six panes use hand-drawn layouts. Above six the geometry is computed, and a harness walks every count up to sixteen checking the grid has no holes and no overlaps.',
        },
      ],
    },
    {
      id: 'session',
      title: 'Sessions and terminals',
      what: 'A real terminal per pane, and one Claude Code session shown three ways.',
      tag: 'TERMINAL',
      blocks: [
        {
          kind: 'features',
          items: [
            {
              name: 'A real terminal',
              text: 'One PTY per pane through ConPTY. Not an emulation of one.',
            },
            {
              name: 'Claude Code, three ways',
              text: 'One live session with three skins: a styled transcript feed, the raw terminal for anything the feed cannot show, and chat bubbles. All three read the CLI’s own transcript rather than guessing at terminal bytes.',
            },
            {
              name: 'Stored sessions',
              text: 'Past sessions list from the CLI’s own store and resume in place.',
            },
            {
              name: 'Pop out',
              text: 'Any session moves into its own native window, which holds a split grid of up to sixteen panes. The shell, its process and its scrollback come with it without restarting.',
            },
          ],
        },
      ],
    },
    {
      id: 'changes',
      title: 'Changes',
      what: 'A review screen for what you are about to commit, not a status line.',
      tag: 'REVIEW',
      blocks: [
        {
          kind: 'text',
          text: 'Changed files split into Code and Notes, each with its own added and removed counts and a ratio bar, next to the unified diff with its own syntax colours. The diff column stays shut until you pick a file, and the split between the two is draggable.',
        },
      ],
    },
    {
      id: 'logbook',
      title: 'Logbook',
      what: 'Notes that live in the repository, in notebooks, entries and blocks.',
      tag: 'NOTES',
      blocks: [
        {
          kind: 'features',
          items: [
            {
              name: 'Structure that holds up',
              text: 'Notebooks, then entries, then nested sections, then blocks, with a block type per kind of content: text, code, prompts, links, images, video, checklists and callouts.',
            },
            {
              name: 'It saves itself',
              text: 'Auto-saving through the same verified write path as everything else, so a note is not a thing you can forget to keep.',
            },
            {
              name: 'A delete is a move',
              text: 'Deleting sends an entry to a real trash inside the repository and restoring renames it back, which is the only way the same bytes come back.',
            },
            {
              name: 'Version history',
              text: 'Each entry keeps its own, so a rewrite is not a loss.',
            },
            {
              name: 'In and out',
              text: 'Markdown and JSON import and export, and pasted or dropped media.',
            },
          ],
        },
      ],
    },
    {
      id: 'actions',
      title: 'Tasks, manifests and fleet actions',
      what: 'Running things, and the rule that nothing runs unless you accepted it.',
      tag: 'RUN',
      blocks: [
        {
          kind: 'features',
          items: [
            {
              name: 'Start and Build',
              text: 'Run the commands a project itself declares. Detection only ever proposes a command; it is not runnable until it is in that project’s own manifest.',
            },
            {
              name: 'Manifest and discovery',
              text: 'A generated form over a project’s manifest file. If there is no manifest, DevFleet proposes one from what the repository already says about itself and writes nothing until you accept a previewed diff.',
            },
            {
              name: 'Fleet actions',
              text: 'One action across many repositories, with a dry run first. The summary counts what actually happened per row, so "12 of 12" is never printed when three were skipped, and every skip carries a sentence saying why.',
            },
          ],
        },
      ],
    },
    {
      id: 'themes',
      title: 'Themes',
      what: 'Dark and light as equals, and the five palettes you can buy.',
      tag: 'LOOK',
      blocks: [
        {
          kind: 'text',
          text: 'Dark and light are both first-class, each with a derived accent ramp worked out with contrast maths rather than by eye. The Windows title bar is the app’s own header, and even the system buttons follow the theme.',
        },
        {
          kind: 'text',
          text: 'Five of the palettes are the Theme Pack. Hover one and it takes over the whole app for five seconds so you can see it before deciding. It is bought once in the TDG Store and lives on your account, so it is there on every machine you sign in on, and signing out puts the free palettes back.',
        },
      ],
    },
    {
      id: 'safety',
      title: 'How it treats your repositories',
      what: 'Why a tool that writes into your code has exactly one way of doing it.',
      tag: 'SAFETY',
      blocks: [
        {
          kind: 'text',
          text: 'DevFleet writes into repositories that matter: notes, manifests, ignore rules, project files. A dashboard that shows a wrong number is a nuisance, and a tool that corrupts a file inside your repository is not. That is why these are rules in the code rather than intentions.',
        },
        {
          kind: 'features',
          items: [
            {
              name: 'One write path',
              text: 'Every byte DevFleet puts into a repository goes through one place. No feature writes a file by itself.',
            },
            {
              name: 'Atomic, then checked',
              text: 'It writes to a temp file in the same folder, flushes it and renames. Then it reads the file back and compares, and a write that did not land exactly is reported as a failure rather than as a success.',
            },
            {
              name: 'Your formatting survives',
              text: 'Rewriting a JSON file re-uses that file’s own indentation, line endings and trailing-newline habit. Reformatting your file is a diff you did not ask for.',
            },
            {
              name: 'Reads never write',
              text: 'Repository status runs in a mode where git cannot rewrite its own index, so looking at a repository cannot change it.',
            },
            {
              name: 'Nothing runs that nobody accepted',
              text: 'Commands are looked up by id in the project’s own manifest. Pasted text is delivered as a paste with every trailing newline stripped, so a note you pasted can never submit itself.',
            },
            {
              name: 'Ownership is asked, never asserted',
              text: 'The app asks the account server what you own and cannot claim it locally. A paid feature whose answer lives on the buyer’s machine is a paid feature with a text file for a licence.',
            },
          ],
        },
      ],
    },
  ],
}

const MUSIC_EVERYTHING: AppPage = {
  slug: 'music-everything',
  index: '05',
  group: 'Apps',
  backHash: '#apps',
  backLabel: 'Apps',
  title: 'Music Everything',
  lede: 'Music Everything is a desktop app for learning music by doing it. Play scales and chords, use the piano, sing into the microphone and watch your pitch drawn as a line, then record what you played into a track you can export as MIDI.',
  intro:
    'Every part of it works on its own, so it is as useful for ten minutes of ear training as for building a melody you want in your DAW. A microphone and a MIDI keyboard both help, and neither is required.',
  facts: [
    {
      label: 'Where it runs',
      value:
        'Windows, from a launcher you double-click. The build also produces a per-user installer',
    },
    {
      label: 'You will need',
      value:
        'Node.js to run it from source, and a microphone for pitch tracking. A MIDI keyboard is optional',
    },
    {
      label: 'Exports',
      value: 'Standard MIDI files, format 0 at 480 PPQ, that open in FL Studio and other DAWs',
    },
    { label: 'Status', value: 'In development, no installer published yet' },
  ],
  sections: [
    {
      id: 'guide',
      title: 'Guide',
      what: 'Starting it, the tab to open first, and getting a melody out as MIDI.',
      tag: 'START HERE',
      blocks: [
        {
          kind: 'text',
          text: 'On Windows the app is a double-click: the launcher installs what is missing on first run and starts the app, with no terminal to open. From there the tabs across the top are the app.',
        },
        {
          kind: 'steps',
          steps: [
            {
              title: 'Start it',
              text: 'Double-click Run_App.vbs. If dependencies are missing it installs them first. Normal output and errors go to log files rather than to a console window.',
            },
            {
              title: 'Set the volume once',
              text: 'Master Volume lives in the navbar and sits above every tab’s own volume, so it is the one to reach for.',
            },
            {
              title: 'Play something',
              text: 'Scale Player and Chord Player both play through the instrument you pick. Set the octave range, the tempo and the direction, and let it loop while you follow on the piano.',
            },
            {
              title: 'Pick your microphone',
              text: 'The mic input is chosen once in Settings and shared by every tab that listens.',
            },
            {
              title: 'Sing into the Pitch Tracker',
              text: 'Your pitch is drawn as a line with the exact note and frequency beside it. Load a song file alongside it and you get a second line to compare yourself against.',
            },
            {
              title: 'Record a melody',
              text: 'Open Instrument Replicator from inside the Pitch Tracker tab. It keeps the mic and the piano and swaps the graph for a note timeline that records what you sing as editable notes.',
            },
            {
              title: 'Get it out',
              text: 'Tidy the notes on the grid, press Make Track On Beat if you want it quantized, then export MIDI. Exports are standard format 0 at 480 PPQ with the tempo embedded, so they drop straight into a DAW.',
            },
          ],
        },
      ],
    },
    {
      id: 'players',
      title: 'Scales and chords',
      what: 'The two players, and the playlists you can build out of them.',
      tag: 'PLAY',
      blocks: [
        {
          kind: 'features',
          items: [
            {
              name: 'Scale Player',
              text: 'Common scales over the octave range you choose, ascending, descending or both, with swing or a rhythm you set, looping, and the notes lit on the piano as they sound.',
            },
            {
              name: 'Chord Player',
              text: 'Common chord types and inversions, held as blocks or broken into arpeggios in a direction you pick, with tempo, volume and instrument per chord.',
            },
            {
              name: 'Playlists',
              text: 'Save a run of scales or chords as a list, reorder it by dragging, insert timed gaps, edit several entries at once with Shift-click, and start from any item.',
            },
            {
              name: 'They travel',
              text: 'Playlists export and import as JSON files, so a practice set can be kept, moved or shared.',
            },
          ],
        },
      ],
    },
    {
      id: 'piano',
      title: 'The piano',
      what: 'A playable keyboard that follows the mouse, your keyboard or a MIDI controller.',
      tag: 'KEYS',
      blocks: [
        {
          kind: 'text',
          text: 'Click it, drag across the keys, play it from your computer keyboard, or plug in a MIDI keyboard. Notes released properly even mid-drag, so nothing gets stuck sounding.',
        },
        {
          kind: 'text',
          text: 'It scrolls across multiple octaves with octave markers, has its own volume separate from the master, hides when you want the space back, and plays whichever instrument voice you have selected.',
        },
      ],
    },
    {
      id: 'pitch',
      title: 'Pitch Tracker',
      what: 'Your voice as a line on a graph, next to the song you are trying to match.',
      tag: 'MIC',
      blocks: [
        {
          kind: 'features',
          items: [
            {
              name: 'Two lines, in sync',
              text: 'Your microphone and the loaded song are drawn as separate lines in colours you choose, with exact frequency and note tags.',
            },
            {
              name: 'The song track',
              text: 'Import a local file, rename it in the app, repeat it, and adjust its transpose, octave and tempo. There is a sync offset control for when your mic and the song are not quite lined up.',
            },
            {
              name: 'Key and tempo',
              text: 'Estimated for the loaded song, and overridable when the estimate is wrong, with a reset back to the estimate.',
            },
            {
              name: 'A bar and beat grid',
              text: 'The same grid the Note Track uses, with shared tempo and grid size, so what you see while singing matches what you get when recording.',
            },
            {
              name: 'A piano down the side',
              text: 'Rotated and playable, mirroring the main piano, so you can check a note by ear without leaving the tab.',
            },
          ],
        },
      ],
    },
    {
      id: 'track',
      title: 'The Note Track',
      what: 'Recording what you sing as notes you can edit, then exporting it.',
      tag: 'MIDI',
      blocks: [
        {
          kind: 'text',
          text: 'Instrument Replicator is a mode inside the Pitch Tracker tab rather than a separate one. It reuses the same microphone, the same pitch detection and the same piano, hides the song section to keep the screen about replication, and replaces the live graph with the note timeline.',
        },
        {
          kind: 'features',
          items: [
            {
              name: 'Every note as it happens',
              text: 'Capture Every Note records each detected pitch the moment it appears, which is what makes a vocal line come back with its real timing. A smoothed option is there for when you would rather skip the brief inflections.',
            },
            {
              name: 'Editable notes',
              text: 'Drag a note to move it, drag its edge to make it longer or shorter, double-click to add one, and Delete to remove it.',
            },
            {
              name: 'On the grid',
              text: 'A bar, beat and division grid with snapping and a selectable size, plus one-click quantizing with Make Track On Beat.',
            },
            {
              name: 'Out to a DAW',
              text: 'MIDI export for FL Studio and anything else that reads it, JSON export, and import of both back in.',
            },
          ],
        },
      ],
    },
    {
      id: 'practice',
      title: 'Pitch Practice',
      what: 'Three ear-training games, scored.',
      tag: 'GAMES',
      blocks: [
        {
          kind: 'features',
          items: [
            {
              name: 'Name the note',
              text: 'A note plays and you answer on a large silent piano, with the answer hidden until you ask for it.',
            },
            { name: 'Name the interval', text: 'Two notes, and the distance between them.' },
            {
              name: 'Match the pitch',
              text: 'Sing back what you heard. The prompt instrument is yours to choose and the hold timing is fixed so the game is fair every round.',
            },
          ],
        },
        { kind: 'text', text: 'Scores are tracked as you go and can be reset whenever you want a clean run.' },
      ],
    },
    {
      id: 'sound',
      title: 'Instruments and settings',
      what: 'What it sounds like, and everything it remembers for you.',
      tag: 'SETUP',
      blocks: [
        {
          kind: 'features',
          items: [
            {
              name: 'Six sampled instruments',
              text: 'Grand piano, guitar, electric guitar, bass, violin and voice, with decoded samples cached so a note never has to be built twice. If a sample cannot load, a lighter generated sound keeps playback working.',
            },
            {
              name: 'Themes and colour',
              text: 'Generated local artwork themes, colour pickers that also take a typed colour code, and animation controls including reduced motion.',
            },
            {
              name: 'It remembers almost everything',
              text: 'Window size and position, the last tab, volumes, hotkeys, playlists, the recorded track, mic choice, and your Pitch Tracker preferences, all on your machine.',
            },
            {
              name: 'Settings as a file',
              text: 'Save, Save As, Import and Export the whole snapshot, so a setup can move to another machine.',
            },
            {
              name: 'Files where you expect them',
              text: 'Playlists, settings and track exports open in their own folders under Documents, created automatically the first time they are needed.',
            },
          ],
        },
      ],
    },
    {
      id: 'account',
      title: 'Account',
      what: 'Optional sign-in with a TDG account, and what it does today.',
      tag: 'OPTIONAL',
      blocks: [
        {
          kind: 'text',
          text: 'The Account tab signs you in to the same TDG account the other apps use and shows the membership your subscription carries. Nothing in the app is gated on it today; signing in only adds.',
        },
        {
          kind: 'note',
          text: 'The session is encrypted with the operating system’s own key store before it is written, so you stay signed in across restarts. On a machine with no key store it refuses to save it rather than writing it in the clear, and says so.',
        },
      ],
    },
  ],
}

const VEDITOR: AppPage = {
  slug: 'veditor',
  index: '06',
  group: 'Apps',
  backHash: '#apps',
  backLabel: 'Apps',
  title: 'TDG Veditor',
  lede: 'TDG Veditor is a desktop video editor. Bring footage in, cut it on a timeline, grade it, mix the audio, and export or convert it, with FFmpeg doing the media work underneath.',
  intro:
    'The window is built out of dockable panels, so the editor is arranged the way you work rather than the way it shipped. Nine themes come with it, and a project is a file on your disk.',
  facts: [
    { label: 'Where it runs', value: 'Windows desktop, from a launcher you double-click' },
    { label: 'You will need', value: 'Node.js 20.19 or newer on your PATH' },
    {
      label: 'Media',
      value: 'A licence-clean FFmpeg build, fetched and checksum-verified by the launcher',
    },
    { label: 'Status', value: 'In development, no installer published yet' },
  ],
  /* No hand-typed link to this app's packs. `AppPage.tsx` derives the way on
     from `STORE_APPS` and draws it as the mirror of the Back control, so an
     app that starts selling gets one without an edit here (rule 17). */
  sections: [
    {
      id: 'guide',
      title: 'Guide',
      what: 'The first launch, your first cut, and getting a file out at the end.',
      tag: 'START HERE',
      blocks: [
        {
          kind: 'text',
          text: 'One thing has to be on the machine first: Node.js 20.19 or newer. Everything else, including a licence-clean FFmpeg, is fetched by the launcher the first time you run it.',
        },
        {
          kind: 'steps',
          steps: [
            {
              title: 'Start it',
              text: 'Double-click TDG-Veditor.bat. On a clean machine it installs dependencies, downloads and verifies FFmpeg, builds the app and starts it, so the first run takes a few minutes. Every run after that starts in seconds. TDG-Veditor.vbs is the same with no console window, and is the one to point a desktop shortcut at.',
            },
            {
              title: 'Bring footage in',
              text: 'Drop files onto the Media Bin or pick them. Each one is probed for its real properties, and posters, filmstrips and waveforms are generated so the clip looks like itself in the list.',
            },
            {
              title: 'Watch it',
              text: 'The Source monitor plays the clip you picked, the Program monitor plays your edit. Both have frame-exact stepping, J, K and L shuttle, and in and out marks.',
            },
            {
              title: 'Cut it',
              text: 'Drag clips onto the timeline, trim their edges, split them, and move them between tracks. Undo history is a panel of its own, so a wrong turn is visible rather than remembered.',
            },
            {
              title: 'Make it look right',
              text: 'The Inspector holds whatever is selected: transform, crop, speed, timing, audio and the effect stack. The Colour panel grades it, with scopes beside it if you would rather measure than guess.',
            },
            {
              title: 'Export it',
              text: 'File then Export opens the dialog: format, codecs, encoder, size, rate control, audio and range, with size and time estimates. The job goes into the Render Queue, which you can pause, reorder and retry.',
            },
          ],
        },
      ],
    },
    {
      id: 'workspace',
      title: 'The workspace',
      what: 'Panels that dock, tab, float and stay where you put them.',
      tag: 'LAYOUT',
      blocks: [
        {
          kind: 'text',
          text: 'The app draws its own title bar, menu bar, window controls and context menus, and underneath that everything is a panel. Panels dock into stacks and splits, tear off into floating windows, and the arrangement is saved.',
        },
        {
          kind: 'features',
          items: [
            {
              name: 'Workspace presets',
              text: 'Ready-made arrangements for different jobs, plus layouts you save yourself.',
            },
            {
              name: 'A command palette',
              text: 'One search across commands, panels, settings, effects and sections, so nothing is lost behind a menu.',
            },
            {
              name: 'Shortcuts you own',
              text: 'A shortcut editor, a reference sheet on Ctrl+/, and one resolution feeding the menus, the matcher and the palette so they cannot disagree.',
            },
          ],
        },
      ],
    },
    {
      id: 'media',
      title: 'Bringing footage in',
      what: 'The Media Bin, and what it works out about a file before you cut it.',
      tag: 'IMPORT',
      blocks: [
        {
          kind: 'features',
          items: [
            {
              name: 'A real bin',
              text: 'List and grid views, bins, search, filter, sort, multi-select, and thumbnails that scrub as you hover.',
            },
            {
              name: 'Files understood, not assumed',
              text: 'Each import is probed for its true metadata, corrected for rotation, and flagged when it is variable frame rate or HDR.',
            },
            {
              name: 'Proxies',
              text: 'Lighter versions rendered by the queue so playback stays smooth on footage your machine would otherwise struggle with.',
            },
          ],
        },
      ],
    },
    {
      id: 'timeline',
      title: 'Editing on the timeline',
      what: 'Tracks, clips, markers, regions and the tools that move them.',
      tag: 'EDIT',
      blocks: [
        {
          kind: 'features',
          items: [
            {
              name: 'More than one timeline',
              text: 'Timelines are saved in the project and switch by tab, so a variant does not mean a second project.',
            },
            {
              name: 'Clips that behave',
              text: 'Trim, split, move, group, link, rename, fade in and out, and change speed, including reversed and frozen, with the picture on the clip always showing the frame that will actually play.',
            },
            {
              name: 'Markers and regions',
              text: 'Markers to find your place, and regions as named spans with their own in and out points.',
            },
            {
              name: 'History as a panel',
              text: 'Every edit listed and reversible, rather than an undo you have to count backwards through.',
            },
          ],
        },
      ],
    },
    {
      id: 'look',
      title: 'Effects, colour and titles',
      what: 'Changing how a shot looks, and putting words on it.',
      tag: 'LOOK',
      blocks: [
        {
          kind: 'features',
          items: [
            {
              name: 'Effects and transitions',
              text: 'Applied from the browser or the menu, both through one code path, so what the toast says and what the history step says never depend on which one you used.',
            },
            {
              name: 'Honest previews',
              text: 'Every effect says whether the monitor can show it: drawn live, export-only, or silent for audio effects. An effect you cannot see is indistinguishable from one that is broken, so the app tells you which it is.',
            },
            {
              name: 'Colour grading',
              text: 'Six sections of grading controls with wheels and curves. Every control has a value you can read, a value you can type, a way back to default and a stopwatch for keyframing it.',
            },
            {
              name: 'Scopes',
              text: 'Waveform, parade, vectorscope and histogram, reading the same frame as the grade, with the expensive work off the main thread.',
            },
            {
              name: 'Titles',
              text: 'A text and title editor, with the same component used for creating and for editing so the two cannot drift apart.',
            },
            {
              name: 'Keyframes',
              text: 'An animation editor with a curve view, draggable keyframes and adjustable tangents, a dope sheet beside it, and every value typeable instead of dragged.',
            },
          ],
        },
      ],
    },
    {
      id: 'audio',
      title: 'Audio',
      what: 'A mixer whose meters are measured rather than modelled.',
      tag: 'SOUND',
      blocks: [
        {
          kind: 'text',
          text: 'A channel strip per track plus a master: fader, pan, mute and solo, an insert rack, and metering with peak hold and clipping, plus loudness against a delivery target.',
        },
        {
          kind: 'note',
          text: 'Each strip reads the actual summing bus its track passes through, so a level is already post-fader, post-pan and post-mute because the graph applied all three. Nothing derives a level from what it thinks should be happening.',
        },
      ],
    },
    {
      id: 'export',
      title: 'Export, convert and the queue',
      what: 'Getting files out, one at a time or in batches.',
      tag: 'OUTPUT',
      blocks: [
        {
          kind: 'features',
          items: [
            {
              name: 'The export dialog',
              text: 'Format, codecs, encoder, size, rate control, audio, range, aspect variants and destination, with size and time estimates. An invalid combination is explained rather than quietly clamped into something else.',
            },
            {
              name: 'Encoders it has actually tested',
              text: 'Hardware encoders are tested with a real one-frame encode before being offered, because a build advertises them whether or not the machine has the chip.',
            },
            {
              name: 'The render queue',
              text: 'Batches and their jobs, run one after another, with pause, cancel, retry, reorder and time estimates from measured throughput.',
            },
            {
              name: 'Convert',
              text: 'Drop files in, have them probed, and convert them, with an automatic lossless remux offered whenever the streams can simply be copied.',
            },
            {
              name: 'Export regions',
              text: 'One project into several files. Named spans with their own in and out points, colour, an include switch and optional per-region settings, and the filenames the batch would produce shown before anything runs.',
            },
          ],
        },
      ],
    },
    {
      id: 'themes',
      title: 'Themes and extensions',
      what: 'Nine themes, your own themes, and effect packs.',
      tag: 'MAKE IT YOURS',
      blocks: [
        {
          kind: 'features',
          items: [
            {
              name: 'Nine themes',
              text: 'Signal Dark, Signal Light, Midnight, Graphite, Forest, Ember, Paper, High Contrast and High Contrast Light, switchable from the status bar, with an option to follow the operating system’s light and dark setting and its accent colour.',
            },
            {
              name: 'Themes are data',
              text: 'Drop a JSON file into the app’s themes folder and press Reload. There is no rebuild.',
            },
            {
              name: 'The design system, in the app',
              text: 'A panel showing every token in the live theme, a contrast audit against WCAG, and the whole control gallery.',
            },
            {
              name: 'Effect packs',
              text: 'Plugin packs register their effects and hot reload when their file changes. Deleting a pack removes its effects from the menu immediately, and instances already on clips survive as unavailable rather than vanishing from your edit.',
            },
          ],
        },
      ],
    },
  ],
}

const MVTRADE: AppPage = {
  slug: 'mvtrade',
  index: '07',
  group: 'Apps',
  backHash: '#apps',
  backLabel: 'Apps',
  title: 'MVTrade',
  lede: 'MVTrade is a day-trading robot that runs on your own computer: it watches the market, picks the stocks it wants, decides when to buy and sell, and learns from every trade it makes. It only ever spends paper money — pretend dollars in a practice account at a broker — and real-money trading is locked in the code on purpose.',
  intro:
    'The brain inside is called Jet, and its trading decisions are ordinary deterministic code rather than an AI guessing at your orders. There is an optional AI advisor beside it that reads the news and suggests stocks worth a look, and it can never place, block or change a trade.',
  facts: [
    { label: 'Where it runs', value: 'Windows, 64-bit' },
    {
      label: 'You will need',
      value:
        'Node.js and Python 3.12 or newer on your PATH, and a free Alpaca paper account for the practice money and the market data. Ollama only if you want the AI advisor',
    },
    {
      label: 'The money',
      value:
        'Paper only. Real-money trading is locked in the code, live-money keys are refused, and your keys stay in a file on your own machine',
    },
    { label: 'Status', value: 'In development, no installer published yet' },
  ],
  sections: [
    {
      id: 'guide',
      title: 'Guide',
      what: 'From nothing installed to a robot paper-trading the open by itself.',
      tag: 'START HERE',
      blocks: [
        {
          kind: 'text',
          text: 'Four free things are needed: Node.js, Python, an Alpaca paper account and, if you want the advisor, Ollama. The order below is the one the app itself expects, and it takes about fifteen minutes.',
        },
        {
          kind: 'steps',
          steps: [
            {
              title: 'Install the two runtimes',
              text: 'Node.js from nodejs.org, the LTS installer. Python 3.12 or newer from python.org, and tick “Add python.exe to PATH” on the first screen of that installer — it is easy to miss, and everything later depends on it.',
            },
            {
              title: 'Get the project and start it',
              text: 'Clone the repository, run npm install, then npm start. The app opens on a splash screen, writes its own config file and installs the Python packages it needs by itself. You never open a file by hand.',
            },
            {
              title: 'Open a free Alpaca paper account',
              text: 'Alpaca is the broker: it runs the practice account and streams the market data. Sign up, put the dashboard in Paper mode, and generate an API key. You get a Key ID beginning PK and a secret that is shown once.',
            },
            {
              title: 'Paste the keys in',
              text: 'The Keys tab and the Setup page both take them, in the same fields, and it verifies instantly with no restart. Live-money keys are refused on purpose — only paper keys are accepted.',
            },
            {
              title: 'Turn the two order switches on',
              text: 'Out of the box the app can watch but not order: both switches ship off. Allow paper orders, allow automated strategy orders, save, then restart, because they are read at startup. Skip this and you will see candidates flowing and no orders at all.',
            },
            {
              title: 'Wake the advisor, if you want one',
              text: 'Install Ollama and pull a model, then set the AI provider to ollama and restart. Installing it is not enough by itself — it is a settings switch, not an install check. The badge in the header says which of ready, checking, down and disabled it is. Trading works fine without it.',
            },
            {
              title: 'Go hands-off',
              text: 'Three settings between them open the app before the market, start trading at the bell, and close it again after the close, waking the machine from sleep if it has to. The kill switch, the holidays and the market clock win over every one of them.',
            },
          ],
        },
        {
          kind: 'note',
          text: 'Tape is old Wall Street slang for the live feed of prices and trades, from the ticker-tape machines of the 1900s, and the app uses the word throughout. Live tape is fresh data. Stale tape is old data, and Jet refuses to trade on it.',
        },
      ],
    },
    {
      id: 'brain',
      title: 'The brain',
      what: 'Jet, the three traders inside it, and the four stations a trade passes through.',
      tag: 'JET',
      blocks: [
        {
          kind: 'text',
          text: 'Jet is the whole brain, and three traders share one engine inside it. The Day Trader takes fast trades on small hot stocks and is in and out the same day; the Swinger holds for days; the Long-term trader buys quality and sits on it. Only the Day Trader is active. The other two watch and learn.',
        },
        {
          kind: 'features',
          items: [
            {
              name: 'Four stations and a referee',
              text: 'Eyes watch the live market data, Scout picks the candidates, Nerve decides size and timing, and Hands place the order. A risk referee watches all four and can veto anything, always.',
            },
            {
              name: 'The decisions are code',
              text: 'Nothing an AI generated ever becomes an order. The trading path is deterministic and testable, which is what makes a bad day reproducible rather than mysterious.',
            },
            {
              name: 'Gideon, the advisor',
              text: 'An optional AI that runs alongside Jet rather than inside it. It reads news and suggests stocks worth a look, and it can never place, block or change a trade.',
            },
            {
              name: 'Learning is always on',
              text: 'It cannot be switched off. Results from practice simulations are treated as homework and never as profit, so a good day in a simulation is never counted as money.',
            },
          ],
        },
      ],
    },
    {
      id: 'safety',
      title: 'The safety net',
      what: 'Why a day with no trades on it is usually a guard doing its job.',
      tag: 'GUARDS',
      blocks: [
        {
          kind: 'text',
          text: 'The guards are the point of the app rather than an obstacle in front of it. A robot that trades badly is worse than one that does not trade at all, so each of these is a rule in the code rather than an intention.',
        },
        {
          kind: 'features',
          items: [
            {
              name: 'Real money is locked',
              text: 'A triple lock in the code only ever allows the paper account, and live-money keys are refused at the point they are pasted in.',
            },
            {
              name: 'The exit sits at the broker',
              text: 'Every position gets a safety stop placed at Alpaca. If the app crashes or the machine dies, that exit order is still waiting on the broker’s servers.',
            },
            {
              name: 'A daily loss circuit',
              text: 'If a day goes badly wrong past a set amount, Jet stops entering and flattens what is open. The day is over, and tomorrow it resets.',
            },
            {
              name: 'Gears, not knobs',
              text: 'Aggressive at the open, careful at midday, exits only near the close. The gear changes by itself, so there is no manual risk dial to fat-finger.',
            },
          ],
        },
        {
          kind: 'note',
          text: 'A quiet day is usually a choppy midday market, spreads too wide to be worth crossing, or a blind data feed. The dashboard names the exact reason rather than leaving you to guess at it.',
        },
      ],
    },
    {
      id: 'dashboard',
      title: 'The dashboard',
      what: 'What is on screen while it runs, and where the reasons are written down.',
      tag: 'ON SCREEN',
      blocks: [
        {
          kind: 'features',
          items: [
            {
              name: 'The money cards',
              text: 'The paper account’s real equity, the budget, the state of the market and the state of the risk, at the top where they can be read at a glance.',
            },
            {
              name: 'Live performance',
              text: 'Your equity as a candlestick chart at any timeframe, with zoom, so a session reads as a shape rather than as a number that moved.',
            },
            {
              name: 'Stocks in play',
              text: 'What the Eyes are watching right now, each one with the reason it is being watched.',
            },
            {
              name: 'The Logger',
              text: 'The play-by-play of every decision: what Jet saw, what it wanted, and what it did or refused, with the reason. Filters for orders, watches, blocks and issues, copy buttons, and a pop-out window that can stay on top. Errors are kept as issue rows, so one cannot be dismissed and lost.',
            },
            {
              name: 'Guide and Setup',
              text: 'The whole manual is inside the app, written from zero, and the Setup page checks readiness with live ticks rather than telling you it should be fine.',
            },
          ],
        },
      ],
    },
    {
      id: 'not-trading',
      title: 'When it will not trade',
      what: 'The four things that account for almost every quiet day.',
      tag: 'ANSWERS',
      blocks: [
        {
          kind: 'qa',
          items: [
            {
              q: 'Candidates are flowing but nothing is ordered',
              a: 'The two order switches are still off. Turn both on in the Keys tab, save, and restart — they are read at startup, so saving alone does not arm them.',
            },
            {
              q: 'The data feed has gone blind',
              a: 'The stream needs two Python packages, msgpack and websockets. The app installs them itself, and where something has blocked that, installing them by hand fixes it.',
            },
            {
              q: 'It cannot save anything',
              a: 'On Windows, Controlled Folder Access protects the Documents folder by default and silently blocks the app from writing its data. Allow both electron.exe and python.exe through it, or keep the project outside Documents.',
            },
            {
              q: 'Two machines, one account',
              a: 'Alpaca allows one live data connection. Two computers signed in with the same keys fight over it and both go blind, so run one at a time.',
            },
          ],
        },
        {
          kind: 'note',
          text: 'The dashboard diagnoses all four by itself and names the blocker in a message and an issue row, so none of this is something you have to remember.',
        },
      ],
    },
  ],
}

const VOLUME_CONTROLLER_PAGE: AppPage = {
  slug: 'volume-controller',
  index: '08',
  group: 'Tools',
  backHash: '#tools',
  backLabel: 'Tools',
  title: 'Volume Controller',
  lede: 'Volume Controller is a browser extension for turning any site up or down, from silent to six times louder than normal. It sits on top of the page rather than in it, so a site’s own volume slider keeps working exactly as before.',
  intro:
    'Beyond volume it carries the sound tools a quiet video usually sends you looking for: loudness levelling, an equalizer, delay and reverb, mono and balance. Every one of them can be set globally or for one site.',
  facts: [
    {
      label: 'Where it runs',
      value:
        'Desktop Chrome, Edge, Brave and Opera, and Firefox where Manifest V3 is supported. There is nothing to install beyond the extension',
    },
    { label: 'Range', value: '0% to 600%, with a soft limiter above 100%' },
    {
      label: 'What it asks for',
      value: 'Storage and scripting, on every site, because the controls sit on top of the page',
    },
    { label: 'Price', value: 'Free' },
    { label: 'Data', value: 'No accounts, no analytics, no servers. Settings stay in your browser' },
  ],
  links: [
    {
      label: 'Add to Chrome',
      href: 'https://chromewebstore.google.com/detail/volume-controller/lamahdjkmgpfpcoccinmipdonifnadcf',
      external: true,
    },
  ],
  sections: [
    {
      id: 'guide',
      title: 'Guide',
      what: 'Installing it, and the two sliders that do most of the work.',
      tag: 'START HERE',
      blocks: [
        {
          kind: 'steps',
          steps: [
            {
              title: 'Install it',
              text: 'Add it from the Chrome Web Store. It asks for storage and scripting plus access to the pages you use it on, and deliberately does not ask for tabs, so it never has permission to read your browsing history.',
            },
            {
              title: 'Pin it',
              text: 'Pin it to the toolbar. The icon shows the current tab’s volume, blank at 100%, M when muted and OFF while the extension is paused.',
            },
            {
              title: 'Set a level for everywhere',
              text: 'Open the popup on the Home tab and move Global Volume. Every site without its own saved level follows it.',
            },
            {
              title: 'Set a level for this site',
              text: 'The Sites tab pins the site you are on at the top, as a row you can edit. Change it there and it is remembered for next time.',
            },
            {
              title: 'Click the page once for boost',
              text: 'Going above 100% needs one interaction on the page first, because browsers only allow audio processing to start after one. Turning volume down works right away.',
            },
            {
              title: 'Reach for the Sound tab when it is not just loudness',
              text: 'Normalize for a film that whispers then shouts, the equalizer for a voice buried in music, mono or balance if one ear needs the whole picture.',
            },
          ],
        },
      ],
    },
    {
      id: 'volume',
      title: 'Volume',
      what: 'Global and per-site levels, presets, mute, and how the sliders behave.',
      tag: 'CORE',
      blocks: [
        {
          kind: 'features',
          items: [
            {
              name: 'Global, then per site',
              text: 'Global Volume is the default for every site that has not been given its own. A site level overrides it and is remembered.',
            },
            {
              name: 'Down to a section of a site',
              text: 'A level can be saved for a whole domain or for one part of it, and the most specific match wins.',
            },
            {
              name: 'Six quick presets',
              text: 'One tap each, editable in place, and shared by both Quick Set rows.',
            },
            {
              name: 'Mute as a flag',
              text: 'Muting keeps your saved level for when you come back, rather than dragging the slider to zero.',
            },
            {
              name: 'Sliders that land where you aim',
              text: 'Most of the travel is spent on 0 to 100%, so every whole number there is reachable. Hold Shift for 1% a pixel anywhere, or use the arrow keys for 1% a press.',
            },
            {
              name: 'A saved sites list',
              text: 'With instant search. Rows save as you drag them, with no separate save step.',
            },
          ],
        },
      ],
    },
    {
      id: 'sound',
      title: 'Sound',
      what: 'Levelling, equalizer, delay and reverb, auto-pan, mono and balance.',
      tag: 'DSP',
      blocks: [
        {
          kind: 'features',
          items: [
            {
              name: 'Normalize volume',
              text: 'Holds quiet dialogue and loud action at one steady level, in Gentle, Balanced or Max, with a live meter showing how hard it is working. All three settle at the same loudness and differ in how tightly they hold it.',
            },
            {
              name: 'A 2 to 10 band equalizer',
              text: 'Drag nodes from 20 Hz to 20 kHz or type exact bands. Flat, Voice, Music, Movie and Night are built in, and your own presets can be saved and updated in place.',
            },
            {
              name: 'Delay and reverb',
              text: 'A touch of echo and room, off at zero, and only allocated when you use them so ordinary volume control never pays for them.',
            },
            {
              name: 'Auto-Pan',
              text: 'A slow sweep of the stereo image left and right, with your own width and speed, set in seconds per sweep.',
            },
            {
              name: 'Mono and balance',
              text: 'Combine left and right, or move the image between them, with a value box and a snap to centre.',
            },
            {
              name: 'Per-site sound, not just per-site volume',
              text: 'Any site can take its own copy of the loudness mode, the equalizer, delay and reverb and auto-pan, frozen from the global settings, so changing a global afterwards never silently changes that site. Clear it and the site follows global again.',
            },
            {
              name: 'A and B compare',
              text: 'One button hands the page back untouched so you can hear it without the extension, then switch back. It is live only and never saved.',
            },
          ],
        },
      ],
    },
    {
      id: 'settings',
      title: 'Settings, shortcuts and backup',
      what: 'Keyboard control, the look of the popup, and getting your setup out.',
      tag: 'SETUP',
      blocks: [
        {
          kind: 'features',
          items: [
            {
              name: 'Keyboard shortcuts',
              text: 'Pause and resume the whole extension, mute and unmute the current site, and open the popup. Volume up and down are bindable, and the lot can be switched off.',
            },
            {
              name: 'Five tabs',
              text: 'Home, Sound, Sites, Settings and Help, with a site gauge on Home, light, dark and system modes, an accent picker chosen for contrast, and reduced-motion support.',
            },
            {
              name: 'A status line that names the fix',
              text: 'Home says what the engine is actually doing, and when something is in the way it says which thing: the page has not been clicked yet, the browser blocks this site, the tab is older than the install.',
            },
            {
              name: 'Backup and reset',
              text: 'Export every setting as a file and restore it, clear saved sites while keeping your globals, or reset everything. Copy Diagnostics captures what the engine sees on the current tab.',
            },
            {
              name: 'A guide inside the popup',
              text: 'The Help tab explains every tab and control as collapsible topics.',
            },
          ],
        },
      ],
    },
    {
      id: 'limits',
      title: 'What it cannot do',
      what: 'The four cases where no extension can help, said up front.',
      tag: 'HONEST',
      blocks: [
        {
          kind: 'features',
          items: [
            {
              name: 'Protected video',
              text: 'Netflix, Disney+ and Prime Video audio is DRM protected and cannot be touched by any extension. It passes through unchanged.',
            },
            {
              name: 'Boost needs a click first',
              text: 'Above 100% requires one interaction on the page, and some cross-origin media blocks the processing route entirely. Turning volume down still works everywhere.',
            },
            {
              name: 'Closed players',
              text: 'A player that builds its media inside a closed shadow root is unreachable by any Chrome extension. Open ones are handled, and the status line says which you are looking at rather than suggesting a reload that cannot help.',
            },
            {
              name: 'Local files',
              text: 'Pages served from your own disk need "Allow access to file URLs" switched on in the extension’s details page.',
            },
          ],
        },
      ],
    },
    {
      id: 'privacy',
      title: 'Privacy',
      what: 'What it collects, which is nothing.',
      tag: 'NONE',
      blocks: [
        {
          kind: 'text',
          text: 'No accounts, no analytics, no ads and no remote servers. Your settings live in your own browser’s storage. It is a standard Manifest V3 extension with no remote scripts and the smallest permission set it can work with.',
        },
      ],
    },
  ],
}

const VIDHELPER: AppPage = {
  slug: 'vidhelper',
  index: '09',
  group: 'Tools',
  backHash: '#tools',
  backLabel: 'Tools',
  title: 'VidHelper',
  lede: 'VidHelper saves videos you are watching onto your own machine. A browser extension spots the video on the page, a small server running on your computer downloads it in good quality, and a library page keeps everything you have saved.',
  intro:
    'Nothing leaves your machine except the download itself. The server only listens on 127.0.0.1, which is another way of saying it is not reachable from anywhere but the computer it is running on.',
  facts: [
    {
      label: 'Where it runs',
      value:
        'Your own machine: a small server plus an Edge or Chrome extension. The instructions are written for Windows 11',
    },
    {
      label: 'You will need',
      value:
        'Node.js 18 or newer, yt-dlp and FFmpeg on your PATH. aria2 is optional and only makes downloads faster',
    },
    { label: 'Quality', value: 'Up to 1080p, video and audio merged into one mp4' },
    {
      label: 'Where it listens',
      value: '127.0.0.1 on port 47821, which is reachable only from the computer it is running on',
    },
    { label: 'Status', value: 'Work in progress' },
  ],
  sections: [
    {
      id: 'guide',
      title: 'Guide',
      what: 'The three tools to install, starting the server, and loading the extension.',
      tag: 'START HERE',
      blocks: [
        {
          kind: 'text',
          text: 'VidHelper is two halves that find each other: a backend you start, and an extension you load into your browser. The backend is what does the downloading, so it has to be running before the button in the browser does anything.',
        },
        {
          kind: 'steps',
          steps: [
            {
              title: 'Install the download tools, once',
              text: 'yt-dlp, FFmpeg and optionally aria2, through winget with their full package ids. Node.js 18 or newer as well. Restart the terminal afterwards so they are all on the PATH.',
            },
            {
              title: 'Start the backend',
              text: 'npm install the first time, then npm start. It serves the Library on 127.0.0.1 and opens it for you.',
            },
            {
              title: 'Load the extension',
              text: 'Open your browser’s extensions page, turn on developer mode, choose Load unpacked, and select the extension folder.',
            },
            {
              title: 'Download something',
              text: 'Go to a page with a video. A floating download button slides out at the right edge, and on YouTube there is an inline one next to the like button. With the backend off, the button says to start VidHelper first.',
            },
            {
              title: 'Watch it come in',
              text: 'Progress streams back to the page while it downloads. When it is done it appears in the Library, where it plays in the browser.',
            },
            {
              title: 'When a site changes',
              text: 'Press Update yt-dlp in the Library. YouTube and X change what they serve regularly, and that button is usually the whole fix.',
            },
          ],
        },
      ],
    },
    {
      id: 'library',
      title: 'The Library',
      what: 'Where saved videos live and play.',
      tag: 'YOURS',
      blocks: [
        {
          kind: 'text',
          text: 'The Library is a page served by the backend with a player in it. Everything you have downloaded is listed there with its file kept on your disk, alongside a manifest of what was saved.',
        },
      ],
    },
    {
      id: 'sites',
      title: 'Sites and sign-in',
      what: 'What works out of the box, and what needs your browser session.',
      tag: 'ACCESS',
      blocks: [
        {
          kind: 'features',
          items: [
            {
              name: 'YouTube',
              text: 'A floating button and a button in the like row, both of which reappear on reload.',
            },
            {
              name: 'Most other sites',
              text: 'Media sniffing spots the video on pages that do not have a dedicated button.',
            },
            {
              name: 'Age-restricted and private posts',
              text: 'Set the Library’s "sign-in with" option to the browser you are signed in on, and open the exact post page rather than the feed. Chrome and Edge have to be closed for their cookies to be readable; Firefox works while open.',
            },
          ],
        },
      ],
    },
    {
      id: 'limits',
      title: 'What it will not do',
      what: 'The line it does not cross, and why.',
      tag: 'HONEST',
      blocks: [
        {
          kind: 'text',
          text: 'Protected video is impossible by design. Netflix and paid or rented films are DRM and cannot be downloaded by this or by anything else, and the app says so rather than failing quietly.',
        },
        {
          kind: 'note',
          text: 'It never runs a file it downloaded, and it makes no network calls beyond the download itself. Only save what you have the right to save.',
        },
      ],
    },
    {
      id: 'coming',
      title: 'Coming',
      what: 'The one thing planned that is not built.',
      tag: 'NOT YET',
      blocks: [
        {
          kind: 'features',
          items: [
            {
              name: 'A desktop app',
              text: 'The backend and the library are deliberately shaped so they can be wrapped in a desktop app with no rewrite. That wrapper is not built yet, so today it is a server you start and an extension you load.',
              soon: true,
            },
          ],
        },
      ],
    },
  ],
}

const N8_TOOLS: AppPage = {
  slug: 'n8-tools',
  index: '10',
  group: 'Tools',
  backHash: '#tools',
  backLabel: 'Tools',
  title: 'N8-Tools',
  lede: 'N8-Tools is a workspace for music and sound that runs in your browser off your own machine. Hum a melody and get notes and a MIDI file, pull the text out of a video, tune an instrument, or find a song’s key and tempo.',
  intro:
    'It is one page with a tab per tool, and the tools share what they can: one microphone choice, one set of saved data. Everything happens locally, and the pieces that need extra software say so and stay out of the way when it is missing.',
  facts: [
    { label: 'Where it runs', value: 'Your browser, served from your own machine on 127.0.0.1' },
    { label: 'You will need', value: 'Node.js, and a microphone for anything that listens' },
    {
      label: 'Optional extras',
      value:
        'Ollama for the AI parts, and Python for Whisper transcription when a video has no captions',
    },
    { label: 'Status', value: 'Work in progress' },
  ],
  sections: [
    {
      id: 'guide',
      title: 'Guide',
      what: 'Starting it, allowing the microphone, and turning a hum into a MIDI file.',
      tag: 'START HERE',
      blocks: [
        {
          kind: 'steps',
          steps: [
            {
              title: 'Start it',
              text: 'npm install the first time, then npm start. It opens in your browser on a fixed local address. If that port is busy, use the one printed in the terminal.',
            },
            {
              title: 'Allow the microphone',
              text: 'Everything that listens needs it, and a local address counts as a secure one, so the browser will ask normally.',
            },
            {
              title: 'Pick a capture profile',
              text: 'In the Melody Reader, choose humming, singing or whistling. It changes what the detector expects and is the difference between a clean line and a mess.',
            },
            {
              title: 'Record something',
              text: 'Watch the live level meter while you go. Notes appear on a scrollable piano roll with real timing rather than as a guess at a rhythm.',
            },
            {
              title: 'Play it back and tidy it',
              text: 'Choose one of fourteen playback sounds, let it suggest chords that fit, and auto-tune the notes to the key you were singing in if you drifted.',
            },
            {
              title: 'Export MIDI',
              text: 'Out it goes as a file, ready for whatever you write music in.',
            },
          ],
        },
      ],
    },
    {
      id: 'melody',
      title: 'Melody reader',
      what: 'Humming, singing or whistling turned into notes with real timing.',
      tag: 'MUSIC',
      blocks: [
        {
          kind: 'features',
          items: [
            {
              name: 'Capture profiles',
              text: 'Humming, singing and whistling are detected differently, so telling it which one you are doing is the first accuracy win.',
            },
            {
              name: 'A piano roll you can read',
              text: 'A live level meter while you record and a scrollable chart of what it heard afterwards.',
            },
            {
              name: 'Fourteen playback sounds',
              text: 'From grand piano and organ through pads, choir, strings, synths, guitar, bells, music box, marimba and flute, with reverb, stereo and a limiter so nothing spikes.',
            },
            {
              name: 'Chords that fit',
              text: 'Suggestions built from the melody you just recorded.',
            },
            { name: 'Auto-tune to a key', text: 'Optionally snap every note to the key you were singing in.' },
            { name: 'MIDI export', text: 'The whole melody as a file.' },
          ],
        },
      ],
    },
    {
      id: 'transcripts',
      title: 'Transcripts',
      what: 'A YouTube link in, copyable text out.',
      tag: 'TEXT',
      blocks: [
        {
          kind: 'features',
          items: [
            {
              name: 'Captions first',
              text: 'Paste a link and get text laid out to be copied, with a language dropdown and an option to strip bracketed labels like [Music].',
            },
            {
              name: 'History',
              text: 'Past transcripts are kept, with restore and delete.',
            },
            {
              name: 'No captions?',
              text: 'It can fall back to transcribing the audio locally with Whisper, or transcribe an audio file you upload. That needs Python installed, and if it is not there the app says so plainly and stays usable.',
            },
            {
              name: 'Summaries',
              text: 'Optional, through the local AI tab, which needs Ollama running.',
            },
          ],
        },
      ],
    },
    {
      id: 'ear',
      title: 'Tuner, metronome and analysis',
      what: 'The small tools you reach for while practising.',
      tag: 'PRACTICE',
      blocks: [
        {
          kind: 'features',
          items: [
            {
              name: 'Tuner',
              text: 'A live cents needle that goes green when you are in tune.',
            },
            {
              name: 'Metronome',
              text: 'Tap tempo, adjustable beats per bar, and visual beats as well as audible ones.',
            },
            {
              name: 'Key and BPM detection',
              text: 'Point it at an audio file and it estimates both in the browser. They are estimates, and it says so.',
            },
            {
              name: 'Voice note listener',
              text: 'Shows the note you are singing right now and tracks how it changes.',
            },
            {
              name: 'Song idea generator',
              text: 'Give it a key and it produces a chord progression with a melody and bass line built on it.',
            },
          ],
        },
      ],
    },
    {
      id: 'remix',
      title: 'Lofi and remix',
      what: 'Turning a track you have into a different mood.',
      tag: 'AUDIO',
      blocks: [
        {
          kind: 'features',
          items: [
            {
              name: 'Into Lofi',
              text: 'Three vibes, classic, tape-warm and sleepy, played in the browser and downloadable as MP3.',
            },
            {
              name: 'Remix and alter',
              text: 'Slowed with reverb, sped up, nightcore, 8D rotating stereo, lofi, and darker or brighter pitch shifts.',
            },
          ],
        },
        {
          kind: 'note',
          text: 'The darker and brighter shifts are pitch and colour effects, not real reharmonization. Turning a finished mixed song from major to minor properly is not solved here, and calling those buttons that would be a lie.',
        },
      ],
    },
    {
      id: 'extras',
      title: 'The optional extras',
      what: 'Two larger pieces that need software you may not have.',
      tag: 'OPTIONAL',
      blocks: [
        {
          kind: 'features',
          items: [
            {
              name: 'n8 ai',
              text: 'A plain chat interface to an Ollama model running on your machine. Without Ollama the tab simply cannot answer, and nothing else is affected.',
            },
            {
              name: 'The second brain',
              text: 'A local knowledge base that takes in notes and files, indexes them, and answers questions from them with the sources attached. It needs Ollama for the embeddings, and it is kept entirely separate from the app’s ordinary saved data.',
            },
            {
              name: 'Gospel Game',
              text: 'A keyboard-controlled 2D pixel-art story and free-roam game set after the rapture, with difficulty from Easy through Super Hard.',
            },
          ],
        },
      ],
    },
  ],
}

const MARANATHA_PAGE: AppPage = {
  slug: 'maranatha',
  index: '11',
  group: 'Game',
  backHash: '#building',
  backLabel: 'Building',
  title: 'MARANATHA',
  lede: 'MARANATHA is a Bible game you walk through. You move a character around a hand-drawn world, walk up to people and talk with them, and live the events as Scripture tells them, with the verse on screen and read aloud on every beat.',
  intro:
    'It opens in a browser with nothing to install, no account and no cost, and your progress is saved in your own browser. The first story is Joseph, and its opening scene is playable end to end.',
  facts: [
    {
      label: 'Where it runs',
      value:
        'In a browser, on a phone or a computer. It draws in 3D, so it needs WebGL, and it lowers its own resolution to stay smooth on the device you are on',
    },
    { label: 'Controls', value: 'Keyboard on a computer, an on-screen joystick on a phone' },
    { label: 'Price', value: 'Free. No install, no login, no ads, no tracking' },
    {
      label: 'Scripture',
      value: 'The World English Bible, public domain, checked verse by verse',
    },
    { label: 'Status', value: 'In playtest. One scene playable, more being written' },
  ],
  sections: [
    {
      id: 'guide',
      title: 'Guide',
      what: 'Choosing a chapter, moving around, and talking to people.',
      tag: 'START HERE',
      blocks: [
        {
          kind: 'steps',
          steps: [
            {
              title: 'Open it',
              text: 'It runs in a browser tab. There is nothing to download and nothing to sign into.',
            },
            {
              title: 'Choose where to go',
              text: 'The home screen is the whole Bible as one road at night, with the chapters along it. Pick one that is ready to play.',
            },
            {
              title: 'Walk',
              text: 'WASD or the arrow keys, or the on-screen joystick on a phone. Hold Shift to run, or push the joystick all the way.',
            },
            {
              title: 'Talk',
              text: 'Walk up to somebody and press E, or tap the Talk prompt. Enter, Space or a click moves the conversation on, and every line names who is speaking.',
            },
            {
              title: 'Follow the objective',
              text: 'A short line on screen says what you are doing, so being lost is never part of it.',
            },
            {
              title: 'Set it up to suit you',
              text: 'The settings button holds volume, graphics and frame rate. The home button leaves a story and asks first.',
            },
          ],
        },
      ],
    },
    {
      id: 'controls',
      title: 'Controls',
      what: 'Every key and every tap, in one list.',
      tag: 'REFERENCE',
      blocks: [
        {
          kind: 'facts',
          items: [
            { label: 'Move', value: 'WASD or arrow keys, or the on-screen joystick' },
            { label: 'Run', value: 'Hold Shift, or push the joystick fully' },
            { label: 'Talk', value: 'Walk close and press E, or tap the Talk prompt' },
            { label: 'Next line', value: 'Enter, Space or click, or tap' },
            { label: 'Pause', value: 'Esc, or the pause button' },
            { label: 'Leave a story', value: 'The home button, which asks to confirm' },
            { label: 'Settings', value: 'The settings button: volume, graphics, frame rate' },
          ],
        },
      ],
    },
    {
      id: 'map',
      title: 'The story map',
      what: 'The home screen, and the sky that follows your clock.',
      tag: 'HOME',
      blocks: [
        {
          kind: 'text',
          text: 'The home screen is the whole Bible drawn as one road at night, thirty-five chapters winding from Creation toward the end of the story. Its sky follows the time on your own clock, from a green pre-dawn horizon through overcast, dusk and a deep blue night, and you can pin it to one of those in settings.',
        },
        {
          kind: 'note',
          text: 'While you are choosing where to go, the game is not rendering anything in 3D and has not even downloaded the 3D engine. That happens when you enter a story.',
        },
      ],
    },
    {
      id: 'playable',
      title: 'What you can play',
      what: 'One scene, end to end, and one place you can walk.',
      tag: 'TODAY',
      blocks: [
        {
          kind: 'features',
          items: [
            {
              name: 'Joseph, scene one',
              text: 'The Coat and the Dreams, from Genesis 37, playable start to finish: herd the flock back to the pen, receive the coat, live both dreams by night, and face your brothers afterwards. It opens on a flash-forward to the pit and does not flinch.',
            },
            {
              name: 'Noah’s ark',
              text: 'A place rather than a chapter. The ark is built at the size Genesis gives, which is 450 by 75 by 45 feet, and you can walk up the ramp and through all three decks. Its story is not written yet.',
            },
            {
              name: 'The rest of the road',
              text: 'Creation, the Fall, Babel, Abraham, Moses and on toward Revelation are drawn on the map and are not playable yet.',
              soon: true,
            },
          ],
        },
      ],
    },
    {
      id: 'scripture',
      title: 'How Scripture is used',
      what: 'Which translation, how it is checked, and how you hear it.',
      tag: 'THE TEXT',
      blocks: [
        {
          kind: 'text',
          text: 'The text is the World English Bible, which is public domain, and it is checked verse by verse against the canonical text rather than typed in from memory. It appears on screen at each beat and is narrated in one voice.',
        },
        {
          kind: 'text',
          text: 'The stories are played as Scripture tells them. Where the game fills in a room, a road or a face, it is filling in around the text rather than changing it.',
        },
      ],
    },
    {
      id: 'built',
      title: 'How it is made',
      what: 'Why it runs on a phone, and what it does not collect.',
      tag: 'UNDER IT',
      blocks: [
        {
          kind: 'features',
          items: [
            {
              name: 'A world drawn in code',
              text: 'Every sky, hill, tree, tent, coat pattern and wheat sheaf is generated rather than painted by hand, which is why there is so little to download.',
            },
            {
              name: 'It adapts to your device',
              text: 'Resolution follows what the device can manage, everything repeated is drawn in one pass, and a frame pacer locks to your display so a laptop stays quiet.',
            },
            {
              name: 'Real cinema',
              text: 'Authored camera shots, letterboxed cutscenes, engraved title cards and verse cards. Nothing cuts harshly.',
            },
            {
              name: 'Nothing collected',
              text: 'No accounts, no ads, no tracking. Progress is saved in your own browser and stays there.',
            },
          ],
        },
      ],
    },
  ],
}

export const APP_PAGES: AppPage[] = [
  BIBLE_EDUCATOR,
  SAY2QUILL,
  MAKULLVENY,
  DEVFLEET,
  MUSIC_EVERYTHING,
  VEDITOR,
  MVTRADE,
  VOLUME_CONTROLLER_PAGE,
  VIDHELPER,
  N8_TOOLS,
  MARANATHA_PAGE,
]

/*
 * There is deliberately NO list of slugs exported from here.
 *
 * The router builds its own from the CARDS (`APP_SLUGS` in `src/lib/route.ts`)
 * and explains at length why it must never import this file: this is a large
 * lazy chunk and only a visitor who opens a page should pay to download it. A
 * slug list exported here would be dead the moment it was written, and the one
 * that used to live at this spot carried the comment "every slug the router
 * will accept" — which was never true of it.
 */

export const pageForSlug = (slug: string): AppPage | undefined =>
  APP_PAGES.find((page) => page.slug === slug)

/*
 * The screenshot, the icon and the chips a page shows are NOT here, and used
 * to be.
 *
 * All three read a page's own CARD — one alt text, one set of widths, one
 * crop, one icon file, one chip row, so a page and its card can never end up
 * describing the same app differently. That is still exactly what they do; the
 * only thing that changed is which cards they read. The Developer console's
 * Content tab can rename a card, swap its cover or hide it outright, and a
 * page that went on reading the built-in card would print the words the site
 * stopped saying an hour ago.
 *
 * So they live in `src/content/resolve.ts` now — `shotFor`, `iconFor` and
 * `chipsFor` — beside the overlay they have to read. `AppPage.tsx` calls them
 * with the live document. This file stays what it always was: the built-in
 * copy, and the fallback for everything the overlay does not mention.
 */
