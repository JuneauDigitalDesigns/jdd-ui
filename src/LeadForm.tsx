'use client';
// ─────────────────────────────────────────────────────────────────────────────
// LeadForm — the ONE lead-capture form for the whole catalog.
//
// WHY IT LIVES IN lib/ AND NOT components/catalog/
// `placeComponents` (console/src/lib/export.ts) copies only the component files a
// client actually selected. Anything shared between components has to arrive via
// `copyTemplate` instead, which copies `template/` wholesale — so shared UI must
// sit in `src/lib`. That is the same reason `editable.tsx` lives here. Putting
// this under components/catalog/ would build in the console and then fail in
// every exported repo.
//
// WHAT IT REPLACES
// Thirteen components each carried their own copy of this: useState for every
// field, a hand-rolled fetch, and a `status` union. Three problems that repeated
// verbatim in all of them:
//
//   1. Inputs had a `placeholder` and no `<label>`. A placeholder is not an
//      accessible name — it is announced inconsistently and vanishes on input.
//   2. `setStatus('error')` was set and then never rendered. A failed POST showed
//      the user nothing at all: the form simply sat there and the lead was lost
//      silently. That is the worst possible failure for the one element on the
//      page that makes money.
//   3. No `aria-invalid`, no error text tied to the field.
//
// LEAD MODE
// `phone` for growth/enterprise (the Retell agent calls the lead back), `email`
// for starter (Resend emails the owner). This prop is what lets one component
// serve both plans, and is why the seven `*Starter` duplicates could be deleted.
// /api/contact builds its owner email from whatever fields are posted, so adding
// a field here needs no route change.
//
// SMS CONSENT
// The disclosure under the phone field is the only record that the customer was
// ever told they could be texted, and `consent.textHash` in the POST body is the
// evidence of it. Both come from one constant in ./lead-consent-text — the
// rendered copy is never retyped as JSX, or it drifts from the hashed copy one
// careless edit at a time. Two rules that are easy to break from in here:
//
//   1. Never post a `consent` object unless the disclosure actually rendered.
//      A hash of words nobody saw is manufactured evidence, and that is worse
//      than none: the portal's gate fails closed on a missing object and shows
//      the owner the reason, which is a recoverable state. A false hash is not.
//   2. The disclosure is wired to the phone input with `aria-describedby`, not
//      left as a loose <p>. In notice mode it is the only thing that tells a
//      screen-reader user what giving the number means, and a sibling paragraph
//      next to an input is never announced with it.
//
// CALL CONSENT
// A phone-mode form is one the AI receptionist will call back, so it carries a
// required, unticked box naming the business and the AI voice. `callConsent` is
// posted only when the box was ticked. /api/contact checks it again and won't
// dial without it, so this is the first gate, not the only one.
//
// HUMAN CHECK (v1.5.0)
// Each form renders a Cloudflare Turnstile widget (./turnstile) and posts its token as
// `turnstileToken`. The agency verifies it; a refused submission comes back 403
// `not-verified` or 429 `too-many`, and the form shows the operator's approved words for
// each. The token is good once, so the widget is reset after every refused submission.
// A site with no NEXT_PUBLIC_TURNSTILE_SITE_KEY renders no widget and posts no token.
// ─────────────────────────────────────────────────────────────────────────────
import { useId, useState, type ReactNode } from 'react';
import {
  LEAD_CALL_CONSENT_VERSION,
  LEAD_SMS_CONSENT_TEXT,
  LEAD_SMS_CONSENT_VERSION,
  hashLeadCallConsentText,
  hashLeadSmsConsentText,
  leadCallConsentText,
  type LeadCallConsent,
  type LeadConsent,
} from './lead-consent-text';
import {
  HONEYPOT_FIELD,
  LEAD_FORM_FAILED,
  leadFormErrorMessage,
  turnstileSiteKey,
  useTurnstile,
} from './turnstile';

// This package has no Node types, and needs only the one variable Next inlines.
declare const process: { env: { NEXT_PUBLIC_BRAND_NAME?: string } };

export type LeadMode = 'phone' | 'email';
export type LeadConsentMode = 'notice' | 'checkbox';
type Status = 'idle' | 'loading' | 'done' | 'error' | 'fallback' | 'fallback-done';

/** Loose on purpose. The server normalises and is the real authority; this only catches
 *  obvious typos before a round trip. Rejecting valid-but-unusual input here would cost
 *  leads, which is a far worse outcome than forwarding one bad address. */
function looksLikeEmail(v: string): boolean {
  return /^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(v.trim());
}
/** Any 7+ digits. Deliberately permissive about spacing, dashes, parens and country code. */
function looksLikePhone(v: string): boolean {
  return (v.match(/\d/g) ?? []).length >= 7;
}

/* ─── the three consent invariants, lifted out so they can be tested ───────────
 * These were inline in the component until v1.3.0. A component's internals are
 * only reachable from a test through a rendered DOM, and the two cases that matter
 * most here — a field that is invalid *and* has a disclosure, and what gets posted
 * when no disclosure was shown — are not in the initial render. A test that cannot
 * reach them is decoration, so the decisions live here as pure functions instead.
 * They are exported for that reason; nothing outside this file needs them.
 * ─────────────────────────────────────────────────────────────────────────────── */

/**
 * Whether this form says anything about texting — the hinge the whole safety
 * property hangs on.
 *
 * Both the rendered disclosure and the posted hash are gated on this one call, so
 * a build cannot evidence words it never showed. `email` mode collects no number:
 * the sentence would describe a field that is not on screen, and the consent
 * object would assert permission for a number nobody gave.
 */
export function showsSmsDisclosure(mode: LeadMode): boolean {
  return mode === 'phone';
}

/* Element ids, derived in one place. `contactDescribedBy` names these ids and the
 * elements carrying them are rendered elsewhere in this file; if the two spellings
 * drift, aria-describedby points at nothing and nothing visibly breaks. */
export const consentElementId = (uid: string) => `${uid}-consent`;
export const contactErrorId = (uid: string) => `${uid}-contact-err`;

/**
 * The ids describing the contact input, error first so the more urgent is
 * announced first.
 *
 * The regression this exists to catch: wiring the disclosure in by *replacing*
 * `aria-describedby` rather than appending to it, which silently re-introduces
 * bug 3 from the header comment — an invalid field with no error tied to it. In
 * checkbox mode the text is the checkbox's own <label> and is announced there, so
 * describing the input with it as well would read it out twice.
 */
export function contactDescribedBy(args: {
  uid: string;
  showContactErr: boolean;
  showsDisclosure: boolean;
  consentMode: LeadConsentMode;
}): string | undefined {
  const { uid, showContactErr, showsDisclosure, consentMode } = args;
  return (
    [
      showContactErr ? contactErrorId(uid) : null,
      showsDisclosure && consentMode === 'notice' ? consentElementId(uid) : null,
    ]
      .filter(Boolean)
      .join(' ') || undefined
  );
}

/**
 * The consent object for one submission, or null when there is nothing to evidence.
 *
 * Shape fixed by agreement with jdd-ops/PLAN-portal-form-capture.md §3. Takes the
 * same boolean that decides whether the words render, so the two cannot be changed
 * apart.
 */
export async function captureLeadConsent(showsDisclosure: boolean): Promise<LeadConsent | null> {
  if (!showsDisclosure) return null;
  try {
    return {
      basis: 'web-form',
      textHash: await hashLeadSmsConsentText(LEAD_SMS_CONSENT_TEXT),
      textVersion: LEAD_SMS_CONSENT_VERSION,
      // Client clock, for diagnostics only — the server re-stamps authoritatively,
      // because a time the submitter controls is not evidence of when they consented.
      capturedAt: new Date().toISOString(),
    };
  } catch {
    // crypto.subtle is secure-context-only (see hashLeadSmsConsentText). Dropping the
    // lead over an unhashable string would be the worse trade by a distance, so post it
    // without the object: the portal's gate fails closed, captures the lead, and tells
    // the owner why they cannot text it. A placeholder hash would instead claim
    // evidence that does not exist.
    return null;
  }
}

/**
 * Whether this form promises an AI callback, and so needs the box.
 *
 * `LEAD_CALLBACK` never reaches the browser. The plan does, through `mode`: every catalog form
 * passes `email` for Starter (web-only is a Starter) and `phone` otherwise.
 */
export function showsCallConsent(mode: LeadMode): boolean {
  return mode === 'phone';
}

/** Written out in full because Next inlines this exact expression at build. */
export function callConsentBusinessName(): string {
  return process.env.NEXT_PUBLIC_BRAND_NAME?.trim() ?? '';
}

/**
 * The call-consent record for one submission, or null unless the box was ticked.
 *
 * Takes the same text that rendered, so the hash covers the words on screen. Null when it can't
 * be hashed: the lead still posts, and /api/contact sends it to the inbox rather than dialing.
 */
export async function captureLeadCallConsent(
  ticked: boolean,
  text: string,
): Promise<LeadCallConsent | null> {
  if (!ticked) return null;
  try {
    const loc = globalThis.location;
    return {
      basis: 'web-form-checkbox',
      textHash: await hashLeadCallConsentText(text),
      textVersion: LEAD_CALL_CONSENT_VERSION,
      capturedAt: new Date().toISOString(),
      pageUrl: loc ? `${loc.origin}${loc.pathname}` : '',
    };
  } catch {
    return null;
  }
}

/**
 * The lead to attach a message to when /api/contact says the AI call didn't go out, else null.
 *
 * Only a phone-mode form promised a call. A site on an older route sends neither field, and
 * every older response falls through to the normal confirmation.
 */
export function callbackFallbackId(mode: LeadMode, response: unknown): string | null {
  if (mode !== 'phone' || !response || typeof response !== 'object') return null;
  const { callback, followUpId } = response as { callback?: unknown; followUpId?: unknown };
  return callback === 'unavailable' && typeof followUpId === 'string' && followUpId
    ? followUpId
    : null;
}

export function LeadForm({
  mode = 'phone',
  submitLabel,
  withMessage = false,
  initialMessage = '',
  consentMode = 'notice',
  surface = 'light',
  layout = 'stack',
  className = '',
}: {
  mode?: LeadMode;
  submitLabel: ReactNode;
  withMessage?: boolean;
  /** Seeds the optional message field (only rendered when `withMessage` is true) — e.g. a
   *  vertical template pre-filling what the visitor picked on a previous step (lawn-care's
   *  mow-frequency selector) so they don't have to re-type it. Stays fully editable: this only
   *  sets the initial value, same contract as an <input defaultValue>. Defaults to `''` so
   *  every existing call site is byte-for-byte unaffected. */
  initialMessage?: string;
  /** How the SMS disclosure is presented (phone mode only — see `showsDisclosure` below).
   *
   *  `notice` is the default and the operator's working decision: this is a transactional
   *  reply to an enquiry the customer opened, so clear notice is the proportionate
   *  disclosure, and the hash is the evidence. `checkbox` is stronger evidence — an
   *  affirmative act, blocking submission until ticked — at the cost of friction on the one
   *  element on the page that makes money. It is a prop rather than a rewrite precisely so
   *  that trade can be revisited per site without touching this logic; either value posts
   *  the same `consent` shape. */
  consentMode?: LeadConsentMode;
  /** `dark` restyles the controls for an inverted section. */
  surface?: 'light' | 'dark';
  /** `row` lays the fields out horizontally from sm up; `stack` keeps one column. */
  layout?: 'row' | 'stack';
  className?: string;
}) {
  // Two of these can render on one page (a contact strip and a final CTA), so ids must be
  // unique per instance or every <label htmlFor> points at the first form's inputs.
  const uid = useId();
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [message, setMessage] = useState(initialMessage);
  // Never defaults to true. A pre-ticked box is not an affirmative act and is worth less as
  // evidence than the plain notice it would be replacing.
  const [consentChecked, setConsentChecked] = useState(false);
  const [callConsentChecked, setCallConsentChecked] = useState(false);
  const [fallbackLeadId, setFallbackLeadId] = useState<string | null>(null);
  const [fallbackMessage, setFallbackMessage] = useState('');
  const [fallbackSend, setFallbackSend] = useState<'idle' | 'sending' | 'error'>('idle');
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [status, setStatus] = useState<Status>('idle');
  const [errorText, setErrorText] = useState(LEAD_FORM_FAILED);
  const [honeypot, setHoneypot] = useState('');
  const turnstile = useTurnstile(turnstileSiteKey());

  const contactLabel = mode === 'email' ? 'Email address' : 'Phone number';
  const contactValid = mode === 'email' ? looksLikeEmail(contact) : looksLikePhone(contact);
  const nameValid = name.trim().length > 0;

  // One call gates both the rendered words and the posted hash — see showsSmsDisclosure.
  const showsDisclosure = showsSmsDisclosure(mode);
  const consentValid = !(showsDisclosure && consentMode === 'checkbox') || consentChecked;
  const disclosureId = consentElementId(uid);

  const needsCallConsent = showsCallConsent(mode);
  const callConsentValid = !needsCallConsent || callConsentChecked;
  const callConsentId = `${uid}-call-consent`;
  const callConsentText = leadCallConsentText(callConsentBusinessName());

  const showNameErr = touched.name && !nameValid;
  const showContactErr = touched.contact && !contactValid;
  const showConsentErr = touched.consent && !consentValid;
  const showCallConsentErr = touched.callConsent && !callConsentValid;

  const dark = surface === 'dark';
  const field = [
    'w-full rounded-lg border-2 px-4 py-3 text-[16px] outline-none transition-colors',
    // 16px is not a style choice: iOS Safari zooms the viewport on focus for anything
    // smaller, which yanks the page around mid-form.
    dark
      ? 'border-white/25 bg-white/10 text-onInk placeholder-white/40 focus:border-accent'
      : 'border-rule bg-bg text-ink placeholder-inkSoft/60 focus:border-accent',
  ].join(' ');
  const errField = dark ? 'border-red-300' : 'border-urgent';
  const labelCls = `mb-1.5 block text-[13.5px] font-bold ${dark ? 'text-onInk' : 'text-ink'}`;
  const errCls = `mt-1 block text-[13px] font-semibold ${dark ? 'text-red-200' : 'text-urgent'}`;
  const disclosureCls = `text-[13px] leading-snug ${dark ? 'text-onInkSoft' : 'text-inkSoft'}`;

  // Always rendered when a number is collected: not a tooltip, not a <details>, not a link
  // to a policy. Someone who never opens it has not been told anything.
  const disclosure = !showsDisclosure ? null : consentMode === 'checkbox' ? (
    <div>
      <label htmlFor={disclosureId} className={`flex items-start gap-2.5 ${disclosureCls}`}>
        <input
          id={disclosureId}
          name="smsConsent"
          type="checkbox"
          checked={consentChecked}
          onChange={(e) => setConsentChecked(e.target.checked)}
          onBlur={() => setTouched((t) => ({ ...t, consent: true }))}
          aria-invalid={showConsentErr || undefined}
          aria-describedby={showConsentErr ? `${disclosureId}-err` : undefined}
          className="mt-px size-4 shrink-0 accent-accent"
        />
        <span>{LEAD_SMS_CONSENT_TEXT}</span>
      </label>
      {showConsentErr && (
        <span id={`${disclosureId}-err`} className={errCls}>
          Please tick this so we can text you back.
        </span>
      )}
    </div>
  ) : (
    <p id={disclosureId} className={disclosureCls}>
      {LEAD_SMS_CONSENT_TEXT}
    </p>
  );

  // The call-consent box and the message box are styled inline, not with Tailwind. A client site's
  // Tailwind doesn't scan this package, so a class used here only exists if a catalog component
  // happens to use it too. On a real site, these two have to look right regardless.
  const inkColor = dark ? 'var(--on-ink)' : 'var(--ink)';
  const errStyle = {
    display: 'block',
    marginTop: 4,
    fontSize: 13,
    fontWeight: 600,
    color: dark ? '#fecaca' : 'var(--urgent)',
  } as const;

  // Full-strength text rather than the muted disclosure colour: this one has to be conspicuous.
  const callConsentBox = !needsCallConsent ? null : (
    <div>
      <label
        htmlFor={callConsentId}
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 10,
          fontSize: 13.5,
          lineHeight: 1.375,
          color: inkColor,
        }}
      >
        <input
          id={callConsentId}
          name="callConsent"
          type="checkbox"
          required
          checked={callConsentChecked}
          onChange={(e) => setCallConsentChecked(e.target.checked)}
          onBlur={() => setTouched((t) => ({ ...t, callConsent: true }))}
          aria-invalid={showCallConsentErr || undefined}
          aria-describedby={showCallConsentErr ? `${callConsentId}-err` : undefined}
          style={{ width: 16, height: 16, marginTop: 2, flexShrink: 0, accentColor: 'var(--accent)' }}
        />
        <span>{callConsentText}</span>
      </label>
      {showCallConsentErr && (
        <span id={`${callConsentId}-err`} style={errStyle}>
          Please tick this box so we can call you back.
        </span>
      )}
    </div>
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setTouched({ name: true, contact: true, consent: true, callConsent: true });
    if (!nameValid || !contactValid || !consentValid || !callConsentValid) return;
    setStatus('loading');
    setErrorText(LEAD_FORM_FAILED);
    try {
      const turnstileToken = await turnstile.takeToken();
      const consent = await captureLeadConsent(showsDisclosure);
      const callConsent = await captureLeadCallConsent(
        needsCallConsent && callConsentChecked,
        callConsentText,
      );
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name,
          [mode]: contact,
          ...(withMessage && message.trim() ? { message } : {}),
          ...(consent ? { consent } : {}),
          ...(callConsent ? { callConsent } : {}),
          ...(turnstileToken ? { turnstileToken } : {}),
          ...(honeypot ? { [HONEYPOT_FIELD]: honeypot } : {}),
        }),
      });
      if (!res.ok) {
        // A token is spent by the attempt, so the next try needs a fresh one.
        turnstile.reset();
        setErrorText(leadFormErrorMessage(res.status, await res.json().catch(() => null)));
        setStatus('error');
        return;
      }
      const leadId = callbackFallbackId(mode, await res.json().catch(() => null));
      if (leadId) {
        setFallbackLeadId(leadId);
        setStatus('fallback');
      } else {
        setStatus('done');
      }
    } catch {
      turnstile.reset();
      setStatus('error');
    }
  }

  async function sendFallbackMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!fallbackMessage.trim()) return;
    setFallbackSend('sending');
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ followUp: { leadId: fallbackLeadId, message: fallbackMessage } }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setStatus('fallback-done');
    } catch {
      setFallbackSend('error');
    }
  }

  if (status === 'done' || status === 'fallback-done') {
    return (
      <div
        // `status`, not `alert`: this is a confirmation, and alert interrupts whatever the
        // screen reader is saying.
        role="status"
        className={`rounded-lg p-6 ${dark ? 'bg-white/10 text-onInk' : 'bg-bgSoft text-ink'} ${className}`}
      >
        <p className="text-[18px] font-extrabold">Got it, thank you.</p>
        <p className={`mt-1.5 text-[15px] ${dark ? 'text-onInkSoft' : 'text-inkSoft'}`}>
          {status === 'fallback-done'
            ? "Your message is with our team. We'll get back to you soon."
            : mode === 'phone'
              ? 'Expect a call shortly. If it is urgent, calling us is still fastest.'
              : 'We have your details and will reply by email shortly.'}
        </p>
      </div>
    );
  }

  // The AI call didn't go out. The lead is already in the inbox, so leaving here loses nothing:
  // this only adds the visitor's words to it. Native `required` so an empty box needs no copy.
  if (status === 'fallback') {
    return (
      <form
        onSubmit={sendFallbackMessage}
        className={className}
        style={{
          padding: 24,
          borderRadius: 8,
          background: dark ? 'rgba(255,255,255,0.1)' : 'var(--bg-soft)',
          color: inkColor,
        }}
      >
        <p role="status" style={{ fontSize: 18, fontWeight: 800 }}>
          We couldn&apos;t place that call.
        </p>
        <p style={{ marginTop: 6, fontSize: 15 }}>
          We have your name and number. Add a message below and it will go straight to our team.
        </p>
        <label
          htmlFor={`${uid}-fallback`}
          style={{ display: 'block', marginTop: 12, marginBottom: 6, fontSize: 13.5, fontWeight: 700 }}
        >
          Your message
        </label>
        <textarea
          id={`${uid}-fallback`}
          name="fallbackMessage"
          rows={3}
          required
          maxLength={2000}
          value={fallbackMessage}
          onChange={(e) => setFallbackMessage(e.target.value)}
          // 16px is not a style choice: iOS Safari zooms the page on focus for anything smaller.
          style={{
            display: 'block',
            width: '100%',
            boxSizing: 'border-box',
            padding: '12px 16px',
            borderRadius: 8,
            border: `2px solid ${dark ? 'rgba(255,255,255,0.25)' : 'var(--rule)'}`,
            background: dark ? 'rgba(255,255,255,0.1)' : 'var(--bg)',
            color: 'inherit',
            fontSize: 16,
          }}
        />
        <button
          type="submit"
          disabled={fallbackSend === 'sending'}
          style={{
            marginTop: 12,
            padding: '12px 24px',
            borderRadius: 8,
            background: 'var(--accent)',
            color: 'var(--accent-fg)',
            fontSize: 17,
            fontWeight: 800,
            opacity: fallbackSend === 'sending' ? 0.6 : 1,
          }}
        >
          {fallbackSend === 'sending' ? 'Sending…' : 'Send message'}
        </button>
        {fallbackSend === 'error' && (
          <p role="alert" style={{ ...errStyle, marginTop: 12, fontSize: 15 }}>
            That didn&apos;t send. Please try again, or call us directly.
          </p>
        )}
      </form>
    );
  }

  return (
    <form onSubmit={submit} noValidate className={className}>
      <div className={layout === 'row' ? 'flex flex-col gap-3 sm:flex-row sm:items-start' : 'flex flex-col gap-3'}>
        <div className={layout === 'row' ? 'flex-1' : ''}>
          <label htmlFor={`${uid}-name`} className={labelCls}>Your name</label>
          <input
            id={`${uid}-name`}
            name="name"
            type="text"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => setTouched((t) => ({ ...t, name: true }))}
            aria-invalid={showNameErr || undefined}
            aria-describedby={showNameErr ? `${uid}-name-err` : undefined}
            className={`${field} ${showNameErr ? errField : ''}`}
          />
          {showNameErr && <span id={`${uid}-name-err`} className={errCls}>Please tell us your name.</span>}
        </div>

        <div className={layout === 'row' ? 'flex-1' : ''}>
          <label htmlFor={`${uid}-contact`} className={labelCls}>{contactLabel}</label>
          <input
            id={`${uid}-contact`}
            name={mode}
            type={mode === 'email' ? 'email' : 'tel'}
            inputMode={mode === 'email' ? 'email' : 'tel'}
            autoComplete={mode === 'email' ? 'email' : 'tel'}
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            onBlur={() => setTouched((t) => ({ ...t, contact: true }))}
            aria-invalid={showContactErr || undefined}
            aria-describedby={contactDescribedBy({
              uid,
              showContactErr,
              showsDisclosure,
              consentMode,
            })}
            className={`${field} ${showContactErr ? errField : ''}`}
          />
          {showContactErr && (
            <span id={contactErrorId(uid)} className={errCls}>
              {mode === 'email' ? 'That email address does not look right.' : 'Please enter a number we can reach you on.'}
            </span>
          )}
          {/* Directly under the phone input in `stack`. In `row` the three fields share one
              line, so three sentences in a flex-1 column would wrap into a tower and drag
              the row's height with it — there it renders full-width below the row instead,
              which is still immediately below the phone field it describes. */}
          {layout === 'stack' && disclosure && <div className="mt-2">{disclosure}</div>}
          {layout === 'stack' && callConsentBox && <div style={{ marginTop: 10 }}>{callConsentBox}</div>}
        </div>

        <button
          type="submit"
          disabled={status === 'loading'}
          className={`shrink-0 rounded-lg bg-accent px-6 py-3 text-[17px] font-extrabold text-accentFg transition-[filter] hover:brightness-105 disabled:opacity-60 ${
            layout === 'row' ? 'sm:mt-[26px]' : ''
          }`}
        >
          {status === 'loading' ? 'Sending…' : submitLabel}
        </button>
      </div>

      {layout === 'row' && disclosure && <div className="mt-2.5">{disclosure}</div>}
      {layout === 'row' && callConsentBox && <div style={{ marginTop: 10 }}>{callConsentBox}</div>}

      {withMessage && (
        <div className="mt-3">
          <label htmlFor={`${uid}-message`} className={labelCls}>
            What do you need? <span className="font-semibold opacity-70">(optional)</span>
          </label>
          <textarea
            id={`${uid}-message`}
            name="message"
            rows={3}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className={field}
          />
        </div>
      )}

      {/* The state the old per-component forms set and then never rendered. `alert` because
          the user has just acted and needs to know it failed, and the phone number is given
          as the fallback rather than asking them to try again into the void. */}
      {/* The human check. Empty for nearly everyone; Cloudflare draws a checkbox here only for
          a visitor it is unsure of. */}
      <div ref={turnstile.containerRef} style={{ marginTop: 10 }} />

      {/* No person sees or reaches this; a script that fills every input fills it too. */}
      <div aria-hidden="true" style={{ position: 'absolute', left: '-10000px', width: 1, height: 1, overflow: 'hidden' }}>
        <label htmlFor={`${uid}-hp`}>Leave this empty</label>
        <input
          id={`${uid}-hp`}
          name={HONEYPOT_FIELD}
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={honeypot}
          onChange={(e) => setHoneypot(e.target.value)}
        />
      </div>

      {status === 'error' && (
        <p role="alert" className={`mt-3 text-[15px] font-semibold ${dark ? 'text-red-200' : 'text-urgent'}`}>
          {errorText}
        </p>
      )}
    </form>
  );
}
