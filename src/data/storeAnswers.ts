import type { PageSection } from './pageBlocks'

/**
 * The money side of the Store, in full, under the shelf it is about.
 *
 * ## Not one number in here
 *
 * `store.ts` is where a price is written, and its own header explains
 * everywhere else the same number is written down, including in two other
 * repositories. A second copy on this page would be a fourth or fifth place to
 * forget, and the one mistake a shop may not make is advertising one amount and
 * charging another. So the cards render the amounts from the catalog and this
 * file talks about them without ever saying one: "the price on the card" is not
 * a hedge, it is the only way to be right in a year.
 *
 * ## The failure paths get the room
 *
 * A purchase that works needs no explaining: the card flips to Owned and the
 * reader moves on. What somebody actually needs this page for is the moment it
 * does not, so "if it has not landed" and "when something else goes wrong" are
 * the two longest sections, and both end in something to do rather than in
 * reassurance.
 *
 * ## What is deliberately NOT claimed
 *
 * There is no refund policy. Not a strict one, not a generous one: it has not
 * been written. The section says that, says what we are able to do, and says
 * who to write to, because a policy invented on a web page is a policy nobody
 * has agreed to keep.
 *
 * And "no subscription" is a fact about THIS SHELF, never about TDG. Makullveny
 * sells tiers of its own on its own site, one of which renews, and there is a
 * TDG-wide subscription tier several apps read. A page that promised we never
 * do subscriptions would be a promise broken by something already shipped.
 *
 * Facts checked against: `src/data/store.ts` (what is sold, the links, the
 * currency), `src/components/Store.tsx` (the buy flow and the five minutes it
 * watches for), `src/store/useOwnedPacks.ts` (how ownership is read, and that a
 * revoked pack leaves), `src/dev/README.md` and `src/dev/AccountDetail.tsx` (a
 * pack can be granted or revoked by hand, and both land in the ledger).
 */
export const STORE_ANSWERS: PageSection[] = [
  {
    id: 'what',
    title: 'What you are buying',
    what: 'Which parts are paid, what stays free, and the fact that neither app is out yet.',
    tag: 'READ FIRST',
    blocks: [
      {
        kind: 'text',
        text: 'Two apps have anything to sell: DevFleet and TDG Veditor. Everything on this shelf is an extra beside an app that is free, and the app is not the thing being sold. Each card above says what its own app leaves free, and that part does not change when you buy a pack.',
      },
      {
        kind: 'note',
        text: 'Neither app has shipped. Buying today means paying for something you cannot use yet: the pack sits on your account and turns on when the first build lands. If that is not a trade you want to make, wait. The apps themselves will be free when they arrive either way.',
      },
      {
        kind: 'facts',
        items: [
          { label: 'What a pack is', value: 'A one-time purchase, not a licence key and not a trial' },
          { label: 'Charged', value: 'Once. There is nothing to renew and nothing to cancel' },
          { label: 'Currency', value: 'US dollars, whichever country you are in' },
          { label: 'The price', value: 'On the card above, and it is the number Stripe charges' },
          { label: 'Usable today', value: 'Not yet. Both apps are still in development' },
        ],
      },
    ],
  },
  {
    id: 'attaches',
    title: 'What a purchase attaches to',
    what: 'Your TDG Account rather than a machine, and what that means on the next computer.',
    tag: 'OWNERSHIP',
    blocks: [
      {
        kind: 'text',
        text: 'A pack lands on your TDG Account, which is the same account the apps sign into. Sign in on a new laptop and it is there, with nothing to type in and nothing to move across. Sign out and the free set comes back; sign in again and so does the pack.',
      },
      {
        kind: 'features',
        items: [
          {
            name: 'Each app keeps its own list',
            text: 'DevFleet and TDG Veditor both sell something called a Theme Pack, and they are two different products. Buying one does not give you the other, and the shelf above tracks them separately so a card can never light up for a purchase you did not make.',
          },
          {
            name: 'Ownership is asked for, never claimed',
            text: 'The app asks the account server what you own. It cannot decide for itself, and neither can a file on your disk, which is why there is no key to lose and nothing to activate.',
          },
          {
            name: 'This page reads the same answer the app does',
            text: 'The Owned you see here is read from the same row the app reads and the same row the payment writes. If it says Owned on this page, the app will agree the next time it can reach the server.',
          },
          {
            name: 'One account, not one person per machine',
            text: 'There is no device limit and no seat count. It is your account, on whatever you sign into.',
          },
        ],
      },
    ],
  },
  {
    id: 'payment',
    title: 'How the payment goes',
    what: 'Stripe’s own checkout, what the link carries, and what comes back to us.',
    tag: 'PAYMENT',
    blocks: [
      {
        kind: 'steps',
        steps: [
          {
            title: 'Sign in first',
            text: 'The button says Sign in to buy until you are, and that is deliberate: the payment has to have an account to land on, and a payment that arrives with nobody attached is money we would have to chase you about.',
          },
          {
            title: 'The Buy button opens Stripe',
            text: 'In a new tab, on Stripe’s own checkout page rather than anything of ours. The link carries your account id and your email, so the payment can be matched to you and so the address is already filled in.',
          },
          {
            title: 'You pay on that page',
            text: 'Your card details are typed into Stripe, never into this site, which holds no payment keys at all and could not charge you if it tried. Stripe handles the payment, the tax and the receipt.',
          },
          {
            title: 'The pack lands on your account',
            text: 'Normally within a minute of paying. Leave this tab open while you do it and the card flips to Owned on its own; it keeps checking for five minutes after a checkout opens, and asks again the moment you come back to the tab.',
          },
        ],
      },
      {
        kind: 'text',
        text: 'What comes back to us is that an account paid for a pack, and Stripe’s own record of the payment. No card number passes through this site, and we could not show you one if you asked.',
      },
    ],
  },
  {
    id: 'subscription',
    title: 'Is anything here a subscription',
    what: 'No, and exactly how far that answer goes across the rest of TDG.',
    tag: 'NO',
    blocks: [
      {
        kind: 'text',
        text: 'Nothing on this shelf renews. Every pack here is charged once, and there is no plan, no seat and nothing that lapses.',
      },
      {
        kind: 'text',
        text: 'That is a statement about this shelf and not a promise about everything TDG will ever sell, which is worth saying plainly rather than letting you infer the bigger version. Makullveny already has tiers of its own, sold on its own site, and one of them does renew. There is also a TDG-wide subscription tier that several of our apps can read and gate on.',
      },
      {
        kind: 'note',
        text: 'The rule you can hold us to is smaller and more useful: if a card does not say it renews, it does not renew. Anything that ever does will say so on the card, next to the price, before you click.',
      },
    ],
  },
  {
    id: 'not-landed',
    title: 'If a purchase has not landed',
    what: 'What to do, in order, when you have paid and cannot see it.',
    tag: 'FIRST AID',
    blocks: [
      {
        kind: 'steps',
        steps: [
          {
            title: 'Give it a minute on this page',
            text: 'It normally arrives inside one. This page checks every few seconds for five minutes after a checkout opens, and again whenever you switch back to this tab, so the card usually flips to Owned without you doing anything.',
          },
          {
            title: 'Check which account you are signed in as',
            text: 'The strip at the top of this page names it. A pack lands on the account that was signed in here when you pressed Buy, so if that was a different account of yours, this is where you find out.',
          },
          {
            title: 'Ask again',
            text: 'While the card is still waiting it has a Check Now button on it, and that asks straight away. Once it has stopped waiting the button is gone, and reloading the page does the same thing, because the shelf reads your account fresh every time it loads. If the card says Owned, the purchase is on your account and the rest is the app catching up.',
          },
          {
            title: 'Sign in inside the app',
            text: 'The app reads the same answer this page does, so once it can reach the server it will see the pack. Neither app has shipped yet, so for now this step is one to keep for later.',
          },
          {
            title: 'Write to us',
            text: 'If the card still does not say Owned, send us the email address you paid with and which pack it was. We can see the payment and put the pack where it belongs.',
          },
        ],
      },
      {
        kind: 'note',
        text: 'If you are not sure whether a payment went through at all, look for Stripe’s receipt in your email before paying again, and tell us if you end up with two.',
      },
    ],
  },
  {
    id: 'trouble',
    title: 'When something else goes wrong',
    what: 'Wrong account, a refused card, a test checkout, and an app that is not out yet.',
    tag: 'TROUBLE',
    blocks: [
      {
        kind: 'features',
        items: [
          {
            name: 'It is on the wrong account',
            text: 'A pack lands on whichever account was signed in on this page when you pressed Buy, because that is what the checkout link carries. Sign in as that account and it is there. If it needs to be on a different one, write to us: we can take it off one account and put it on another, and both halves are written to the same record a real payment is.',
          },
          {
            name: 'The card was refused',
            text: 'That happens on Stripe’s page, and Stripe is the one that says why. We are not told the reason and cannot look it up. Try another card, or another method if the checkout offers one. Nothing was charged and nothing landed on your account.',
          },
          {
            name: 'The checkout only takes test cards',
            text: 'A test-mode checkout is a real page that refuses every real card without saying why it refused. If a pack here is ever pointed at one, its card says so in plain words before you click, and that pack is not on sale yet.',
          },
          {
            name: 'The app is not out yet',
            text: 'That is the state of both apps today. There is nothing to install, and a pack you buy waits on your account until the first build lands. Nothing expires while it waits.',
          },
          {
            name: 'You paid twice for the same pack',
            text: 'There is no way to own a pack twice, so the second payment bought nothing, and that is the clearest refund case there is. Send us both receipts.',
          },
          {
            name: 'This page cannot read your purchases',
            text: 'If a card says the reading failed, that is this page failing to reach the server, not an answer about what you own. It never turns a failed read into "you do not own this" and offers to sell it to you again. Press Try Again, and if it keeps failing, so will the app: tell us.',
          },
        ],
      },
    ],
  },
  {
    id: 'refunds',
    title: 'Refunds, and reaching us',
    what: 'What we have not decided yet, who to write to, and how long we take.',
    tag: 'HONEST',
    blocks: [
      {
        kind: 'text',
        text: 'We have not written a refund policy. That is the true state of it, and an invented one on this page would be a rule nobody has agreed to keep.',
      },
      {
        kind: 'text',
        text: 'What is true is what we are able to do. Stripe can refund a payment, and a pack can be taken back off an account, and both are things we can do the day you ask. What has not happened is deciding in advance which cases we say yes to. Until it has, the honest answer is that you write to us and a person reads it, rather than a page telling you what that person will say.',
      },
      {
        kind: 'features',
        items: [
          {
            name: 'Where to write',
            text: 'The contact page linked in the footer reaches both of us. It is the same place for a refund, a purchase that will not land, and a pack on the wrong account.',
          },
          {
            name: 'What to include',
            text: 'The email address you paid with, which pack it was, and roughly when. That is enough to find the payment.',
          },
          {
            name: 'How long we take',
            text: 'We are two people building this on nights and weekends, so an answer can take a few days. It will be one of us, not a form.',
          },
        ],
      },
      {
        kind: 'note',
        text: 'The day there is a refund policy, it will be written here, on this page, rather than told to one person in an email.',
      },
    ],
  },
]
