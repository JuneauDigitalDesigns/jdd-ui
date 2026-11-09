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
 * Approved by the operator 2026-11-02, shipped as v1.3.0.
 *
 * Carrier-reviewable copy: it is not the operator's to change casually and not an
 * engineer's to change at all. Editing this sentence means bumping the version
 * above in the same commit and cutting a new @jdd/ui tag, or every consent record
 * written before the edit stops matching the words it claims were shown.
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

/* ─── consent to the AI callback ───────────────────────────────────────────────
 * Separate from the SMS notice above: a different act (a required tick, not notice), a
 * different risk (the FCC treats an AI voice as artificial under the TCPA, which requires
 * prior consent), and a different record. The SMS wording and its hash are untouched.
 * ─────────────────────────────────────────────────────────────────────────────── */

export const LEAD_CALL_CONSENT_VERSION = 'lead-call-consent-v1';

/**
 * Approved word for word by the operator 2026-11-09, naming the client's business. A lawyer
 * has not reviewed it yet. Same rule as the SMS text: a wording change means a new version
 * and a new @jdd/ui tag.
 *
 * jdd-ops/lib/site-routes/contact.route.ts keeps a standalone copy keyed by this version,
 * because it re-derives the hash before it will dial. Add the new version there too.
 */
export const LEAD_CALL_CONSENT_TEMPLATE =
  'I agree that {business} may call me back at the number I entered, about this request, ' +
  'using an automated system and an AI-generated voice. The call may be recorded. ' +
  "I don't have to agree in order to buy anything, and I can phone instead.";

/**
 * The exact words on screen for one business.
 *
 * The fallback only ever shows where no brand is set, which is the console's preview. A live
 * site built without a brand cannot place a callback: /api/contact refuses a consent that
 * doesn't name the business.
 *
 * A replacer function, not a string: `$&` in a brand name would otherwise be read as a
 * replacement pattern and the words on screen would stop matching the words the server hashes.
 */
export function leadCallConsentText(businessName: string): string {
  const name = canonicalizeConsentText(businessName) || 'this business';
  return canonicalizeConsentText(LEAD_CALL_CONSENT_TEMPLATE.replace('{business}', () => name));
}

/** SHA-256 of the rendered wording, lowercase hex. Throws outside a secure context. */
export async function hashLeadCallConsentText(text: string): Promise<string> {
  return hashLeadSmsConsentText(text);
}

/**
 * Proof of the tick, posted as `callConsent`, beside the SMS `consent` object and never merged
 * with it: that object's four keys are a published contract with the portal.
 */
export interface LeadCallConsent {
  basis: 'web-form-checkbox';
  textHash: string;
  textVersion: string;
  /** Client clock, for diagnostics. The agency stamps the authoritative time. */
  capturedAt: string;
  /** Origin and path only. A query string can carry things that shouldn't be kept for years. */
  pageUrl: string;
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
