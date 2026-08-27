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
 * ## The refund policy is now written down, and it says no
 *
 * This page used to say there was no policy — not a strict one, not a generous
 * one, simply not written — and that the honest answer was to write in and have
 * a person read it. That was true, and it was the wrong thing to leave true: a
 * shop that decides refunds one email at a time is a shop where the answer
 * depends on who wrote and how they put it, which is worse for a reader than a
 * plain no they can see before they pay.
 *
 * So it is a no, it is stated in the words above the shelf as well as in the
 * section below, and the section still ends in the two things that are NOT
 * refunds and are still fixed the day you ask: money taken for something that
 * bought nothing, and a pack that landed on the wrong account.
 *
 * ## The plans section used to say "no", and that is why it is written the way
 * ## it is now
 *
 * This shelf really did sell one-time packs only, and the section about
 * subscriptions was one word long. Then the Pro Export Pack became a plan, and
 * a page still answering "nothing here renews" was the shop telling somebody
 * the wrong thing about their own money — the one mistake `store.ts` says a
 * shop may not make, arriving through a file nobody thought of as part of the
 * price.
 *
 * So the section names no pack and counts nothing. It says what is true of
 * whatever is on the shelf: the card tells you before you click, and anything
 * that renews can be changed and stopped from that same card. Both of those
 * stay true when a second pack gains a plan, which is the only version of this
 * section that will not go stale on its own.
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
          { label: 'What a pack is', value: 'A purchase on your account, not a licence key and not a trial' },
          { label: 'Charged', value: 'Once, unless the card says it renews. Then the card also says how to stop it' },
          { label: 'Refunds', value: 'None. A plan can be cancelled instead, and you keep it to the period’s end' },
          { label: 'Currency', value: 'US dollars, whichever country you are in' },
          { label: 'The price', value: 'On the card above, and it is the number Stripe charges' },
          { label: 'What you get', value: 'Everything the card lists, and that list is all of it' },
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
    title: 'Plans, and how to stop one',
    what: 'Which packs renew, how to change or cancel, and what you keep afterwards.',
    tag: 'PLANS',
    blocks: [
      {
        kind: 'text',
        text: 'Most packs on this shelf are charged once and are yours for good. Some are a plan that renews, and one is today. You never have to work out which: a pack that renews says SUBSCRIPTION on its card, next to the price and the cadence, before you click anything. A pack that does not renew says ONE-TIME. Neither of those is ever the other way round.',
      },
      {
        kind: 'text',
        text: 'A pack sold as a plan is usually sold more than one way — by the month, by the year, and sometimes outright — and the card prices every one of them before you choose. Nothing is picked for you, and nothing is dressed as the recommended one.',
      },
      {
        kind: 'features',
        items: [
          {
            name: 'Everything is on the card itself',
            text: 'Once a plan is yours, the same card grows a Manage or Cancel Plan button where the Buy button was. Press it, choose Cancel Subscription, and confirm that you want the renewals stopped. Changing the plan, starting it again, changing the card you pay with and reading what you have been charged are in that same panel. There is nowhere else to go and nobody to email.',
          },
          {
            name: 'The card says where you stand',
            text: 'It names the day it renews while it is renewing, the day it ends once you have cancelled, and it says so plainly if a payment has failed. You never have to open anything to find out which of those is true.',
          },
          {
            name: 'Changing a plan',
            text: 'Change Plan opens Stripe’s own page, where you can move between the plans. You pay the difference for the time left rather than the whole amount again, and Stripe works that out and shows it to you before you agree to it.',
          },
          {
            name: 'Cancelling keeps what you have paid for',
            text: 'Cancelling stops the next payment. It does not take anything away that day. Every part of the pack keeps working until the end of the period you have already paid for, in the app as well as on this page, and the card tells you the exact date. Then it stops on its own and nothing further is charged.',
          },
          {
            name: 'And you can change your mind',
            text: 'While a cancelled plan is still running, the same button offers Resume Subscription. That puts the renewals back on the plan you were already on, and nothing is charged on the day you press it.',
          },
          {
            name: 'Buying it outright instead',
            text: 'Where a pack can also be bought once and kept, the manage panel offers that too. We stop the renewals first and say so before you agree, so you are never paying for the plan and the outright copy at the same time.',
          },
        ],
      },
      {
        kind: 'note',
        text: 'The rule you can hold us to: if a card does not say it renews, it does not renew — and if it does, you can stop it from that card in three presses, keep everything you have paid for, and never be charged again.',
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
            text: 'There is no way to own a pack twice, so the second payment bought nothing at all. That is not a refund and the no-refunds line does not cover it: it is money we should not have taken, and we send it back. Write to us with both receipts.',
          },
          {
            name: 'Manage or Cancel Plan is not on the card',
            text: 'That button only appears when there is a live Stripe subscription behind it. A pack bought outright has nothing to renew, and a pack we put on your account by hand has no payment attached to it at all — both of those say so on the card instead. If you are being charged for something and cannot see the button, that is worth telling us, and we can stop the payment ourselves the day you write.',
          },
          {
            name: 'Cancelling would not go through',
            text: 'If the panel says our billing setup would not let it through, nothing on your account changed and nothing was charged. That one is ours to fix rather than yours, and writing to us is genuinely the fastest way: we can stop the renewal by hand the same day.',
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
    what: 'There are none. Why, what you can do instead, and the two cases this is not about.',
    tag: 'NO REFUNDS',
    blocks: [
      {
        kind: 'text',
        text: 'Payments on this shelf are not refundable. It is worth saying that as plainly as we can, above the shelf as well as here, because a rule you find out about afterwards is a rule you never agreed to.',
      },
      {
        kind: 'text',
        text: 'The reason is not that we would rather keep your money. Every sale costs us fees that do not come back when a payment is reversed, and we are two brothers doing this on nights and weekends rather than a company that can absorb that. A refund does not undo a sale for us; it turns it into a loss. So the honest thing is to say no in advance and make sure you never need to ask — which is what the rest of this page is for.',
      },
      {
        kind: 'note',
        text: 'What is on a card is the whole of what that pack unlocks, and a one-time pack is yours for good once it is paid for. Read the card, and if a pack renews it says so beside the price. Nothing here is a trial that quietly becomes a charge.',
      },
      {
        kind: 'features',
        items: [
          {
            name: 'Cancel instead, if it renews',
            text: 'A plan can be stopped from its own card the moment you want it stopped, and you keep every part of it until the end of the period you have already paid for. Nothing further is charged after that. That is the thing to reach for rather than a refund, and it is three presses.',
          },
          {
            name: 'A payment that bought nothing is not a refund',
            text: 'If you were charged twice for the same pack, the second payment bought nothing, because there is no way to own a pack twice. That is money we should not have taken and we send it back. Same for a payment that landed with no pack attached to it at all.',
          },
          {
            name: 'A pack on the wrong account is not a refund either',
            text: 'We can take a pack off one account and put it on another, and both halves are written to the same record a real payment is. Nobody has to buy anything a second time to fix that.',
          },
          {
            name: 'Where to write',
            text: 'The contact page linked in the footer reaches both of us. It is the same place for a purchase that will not land, a pack on the wrong account, and anything on this page that turns out not to match what happened to you.',
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
        text: 'If this policy ever changes it will change here, on this page, before it changes for anybody — not quietly, and not for one person in an email.',
      },
    ],
  },
]
