// ─────────────────────────────────────────────────────────────────────────────
// The exact words shown beside the phone field in LeadForm, and the hash of them.
//
// WHY ONE STRING AND NOT TWO
// Three things have to agree and can never be allowed to drift: what the customer
// reads under the phone field, what gets hashed into the consent record the portal
// stores, and what is submitted to the carrier as the campaign's opt-in language.
// A carrier reviewing a complaint asks "what did this person actually see?", and
// the answer has to be provable. Writing the sentence a second time as JSX is how
// that drift starts, so the markup is built from this constant, never retyped.
//
// CLIENT-SAFE BY DESIGN. No `server-only`, no `node:crypto`: the browser renders
// this and hashes it. The agency site's equivalent (juneau-digital-designs
// app/lib/sms-consent-text.ts) can split the hashing into a server-only
// neighbour because its consent is recorded by a route handler. Here the form
// itself is the capture surface, so the hash has to be computable in the page —
// hence Web Crypto below rather than the `createHash` that file uses.
//
// CHANGING THE WORDING: bump LEAD_SMS_CONSENT_VERSION in the same commit, and cut
// a new @jdd/ui tag. Old consent events keep the hash and version they were
// written with, so they stay provable against the words that were on screen at
// the time rather than against whatever this file says later. A wording change
// with no version bump silently invalidates every record before it.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * v1 (2026-11-02) — scoped to a **reply to this enquiry**.
 *
 * "about your enquiry" is load-bearing, not padding. This is the client's own
 * `CUSTOMER_CARE` lane — the business replying to a customer who just asked to be
 * contacted — and it must never be readable as consent for anything recurring or
 * marketing-adjacent. That is a different program with different disclosure, and
 * the business owner, not the customer's form submission, is who would have to
 * register it. The agency's own `ACCOUNT_NOTIFICATION` wording (sms-consent-v2)
 * carries "Consent is not a condition of purchase" because it is attached to a
 * purchase; nothing is being bought here, so it would be noise.
 */
export const LEAD_SMS_CONSENT_VERSION = 'lead-sms-consent-v1';

/**
 * ⚠️ DRAFT — carrier-reviewable copy, pending operator approval (2026-11-02).
 * Approving a different sentence means editing this constant and bumping the
 * version above in the same commit.
 */
export const LEAD_SMS_CONSENT_TEXT =
  'By giving us your number you agree we may text you about your enquiry. ' +
  'Message and data rates may apply. Message frequency varies. ' +
  'Reply STOP to opt out, HELP for help.';

/**
 * Collapse runs of whitespace and trim.
 *
 * The constant above is assembled from concatenated literals, so reflowing it to
 * keep under the line limit is an edit nobody thinks of as an edit. Without this,
 * moving a line break would change the hash of words that did not change, and
 * every consent event written before the reflow would stop matching. Canonical
 * form is also what renders, so "the hash of the string rendered" stays literally
 * true rather than true-ish.
 */
export function canonicalizeConsentText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * SHA-256 of the canonical wording, lowercase hex.
 *
 * Web Crypto, not `node:crypto` — this runs in the page. `crypto.subtle` is only
 * exposed in a secure context, so it is absent over plain http on anything but
 * localhost; this throws there rather than returning a placeholder, because a
 * consent record carrying a hash that hashes nothing is worse than no record at
 * all. The caller decides what to do about it (LeadForm omits the consent object
 * and lets the server's fail-closed gate treat the lead as unmessageable).
 */
export async function hashLeadSmsConsentText(
  text: string = LEAD_SMS_CONSENT_TEXT,
): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error(
      'hashLeadSmsConsentText: crypto.subtle unavailable — needs a secure context (https or localhost)',
    );
  }
  const bytes = new TextEncoder().encode(canonicalizeConsentText(text));
  const digest = await subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * The consent object posted with a lead.
 *
 * Shape fixed by agreement with jdd-ops/PLAN-portal-form-capture.md §3 and
 * reserved on `WebLead.consent`; changing a field name here breaks the portal's
 * messaging gate, so it is not a unilateral edit. The server adds `ip` and
 * `userAgent` and re-stamps the time — a client clock is not evidence — so
 * `capturedAt` is for diagnostics (clock skew, a form sat on for an hour).
 */
export interface LeadConsent {
  basis: 'web-form';
  textHash: string;
  textVersion: string;
  capturedAt: string;
}
