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
// ─────────────────────────────────────────────────────────────────────────────
import { useId, useState, type ReactNode } from 'react';

export type LeadMode = 'phone' | 'email';
type Status = 'idle' | 'loading' | 'done' | 'error';

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

export function LeadForm({
  mode = 'phone',
  submitLabel,
  withMessage = false,
  surface = 'light',
  layout = 'stack',
  className = '',
}: {
  mode?: LeadMode;
  submitLabel: ReactNode;
  withMessage?: boolean;
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
  const [message, setMessage] = useState('');
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [status, setStatus] = useState<Status>('idle');

  const contactLabel = mode === 'email' ? 'Email address' : 'Phone number';
  const contactValid = mode === 'email' ? looksLikeEmail(contact) : looksLikePhone(contact);
  const nameValid = name.trim().length > 0;

  const showNameErr = touched.name && !nameValid;
  const showContactErr = touched.contact && !contactValid;

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

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setTouched({ name: true, contact: true });
    if (!nameValid || !contactValid) return;
    setStatus('loading');
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name,
          [mode]: contact,
          ...(withMessage && message.trim() ? { message } : {}),
        }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setStatus('done');
    } catch {
      setStatus('error');
    }
  }

  if (status === 'done') {
    return (
      <div
        // `status`, not `alert`: this is a confirmation, and alert interrupts whatever the
        // screen reader is saying.
        role="status"
        className={`rounded-lg p-6 ${dark ? 'bg-white/10 text-onInk' : 'bg-bgSoft text-ink'} ${className}`}
      >
        <p className="text-[18px] font-extrabold">Got it, thank you.</p>
        <p className={`mt-1.5 text-[15px] ${dark ? 'text-onInkSoft' : 'text-inkSoft'}`}>
          {mode === 'phone'
            ? 'Expect a call shortly. If it is urgent, calling us is still fastest.'
            : 'We have your details and will reply by email shortly.'}
        </p>
      </div>
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
            aria-describedby={showContactErr ? `${uid}-contact-err` : undefined}
            className={`${field} ${showContactErr ? errField : ''}`}
          />
          {showContactErr && (
            <span id={`${uid}-contact-err`} className={errCls}>
              {mode === 'email' ? 'That email address does not look right.' : 'Please enter a number we can reach you on.'}
            </span>
          )}
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
      {status === 'error' && (
        <p role="alert" className={`mt-3 text-[15px] font-semibold ${dark ? 'text-red-200' : 'text-urgent'}`}>
          That didn&apos;t send. Please try again, or call us directly.
        </p>
      )}
    </form>
  );
}
