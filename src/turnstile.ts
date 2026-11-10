// ─────────────────────────────────────────────────────────────────────────────
// The lead form's human check: Cloudflare Turnstile, and the words a visitor sees when a
// submission is refused.
//
// The browser half only. The form posts the widget's token as `turnstileToken`; the client
// site's /api/contact hands it to the agency, which verifies it with Cloudflare (action
// "lead", one of this site's hostnames, single use). Nothing here decides anything: a token
// the browser invented is worth nothing at the server.
//
// Managed mode, `appearance: 'interaction-only'` (operator decision, 2026-11-09): nearly
// every visitor sees nothing at all, and one Cloudflare is unsure of sees a single checkbox,
// worded by Cloudflare in the visitor's language. The script loads once per page however
// many forms it has (the hero and the final CTA), and each form renders its own widget,
// because a token is good for one submission.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useRef } from 'react';

// No Node types in this package; Next inlines this exact expression at build.
declare const process: { env: { NEXT_PUBLIC_TURNSTILE_SITE_KEY?: string } };

/** The site's public Turnstile key, or '' on a site not provisioned for it yet. */
export function turnstileSiteKey(): string {
  return process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() ?? '';
}

/** What the agency checks the token was issued for. */
export const TURNSTILE_ACTION = 'lead';

export const TURNSTILE_SCRIPT_SRC =
  'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=__jddTurnstileReady';

export interface TurnstileOptions {
  sitekey: string;
  action?: string;
  appearance?: 'always' | 'execute' | 'interaction-only';
  'refresh-expired'?: 'auto' | 'manual' | 'never';
  callback?: (token: string) => void;
  'expired-callback'?: () => void;
  'error-callback'?: () => void;
}

export interface TurnstileApi {
  render(el: HTMLElement, options: TurnstileOptions): string | undefined;
  reset(widgetId?: string): void;
  remove(widgetId?: string): void;
  getResponse(widgetId?: string): string | undefined;
}

type TurnstileWindow = Window & { turnstile?: TurnstileApi; __jddTurnstileReady?: () => void };

let loading: Promise<TurnstileApi | null> | null = null;

/**
 * The Turnstile API, loading its script the first time any form asks. Null if it can't load
 * in 10 seconds (blocked, offline): the form still submits, without a token, and the server
 * answers with message A so the visitor knows to phone.
 */
export function loadTurnstile(): Promise<TurnstileApi | null> {
  const w = globalThis.window as TurnstileWindow | undefined;
  if (!w) return Promise.resolve(null);
  if (w.turnstile) return Promise.resolve(w.turnstile);
  if (loading) return loading;
  loading = new Promise<TurnstileApi | null>((resolve) => {
    const done = () => resolve(w.turnstile ?? null);
    const timer = setTimeout(() => {
      loading = null;
      resolve(null);
    }, 10_000);
    w.__jddTurnstileReady = () => {
      clearTimeout(timer);
      done();
    };
    if (!document.querySelector(`script[src="${TURNSTILE_SCRIPT_SRC}"]`)) {
      const s = document.createElement('script');
      s.src = TURNSTILE_SCRIPT_SRC;
      s.async = true;
      s.defer = true;
      document.head.appendChild(s);
    }
  });
  return loading;
}

/**
 * One widget for one form. `containerRef` goes on an empty div; `takeToken()` gives the token
 * for this submission (waiting a few seconds if the widget is still working) or says the widget
 * couldn't run; `reset()` after a submission asks for a fresh one, because Cloudflare accepts each
 * token once.
 *
 * With no site key it renders nothing and `takeToken()` gives '', exactly the form as it was.
 */
export function useTurnstile(siteKey: string) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widget = useRef<{ api: TurnstileApi; id: string } | null>(null);
  const token = useRef('');
  /** The widget couldn't run: no script, refused to render, or reported an error. */
  const failed = useRef(false);
  const waiters = useRef<Array<(r: TurnstileResult) => void>>([]);

  useEffect(() => {
    if (!siteKey) return;
    let cancelled = false;
    let grace: ReturnType<typeof setTimeout> | undefined;
    const settle = (r: TurnstileResult) => {
      for (const w of waiters.current.splice(0)) w(r);
    };
    const deliver = (t: string) => {
      token.current = t;
      if (!t) return;
      failed.current = false;
      clearTimeout(grace);
      settle({ token: t, widgetError: false });
    };
    // Turnstile retries after an error by itself, so a waiting submission gets a moment for the
    // retry to produce a token before it goes without one.
    const fail = () => {
      token.current = '';
      failed.current = true;
      clearTimeout(grace);
      grace = setTimeout(() => settle({ token: '', widgetError: true }), FAILED_GRACE_MS);
    };
    loadTurnstile().then((api) => {
      const el = containerRef.current;
      if (cancelled || !el) return;
      if (!api) return fail();
      let id: string | undefined;
      try {
        id = api.render(el, {
          sitekey: siteKey,
          action: TURNSTILE_ACTION,
          appearance: 'interaction-only',
          'refresh-expired': 'auto',
          callback: deliver,
          'expired-callback': () => deliver(''),
          'error-callback': fail,
        });
      } catch {
        // Cloudflare throws for a site key it doesn't know, or a host not on the widget.
        return fail();
      }
      if (id === undefined) return fail();
      widget.current = { api, id };
    });
    return () => {
      cancelled = true;
      clearTimeout(grace);
      if (widget.current) widget.current.api.remove(widget.current.id);
      widget.current = null;
    };
  }, [siteKey]);

  const takeToken = useCallback(
    (waitMs = 8000): Promise<TurnstileResult> => {
      if (!siteKey) return Promise.resolve({ token: '', widgetError: false });
      const ready = token.current || (widget.current && widget.current.api.getResponse(widget.current.id)) || '';
      if (ready) return Promise.resolve({ token: ready, widgetError: false });
      return new Promise((resolve) => {
        const finish = (r: TurnstileResult) => {
          clearTimeout(timer);
          resolve(r);
        };
        // No token in time is the same as a widget that couldn't run: the lead still goes.
        const timer = setTimeout(() => {
          waiters.current = waiters.current.filter((w) => w !== finish);
          resolve({ token: '', widgetError: true });
        }, failed.current ? FAILED_GRACE_MS : waitMs);
        waiters.current.push(finish);
      });
    },
    [siteKey],
  );

  const reset = useCallback(() => {
    token.current = '';
    if (widget.current) widget.current.api.reset(widget.current.id);
  }, []);

  return { containerRef, takeToken, reset };
}

/**
 * What a submission carries from the widget. `widgetError` means it couldn't produce a token
 * (most often: this host isn't on the site's widget, so Cloudflare refuses to render it). The form
 * then posts `turnstileStatus: 'error'`, and the agency keeps the lead without placing a call
 * (operator decision, 2026-11-09: never lose a lead). The visitor sees nothing different.
 */
export interface TurnstileResult {
  token: string;
  widgetError: boolean;
}

const FAILED_GRACE_MS = 1500;

/**
 * The words for a submission that didn't go through. A and B were approved word for word by
 * the operator on 2026-11-09; don't reword them without sign-off. The route answers 403
 * `not-verified` for a failed human check and 429 `too-many` for one visitor sending again and
 * again; anything else is the general failure the form always had.
 */
export const LEAD_FORM_NOT_VERIFIED =
  "We couldn't confirm this was sent by a person. Please try again, or call us directly.";
export const LEAD_FORM_TOO_MANY =
  'This form was sent several times in a short while. Please wait a few minutes and try again, or call us directly.';
export const LEAD_FORM_FAILED = "That didn't send. Please try again, or call us directly.";

export function leadFormErrorMessage(status: number, body: unknown): string {
  const error = body && typeof body === 'object' ? (body as { error?: unknown }).error : undefined;
  if (status === 403 && error === 'not-verified') return LEAD_FORM_NOT_VERIFIED;
  if (status === 429 && error === 'too-many') return LEAD_FORM_TOO_MANY;
  return LEAD_FORM_FAILED;
}

/**
 * The honeypot: an input no person sees or reaches, named so browsers don't autofill it. A
 * filled one goes to the route as `jdd_hp`, which quietly drops the submission. It is not
 * the human check, only a free filter for the crudest scripts before one costs a verification.
 */
export const HONEYPOT_FIELD = 'jdd_hp';
