import type { PageLink, PageSection } from './pageBlocks'
import { CONTACT, GITHUB_ORG } from './content'

/**
 * The About page, as content.
 *
 * ## What this page is for, and what it is not
 *
 * The home page already tells the story as five chapters on a timeline, and the
 * Faith section already says the one thing it needs to. This is the longer
 * answer for somebody who read those and wanted more, so it picks up where they
 * stop rather than saying them again.
 *
 * The app pages carry the real detail, so the run through the apps here is a
 * signpost: a line each, and a link. The Store page carries the prices, so the
 * money answers point at it instead of quoting numbers that would then have two
 * homes and one of them wrong.
 *
 * ## The Q&A rule
 *
 * Every answer here is checkable against something in this repo or on this
 * site, and where we do not have an answer the answer says so. A page of
 * reassurances nobody could verify is worth less than one honest "we have not
 * built that yet", because the second one can be believed.
 *
 * The facts behind these came from `src/data/store.ts` (what is sold, and that
 * Stripe holds the payment), `supabase/README.md` and `src/auth/` (what an
 * account is and what it stores), `src/dev/README.md` (what a developer can
 * see and do, and what deleting an account means), and each app's own repo.
 */

export type AboutPage = {
  title: string
  /** The two sentences somebody who has never heard of us reads first. */
  lede: string
  /** One more paragraph, for what the lede had to leave out. */
  intro: string
  facts: { label: string; value: string }[]
  links: PageLink[]
  sections: PageSection[]
}

export const ABOUT: AboutPage = {
  title: 'About TDG',
  lede: 'TDG is two brothers, Nate and Luke, who build software on nights and weekends. This is the longer answer to who we are, why we build what we build, and the questions worth asking before you install something from two people you have never met.',
  intro:
    'The home page tells the story in five chapters. This page picks up where that one stops, and it tries to answer the awkward questions rather than the comfortable ones.',
  facts: [
    { label: 'Who', value: 'Nate and Luke, two brothers' },
    { label: 'What TDG is', value: 'Not a company. No funding, no staff, no support desk' },
    { label: 'When we build', value: 'Nights, weekends, and the hours in between' },
    { label: 'Where to write', value: 'natemci.com, or an issue on one of the public repos' },
  ],
  links: [
    { label: 'Our GitHub', href: GITHUB_ORG, external: true },
    { label: 'Get in touch', href: CONTACT, external: true },
  ],
  sections: [
    {
      id: 'who',
      title: 'Who is behind this',
      what: 'Two brothers, no company behind them, and what that changes for you.',
      tag: 'US',
      blocks: [
        {
          kind: 'text',
          text: 'TDG is two of us. There is no company here: no funding, nobody employed, and no support desk. When you write in, the person who answers is one of the two who wrote the code.',
        },
        {
          kind: 'text',
          text: 'We build around ordinary jobs, in the evenings and at weekends. That is the honest reason things take as long as they do, and it is why you will not find a release date on this site. We would rather say an app has been in development for a year than name a day we are going to miss.',
        },
        {
          kind: 'text',
          text: 'How TDG got its name, and what happened to the two of us in the middle of it, is the timeline on the home page. What that timeline does not have room for is the part that matters here: none of this is a bet on getting big. Every one of these apps started as something one of us wanted to exist, and if nobody else ever used them we would still be running them ourselves.',
        },
      ],
    },
    {
      id: 'why',
      title: 'Why we build what we build',
      what: 'Where the apps come from, and the rules we hold ourselves to.',
      tag: 'WHY',
      blocks: [
        {
          kind: 'text',
          text: 'Almost everything here started because one of us needed it and what already existed was wrong. DevFleet exists because sixteen repositories on one machine is a real problem with no good answer. Say2Quill exists because dictation that sends your voice to somebody else’s server is not a thing you want running all day. Volume Controller exists because a video that is too quiet is too quiet.',
        },
        {
          kind: 'text',
          text: 'The rest is Scripture and study. Bible Educator and MARANATHA are there because we wanted them to exist, and Makullveny and Music Everything because learning something is easier at a desk that is not twelve browser tabs.',
        },
        {
          kind: 'features',
          items: [
            {
              name: 'Your work stays on your machine',
              text: 'Notes, books, dictation history, project logbooks: those are files where you put them. Nothing uploads them, because there is nowhere for them to go. We did not build a server to hold your things.',
            },
            {
              name: 'It keeps working when the connection does not',
              text: 'Anything we build to run on your own machine runs offline. Bible Educator reads a translation you have downloaded with the network unplugged, and Say2Quill transcribes with it unplugged too.',
            },
            {
              name: 'An account is not the price of entry',
              text: 'Every app runs signed out. Signing in adds the things that genuinely need an account and nothing else.',
            },
            {
              name: 'No advertising, in any of it',
              text: 'Nothing we ship carries an ad, and nothing we ship is paid for by showing you something.',
            },
            {
              name: 'We say what is not built',
              text: 'Where a feature is planned rather than finished, the page for that app says it is coming, in that word. Looking smaller than we would like is better than being caught describing something that does not exist.',
            },
          ],
        },
      ],
    },
    {
      id: 'apps',
      title: 'Which one is for you',
      what: 'Every app, tool and the game in a line each, with a link to its own page.',
      tag: 'SIGNPOST',
      blocks: [
        {
          kind: 'text',
          text: 'Each of these has a page of its own with a guide and the whole feature list. This is only enough to recognise the one you came for.',
        },
        {
          kind: 'signpost',
          items: [
            {
              name: 'Bible Educator',
              text: 'Reading, listening to and studying Scripture, with notes you can write and draw in. Sixteen translations, and it works offline once you download one.',
              href: '#/app/bible-educator',
            },
            {
              name: 'Say2Quill',
              text: 'Talking instead of typing, in any Windows app. Your voice is turned into text on your own machine and never leaves it.',
              href: '#/app/say2quill',
            },
            {
              name: 'Makullveny',
              text: 'A desk for studying: your own books to write and draw in, a syllabus turned into dates, flashcards, and a converter for class files.',
              href: '#/app/makullveny',
            },
            {
              name: 'DevFleet',
              text: 'Every git repository on your machine as a live card, and up to sixteen of them open side by side, each with its own terminal and notes.',
              href: '#/app/devfleet',
            },
            {
              name: 'Music Everything',
              text: 'Learning music by playing it: scales, chords, a piano, and your own singing drawn as pitch and recorded into a MIDI file.',
              href: '#/app/music-everything',
            },
            {
              name: 'TDG Veditor',
              text: 'A desktop video editor with a timeline, colour, audio and an export pipeline you set up yourself.',
              href: '#/app/veditor',
            },
            {
              name: 'Volume Controller',
              text: 'Any website louder or quieter than it wants to be, up to six times, with an equalizer and loudness levelling. Live on the Chrome Web Store.',
              href: '#/app/volume-controller',
            },
            {
              name: 'VidHelper',
              text: 'Keeping your own copy of a video you are watching, downloaded by a small server running on your machine.',
              href: '#/app/vidhelper',
            },
            {
              name: 'N8-Tools',
              text: 'Humming a tune and getting notes and a MIDI file back, plus transcripts, a tuner, and key and tempo detection.',
              href: '#/app/n8-tools',
            },
            {
              name: 'MARANATHA',
              text: 'Walking through the events of Scripture in a browser, with the verse on screen and read aloud. No install and no login.',
              href: '#/app/maranatha',
            },
          ],
        },
      ],
    },
    {
      id: 'money',
      title: 'What it costs',
      what: 'Which things are free, what the paid extras are, and who handles the money.',
      tag: 'MONEY',
      blocks: [
        {
          kind: 'qa',
          items: [
            {
              q: 'Is any of this actually free?',
              a: 'Most of it, and not as a trial that runs out. Bible Educator, MARANATHA, Say2Quill, Music Everything, N8-Tools, VidHelper and Volume Controller are free, and nothing inside them is held back for a payment. Some of them have a Support Us button, which is a donation and never a requirement. DevFleet and TDG Veditor are free as well: the app itself is not the thing being sold, and each has optional packs beside it. Makullveny is the one with paid tiers of its own.',
            },
            {
              q: 'What do the paid parts cost?',
              a: 'The Store page lists everything we sell with its price beside it, so it is written down once rather than in two places that can disagree. Those packs are one-time payments and they attach to your account rather than to a machine. Makullveny is the exception worth naming: it has a subscription of its own, and its own site is where that is explained.',
            },
            {
              q: 'Do you see my card details?',
              a: 'No. Payment happens on Stripe’s own checkout pages, and this site holds no payment keys at all, so it could not charge you if it tried. What comes back to us is that an account paid for a pack. The Store page has the rest of it.',
            },
            {
              q: 'What is the money for?',
              a: 'The two of us, and the running costs. There is no third person to pay and no investor to answer to, which is the reason we can leave the apps themselves free and sell the extras instead of putting a meter on the thing you came for.',
            },
          ],
        },
      ],
    },
    {
      id: 'data',
      title: 'Accounts and your data',
      what: 'Whether you need one, what we keep, and how to be rid of it.',
      tag: 'DATA',
      blocks: [
        {
          kind: 'qa',
          items: [
            {
              q: 'Do I need an account?',
              a: 'Not to use the apps. Bible Educator, MARANATHA and Volume Controller never require one, and every desktop app opens and works fully signed out. An account is for the things that cannot work without one: a pack you bought following you to your next machine, and Makullveny knowing which tier you are on.',
            },
            {
              q: 'What do you store about me?',
              a: 'If you never sign in, nothing. This site has no analytics, and the only thing it keeps in your browser is whether you chose light or dark. If you do sign in: the email you signed up with, the username and display name you chose, a bio if you write one, which subscription tier you hold, which packs you have bought, and the record of the payments behind them. That is the whole list.',
            },
            {
              q: 'Where does the stuff I make actually live?',
              a: 'On your own machine. Bible Educator keeps its notes and highlights in your browser’s storage, Makullveny keeps your library in a file in its own data folder, Say2Quill keeps your history in one file in your user profile, and DevFleet writes its notes inside your own repository. None of it uploads anywhere, and each of those apps can export what it holds to a file you keep.',
            },
            {
              q: 'Can I delete my account?',
              a: 'Yes, and not with a button yet. There is no self-serve delete on this site today: write to us and we will remove the account and everything attached to it by hand. When there is a button, this answer changes.',
            },
            {
              q: 'Is anything third party involved?',
              a: 'Four, and this is all of them. Stripe takes the payments. Supabase hosts the accounts. GitHub Pages serves this site. And the site loads its fonts from Google, so Google sees that one request when a page opens.',
            },
          ],
        },
      ],
    },
    {
      id: 'trust',
      title: 'Installing something from us',
      what: 'Unsigned installers, and what happens to your things if we stop.',
      tag: 'TRUST',
      blocks: [
        {
          kind: 'qa',
          items: [
            {
              q: 'Is it safe to install something that is not signed?',
              a: 'Our Windows installers are not code-signed, so Windows will warn you about an unknown publisher, and we are not going to tell you to click through a security warning. A signing certificate costs money every year that we have not spent yet. What we can say is where a real download comes from: this site, or the app’s own site linked from its page here. If it came from anywhere else, it did not come from us.',
            },
            {
              q: 'What happens to my things if you two stop building?',
              a: 'We have not written a plan for that, and we would rather say so than invent one. What is true today: the apps you install keep your work on your machine, so they keep running there whether or not we are still around, and every one of them can export what it holds. The two that run in a browser are the exception, because they need a page that is still being served. The part we could not promise is the account server, because sign-in and the packs attached to it depend on something we pay for. If that were ever going to stop, telling people first is the least we would owe, and that intention is all there is right now.',
            },
            {
              q: 'Who can see my account from your side?',
              a: 'We can. There is a developer console on this site that the two of us can reach, and it can see an account’s identity, its tier and what it has bought, and can suspend or delete it. It cannot see your notes, your books or anything else on your machine, because none of that reaches us in the first place. Every action it takes is written to a log next to the change.',
            },
          ],
        },
      ],
    },
    {
      id: 'faith',
      title: 'Faith, and reaching us',
      what: 'What the name changes in the software, and where to write.',
      tag: 'CONTACT',
      blocks: [
        {
          kind: 'qa',
          items: [
            {
              q: 'Why is it Christian software?',
              a: 'Because we are Christians, and TDG is what we go by. In practice it means two things and not a third. Some of what we build is about Scripture directly, which is Bible Educator and MARANATHA. Everything else is just software: a volume slider has no theology and a video editor does not preach at you. Where the faith actually shows up is in how the things are sold and what we are willing to claim about them.',
            },
            {
              q: 'Do I have to be a Christian to use any of this?',
              a: 'No, and nothing here asks or checks. Turn a website’s volume down with the extension and never think about us again. That is a perfectly good outcome.',
            },
            {
              q: 'How do I reach you?',
              a: 'natemci.com is the contact page and it reaches both of us. If it is a bug in something with a public repository, an issue on GitHub is better, because it stays where the fix will be. We read everything that comes in, and an answer can take a few days, because of the nights and weekends part.',
            },
          ],
        },
      ],
    },
  ],
}
