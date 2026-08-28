import type { SocialAction, Standing } from './api'

/**
 * What you may do about somebody, what to call it, and what the standing
 * itself is called on screen.
 *
 * ## Why this is one file and not two lists of buttons
 *
 * Two surfaces draw a person now — the Account page's four lists and the
 * profile page — and both have to offer the same actions for the same
 * standing. The moment they each hold their own `switch` they start
 * disagreeing: a Block that exists on one and not the other, an Accept that
 * says "Confirm" over here, a card that offers Unfriend to somebody who is not
 * a friend. `src/account/README.md` records that Bible Educator's profile page
 * shipped exactly that mistake — every verb drawn for everybody, five of the
 * seven guaranteed to be refused — and fixed it by deciding from the standing.
 * This is that decision, written once.
 *
 * **The server is still the boundary** (AGENTS.md rule 12). Nothing here is a
 * permission check: `tdg_add_friend` refuses an account that is not taking
 * requests whatever this file draws, and it is that refusal, in the server's
 * own sentence, that the panels show. What this buys is that a reader is not
 * offered a button whose only possible outcome is an error.
 */

export type StandingAction = {
  action: SocialAction
  label: string
  tone?: 'primary' | 'quiet'
}

/**
 * The buttons for one standing, in the order they are read.
 *
 * The affirmative one leads and carries the `primary` tone; the one that ends
 * something is quiet and last. `blocked_by` has no buttons at all and that is
 * the correct answer rather than a missing case — there is nothing you can do
 * about somebody who has blocked you, and a greyed-out Add Friend would be the
 * page pretending otherwise.
 */
export function actionsFor(standing: Standing): StandingAction[] {
  switch (standing) {
    case 'they_asked':
      return [
        { action: 'accept', label: 'Accept', tone: 'primary' },
        { action: 'decline', label: 'Decline' },
        { action: 'block', label: 'Block', tone: 'quiet' },
      ]
    case 'you_asked':
      return [{ action: 'cancel', label: 'Withdraw' }]
    case 'friend':
      return [
        { action: 'remove', label: 'Unfriend' },
        { action: 'block', label: 'Block', tone: 'quiet' },
      ]
    case 'blocked':
      return [{ action: 'unblock', label: 'Unblock', tone: 'primary' }]
    case 'none':
      return [
        { action: 'add', label: 'Add Friend', tone: 'primary' },
        { action: 'block', label: 'Block', tone: 'quiet' },
      ]
    // Yourself, and anybody who has blocked you. Neither has an action, for
    // opposite reasons.
    case 'self':
    case 'blocked_by':
    default:
      return []
  }
}

/**
 * The chip a standing wears, or null where the standing is the ordinary one
 * and saying so would be noise.
 *
 * Title Case, because these are names on a tag rather than sentences
 * (AGENTS.md rule 7). The two block words are the reason this exists: a page
 * that simply showed nothing would leave a reader working out for themselves
 * why an account has no bio and no button.
 */
export function standingChip(standing: Standing): string | null {
  switch (standing) {
    case 'self':
      return 'You'
    case 'friend':
      return 'Friend'
    case 'they_asked':
      return 'Waiting On You'
    case 'you_asked':
      return 'Request Sent'
    case 'blocked':
      return 'Blocked'
    case 'blocked_by':
      return 'Blocked You'
    default:
      return null
  }
}

/**
 * The sentence a standing is worth saying out loud on a profile, or null.
 *
 * Sentence case, because these are explanations (rule 7). Only the standings
 * that CHANGE what the page can show get one — a friend needs no notice, and a
 * stranger needs no notice either. The two blocks do, and they are the whole
 * reason the profile page is reachable at all: a page that answered "we
 * couldn't find anybody with that username" for an account that plainly exists
 * is the site lying to avoid an awkward sentence.
 */
export function standingNotice(standing: Standing): string | null {
  switch (standing) {
    case 'blocked':
      return 'You blocked this account. They cannot ask to be your friend, and you will not see them in a search. Nothing here is hidden from you.'
    case 'blocked_by':
      return 'This account has blocked you. Their page is still here and this is still them, but what they share is not shown to you and you cannot ask to be their friend.'
    case 'they_asked':
      return 'They have asked to be your friend.'
    case 'you_asked':
      return 'You have asked to be their friend. They have not answered yet.'
    default:
      return null
  }
}
