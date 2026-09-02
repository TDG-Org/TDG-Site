# `src/content/` · the site-content overlay

What TDG Cebu says about our own products, when somebody has changed it
from the Developer console without a deploy.

`src/data/content.ts` and `src/data/appPages.ts` are still where every product's
words are **written**, and they are still what a visitor sees when this folder
has nothing to add. This is a thin document on top of them — one jsonb row in
tdg-core — holding only the fields somebody has since overridden: the order of
the cards, whether each is shown at all, its words, its icon, its cover, its
access button, and every section and block of its own page.

> The house rules for building anything on this site are in
> [`AGENTS.md`](../../AGENTS.md). This file is authoritative for `src/content/`.

---

## Why it exists

The site is static, served from GitHub Pages, and a deploy is manual. So before
this, changing one word on a card — or taking a card down because an app was not
ready to be seen — meant an edit, a commit, a push, and somebody remembering to
run the workflow. That is the right cost for a paragraph of a guide. It is the
wrong cost for *"hide Music Everything until the demo lands"*, and the wrong
cost by a mile when the person who wants it changed is not the person who can
run a build.

## The three rules it keeps

**The repo is the default and the fallback, always.** A field the document does
not mention comes from `src/data/`. So a field that is not overridden goes on
tracking the repo, an outage or a blocked request renders the built-in site
exactly, and deleting the whole row is a complete and correct home page rather
than a blank one.

**A field typed back to its built-in text drops its override.** The console does
this rather than storing an identical copy, because an override frozen at
today's wording would silently stop tracking the repo — and the day somebody
fixed that line in `content.ts` the site would go on printing the old one with
nothing on screen to say why.

**Nothing that arrives is trusted.** `types.ts` walks the whole document, keeps
what it recognises in the shape it recognises, and drops the rest for the
site's own rendering. A chip with no label is not a chip; a section with no id
could not be opened, so it is not a section; a block of a kind this bundle has
never heard of is dropped whole. The only acceptable failure is the built-in
copy — never a blank card, never a thrown render, never `undefined` printed
into a heading.

**And a publish says what it would drop before it drops it.** A publish sends
the PARSED document back, so anything the parser did not recognise would leave
tdg-core the moment an older console published any edit. `unreadableCount()`
in `types.ts` counts the values of the live document this build cannot read;
the Content tab prints that count beside Publish and refuses the press until
an explicit tick says to drop them. Zero is the usual answer; anything else is
a tab open on a build older than the one that last published.

## The files

| File | What it is |
| --- | --- |
| `types.ts` | The document's shape, and `parseDoc`, the reader that refuses to trust it. |
| `resolve.ts` | The built-in cards plus the overlay, as one answer. Reads `data/content.ts` only. |
| `resolvePage.ts` | The same for one product's own page. Reads `data/appPages.ts`, so it is imported by `AppPage.tsx` alone. |
| `store.ts` | The one copy this tab holds, the fetch that fills it, and `useSiteContent()`. |
| `api.ts` | The two privileged calls behind the console's Content tab. |

**`resolve.ts` must never import `appPages.ts`.** That file is the ten pages of
prose and travels in a lazy chunk; `lib/route.ts` explains at length why the
home page must not pay for it. Page resolution is a separate file for exactly
that reason.

## Who reads it

`components/Apps.tsx`, `components/Tools.tsx` and `components/Building.tsx` for
the three grids; `components/AppPage.tsx` for a product's own page and for the
icon, chips and screenshot it borrows from that product's card;
`components/Store.tsx` for the icon at the head of a shelf.

That list is rule 17 of `AGENTS.md` one turn further on. The lists are still
derived and never typed — they are now derived from both sources together, so
there is no surface where a hidden card is hidden in one place and printed in
another.

## What hiding a card does, exactly

It takes the card off its grid. **The product's own page is untouched and still
opens at `#/app/<slug>`**, because a link somebody has already shared should not
start answering "nothing here". The console's switch says so in as many words,
which is the only honest way to ship a control whose scope somebody has to know.

## The first paint, and why there is a localStorage cache

The overlay decides which cards exist. Painting the built-in six and then
removing one when the fetch lands is a card that visibly appears and vanishes —
which reads as a bug rather than as a page loading, and would happen on every
visit, to everybody, forever. So the last document this browser saw is written
to `localStorage` and read back synchronously on boot, and the network answer
replaces it when it arrives.

A returning visitor gets the right grid immediately. A first-time visitor sees
the built-in grid for one round trip, which is the one case that cannot be
avoided without blocking the render on a network call.

## The server half

[`supabase/migrations/20260828120000_site_content_overrides.sql`](../../supabase/migrations/20260828120000_site_content_overrides.sql).

One row, RLS on, **no client policies** — the verbs are the whole surface, the
same boundary as `tdg_feedback` and `tdg_account_badges`. `tdg_site_content()`
is the flat public read and is the **second** function on this project granted
to `anon`; the migration's header argues why it clears the same bar
`tdg_public_stats()` does. `tdg_admin_site_content_set` opens with
`tdg_admin_uid()` and writes an audit row, and a trigger keeps the version it
replaced, up to fifty of them — this is the one thing the console changes that
every visitor reads, so it is the one thing with something to put back.
