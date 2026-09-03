# `src/live/` · what is deployed right now, asked of GitHub at runtime

**`src/data/` is what we say about a product. This folder is what GitHub can
confirm about one.** At runtime it learns which apps have a live deploy and
where that deploy answers, and it surfaces public org repositories the
catalogue has not been taught yet. Nothing here is ever required for the site
to work: with GitHub unreachable, rate-limited or slow, every page renders
exactly what `src/data/` says, which is complete and correct on its own.
Everything this folder adds is an **upgrade** — a status caption becoming a
real button, a new repo becoming a card — never a downgrade and never a blank.

## The two questions, and who answers them

| Question | Asked of | What it covers |
| --- | --- | --- |
| What repositories does the org show the public? | `api.github.com/orgs/TDG-Org/repos`, unauthenticated | Public repos only: name, description, Website field, topics, whether Pages serves a site |
| Does `https://tdg-org.github.io/<repo>/` exist? | `tdg-site-deploys`, one of the site's nine edge functions | **Private repos with a public deploy** — Bible Educator is exactly that on the org's Team plan, invisible to the API without a token this site must never carry |

The second question is not asked of GitHub Pages directly, although a browser
could: a hit works, but every miss is a 404 the browser prints in the console
as a resource error — one red line per not-yet-deployed app, on a site whose
console is supposed to stay silent (AGENTS.md §7), and no fetch option
suppresses it. Probed server-side, the misses are answers instead of noise,
the behaviour is identical in dev, `vite preview` and production, and the
eight cards of one render share one request. See
[`../../supabase/README.md`](../../supabase/README.md) for the function's own
rules — a caller sends repo NAMES only, and the function will only ever probe
the one fixed origin.

**And the probe answers three ways, not two, because a 404 is two different
sentences depending on history.** The function keeps a memory
(`tdg_site_deploys_seen`, service-role only): every site it sees answering is
remembered, so a later miss splits into `absent` — never shipped, the card
honestly keeps `Coming soon` — and `down` — it WAS live and has stopped
answering, and every surface says **Temporarily unavailable** instead,
because telling somebody who used the app yesterday that it never existed is
a lie by omission. The words are one exported constant, `DOWN_WORDING` in
`useLive.ts`, mechanism copy kept with the mechanism the way `auth/wording.ts`
keeps refusals. Server-side memory rather than localStorage on purpose: two
visitors reading one page must read one truth, and a browser-side memory
would show a returning visitor `down` while a first-time visitor read
`Coming soon` for the same app at the same moment. When the memory cannot be
read the miss degrades to `absent` — the safe direction; the site never
claims a door is open.

## How a card gets its button

A card in `content.ts` names its repository with `repo: 'Bible-Educator'`
(exact name, not a URL). `useLiveAccess` then resolves, in order:

1. **A hand-written access wins outright.** A card with a `download`
   (Makullveny) or an `href` (Volume Controller) passes `undefined` instead
   of its repo, nothing is fetched, and the runtime never argues with a
   decision a human wrote down.
2. **The repo's Website field**, when set — the explicit, human-pointed door.
   Point it at a `#download` anchor and the button says `Download <App>`
   instead of `Open <App>`; that is the Makullveny convention made
   mechanical, controlled from GitHub without touching this repo.
3. **The derived Pages URL** when the API says a deploy exists, or when the
   probe finds one for a repo the API cannot see.
4. **`Temporarily unavailable`** when the probe's memory says the site was
   live and has stopped answering — the caption replaces the button rather
   than linking to a dead page, and replaces `Coming soon` rather than
   un-telling people the app exists.
5. **Nothing** — the card keeps its status caption, which is the honest face
   for "not deployed yet" and for "we could not ask".

A wrong `repo:` name fails quietly (the card just never upgrades), so when an
app first deploys and its button does not appear, that string is the first
thing to check against the repository's real name.

## Discovered cards — a repo that is not in the catalogue yet

A public org repo carrying the **`tdg-app` topic** that no hand-written card
claims gets a derived card at the end of the Apps grid: title from its name,
copy from its description, chips from its state, a button when something is
live. That is rule 17 of `AGENTS.md` — an unknown entry gets a face — applied
to the org itself.

Opt-in by topic, not "every public repo": the org's public list also holds
companion repos (`makullveny-site`, `makullveny-releases`) and retired
experiments that are not products. Tagging a repo `tdg-app` is the one
deliberate act that says "show this". Forks and archived repos never appear,
tagged or not.

**To make a brand-new app show up here without touching this repo:** make its
repository public, give it a description and (optionally) a Website, and add
the `tdg-app` topic. **The upgrade path** is a real entry in `content.ts` —
whose `repo:` field claims the repository and retires the auto-card in the
same edit. A discovered card has no icon (GitHub has none to offer, so it
gets a drawn monogram) and no page of its own; the real entry is where both
arrive.

## Caching, and which answers may be remembered

The repos list lives at module scope for the tab and in `sessionStorage` for
five minutes, so one visit costs one API call however many cards ask. Probe
answers are remembered at module scope ONLY — a refresh always re-asks. That
distinction was learned the hard way: a ten-minute stored probe answer meant
a site taken down went on saying `Open` to anyone who refreshed, which is
exactly the moment a person checks whether the takedown worked. **A failed
read is never remembered** — the same rule `badges/useBadges.ts` keeps, so
one hiccup at boot cannot pin "we do not know" for a whole visit.

## The files

| File | What it holds |
| --- | --- |
| `types.ts` | `OrgRepo`, `OrgReposState`, `LiveAccess`, `DiscoveredApp`. |
| `api.ts` | The two fetches, the cache discipline, and the probe's origin rules. |
| `useLive.ts` | `useLiveAccess` and `useDiscoveredApps`, plus the derivations under them. |

Callers today: `components/Apps.tsx` (cards and discovered cards),
`components/Tools.tsx`, `components/Games.tsx` (the MARANATHA panel, verb
`Play`), `components/AppPage.tsx` via `liveRepoForPage()` here in
`useLive.ts`, which reads the RESOLVED cards so the Content tab's overrides
count, and `store/sale.ts`, which asks `useLiveAccess` whether an app the
catalogue still calls unreleased has a live deploy before it decides what that
app's shop says.
