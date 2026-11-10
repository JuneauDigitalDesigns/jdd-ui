import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

/**
 * The lead form's human check (v1.5.0), driven in a DOM.
 *
 * What shipped before: nothing stopped a script posting the form at will, and a refused
 * submission had no words of its own. The server is the real gate; what this pins is the
 * browser's half: the token is posted, each form has its own widget, the script loads once
 * per page, a spent token is replaced, and a refusal shows the approved words.
 *
 * Cloudflare's script never loads here. `window.turnstile` is a stand-in with the same API.
 */

const dom = new JSDOM('<!doctype html><head></head><body></body>', { url: 'https://acme.example/' });
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  location: dom.window.location,
  IS_REACT_ACT_ENVIRONMENT: true,
});

const { act, createElement: h } = await import('react');
const { createRoot } = await import('react-dom/client');
const { LeadForm } = await import('../src/LeadForm.tsx');
const { LEAD_FORM_NOT_VERIFIED, LEAD_FORM_TOO_MANY, LEAD_FORM_FAILED, TURNSTILE_SCRIPT_SRC, loadTurnstile } =
  await import('../src/turnstile.ts');

/** Cloudflare's widget API. `auto` hands each widget a token as soon as it renders. */
function fakeTurnstile({ auto = true } = {}) {
  const widgets = [];
  return {
    widgets,
    render(el, opts) {
      const w = { el, opts, n: 0, resets: 0 };
      widgets.push(w);
      if (auto) opts.callback(`tok-${widgets.length}-${++w.n}`);
      return String(widgets.length - 1);
    },
    reset(id) {
      const w = widgets[Number(id)];
      w.resets++;
      if (auto) setTimeout(() => w.opts.callback(`tok-${Number(id) + 1}-${++w.n}`), 0);
    },
    remove() {},
    getResponse() {
      return undefined;
    },
  };
}

let posts;
let respond;
let root;
let container;
const realFetch = globalThis.fetch;

beforeEach(() => {
  posts = [];
  respond = () => Response.json({ ok: true });
  process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = '0x4AAAAAAAtestsitekey';
  dom.window.turnstile = fakeTurnstile();
  globalThis.fetch = async (url, init) => {
    posts.push({ url, body: JSON.parse(init.body) });
    return respond(posts.length);
  };
  container = dom.window.document.createElement('div');
  dom.window.document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  globalThis.fetch = realFetch;
  delete process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
});

const render = (el) => act(async () => root.render(el));
const form = (props = {}) => h(LeadForm, { mode: 'email', submitLabel: 'Go', ...props });

function type(scope, selector, value) {
  const el = scope.querySelector(selector);
  Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(el, value);
  el.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
}

async function fillAndSubmit(scope = container) {
  await act(async () => {
    type(scope, 'input[name="name"]', 'Dana');
    type(scope, 'input[name="email"]', 'dana@example.com');
  });
  await act(async () => {
    (scope.tagName === 'FORM' ? scope : scope.querySelector('form')).dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
    await new Promise((done) => setTimeout(done, 50));
  });
}

test('the widget is rendered for this site, for the lead action, invisible unless needed', async () => {
  await render(form());
  const [w] = dom.window.turnstile.widgets;
  assert.equal(w.opts.sitekey, '0x4AAAAAAAtestsitekey');
  assert.equal(w.opts.action, 'lead', 'the agency refuses a token issued for anything else');
  assert.equal(w.opts.appearance, 'interaction-only');
  assert.ok(container.querySelector('form').contains(w.el), 'inside its own form');
});

test("the widget's token is posted with the submission", async () => {
  await render(form());
  await fillAndSubmit();
  assert.equal(posts.length, 1);
  assert.equal(posts[0].body.turnstileToken, 'tok-1-1');
});

test('a submission made before the widget finishes waits for its token', async () => {
  dom.window.turnstile = fakeTurnstile({ auto: false });
  await render(form());
  const [w] = dom.window.turnstile.widgets;
  setTimeout(() => w.opts.callback('late-token'), 20);
  await fillAndSubmit();
  assert.equal(posts[0].body.turnstileToken, 'late-token');
});

test('a failed human check shows the approved words, and the retry carries a fresh token', async () => {
  respond = (n) => (n === 1 ? Response.json({ ok: false, error: 'not-verified' }, { status: 403 }) : Response.json({ ok: true }));
  await render(form());
  await fillAndSubmit();
  assert.equal(container.querySelector('[role="alert"]').textContent, LEAD_FORM_NOT_VERIFIED);
  assert.equal(
    LEAD_FORM_NOT_VERIFIED,
    "We couldn't confirm this was sent by a person. Please try again, or call us directly.",
    'approved word for word, 2026-11-09',
  );
  assert.equal(dom.window.turnstile.widgets[0].resets, 1, 'a spent token is replaced');

  await fillAndSubmit();
  assert.equal(posts[1].body.turnstileToken, 'tok-1-2');
  assert.notEqual(posts[1].body.turnstileToken, posts[0].body.turnstileToken);
});

test('too many tries shows the approved words', async () => {
  respond = () => Response.json({ ok: false, error: 'too-many' }, { status: 429 });
  await render(form());
  await fillAndSubmit();
  assert.equal(container.querySelector('[role="alert"]').textContent, LEAD_FORM_TOO_MANY);
  assert.equal(
    LEAD_FORM_TOO_MANY,
    'This form was sent several times in a short while. Please wait a few minutes and try again, or call us directly.',
    'approved word for word, 2026-11-09',
  );
});

test('any other failure keeps the words the form always had', async () => {
  respond = () => Response.json({ ok: false, error: 'Delivery failed' }, { status: 502 });
  await render(form());
  await fillAndSubmit();
  assert.equal(container.querySelector('[role="alert"]').textContent, LEAD_FORM_FAILED);
});

test('two forms on one page (hero and final CTA): two widgets, two tokens', async () => {
  await render(h('div', null, form({ key: 'hero' }), form({ key: 'cta' })));
  const forms = container.querySelectorAll('form');
  assert.equal(dom.window.turnstile.widgets.length, 2);
  await fillAndSubmit(forms[1]);
  assert.equal(posts[0].body.turnstileToken, 'tok-2-1', "the second form's own token");
});

test('the script is added once per page, however many forms ask', async () => {
  delete dom.window.turnstile;
  const a = loadTurnstile();
  const b = loadTurnstile();
  assert.equal(a, b);
  assert.equal(dom.window.document.querySelectorAll(`script[src="${TURNSTILE_SCRIPT_SRC}"]`).length, 1);
  dom.window.turnstile = fakeTurnstile();
  dom.window.__jddTurnstileReady();
  assert.equal(await a, dom.window.turnstile);
});

test('a site without a key renders no widget and posts no token, as before', async () => {
  delete process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  await render(form());
  assert.equal(dom.window.turnstile.widgets.length, 0);
  await fillAndSubmit();
  assert.deepEqual(posts[0].body, { name: 'Dana', email: 'dana@example.com' });
});

test('the honeypot is out of reach, and posted only when something filled it', async () => {
  await render(form());
  const hp = container.querySelector('input[name="jdd_hp"]');
  assert.equal(hp.tabIndex, -1);
  assert.equal(hp.getAttribute('autocomplete'), 'off');
  assert.equal(hp.closest('[aria-hidden="true"]') !== null, true);
  await fillAndSubmit();
  assert.equal('jdd_hp' in posts[0].body, false);

  await act(async () => root.unmount());
  root = createRoot(container);
  await render(form());
  await act(async () => type(container, 'input[name="jdd_hp"]', 'http://spam.example'));
  await fillAndSubmit();
  assert.equal(posts[1].body.jdd_hp, 'http://spam.example');
});

/* ── the widget can't run (v1.6.0) ─────────────────────────────────────────────
 * Cloudflare refuses to render a widget on a host that isn't on it (error 110200). The form then
 * had no token and posted as if it had never had a check, and the agency refused the lead. It now
 * says the check couldn't run, and the agency keeps the lead without placing a call
 * (operator decision, 2026-11-09: never lose a lead).
 */

/** A failed widget gets 1.5 s to recover by itself before the submission goes without a token. */
const afterGrace = () => act(async () => new Promise((r) => setTimeout(r, 1700)));

test("the widget reports an error: the submission says so, with no token", async () => {
  dom.window.turnstile = fakeTurnstile({ auto: false });
  await render(form());
  const [w] = dom.window.turnstile.widgets;
  w.opts['error-callback']();
  await fillAndSubmit();
  await afterGrace();
  assert.equal(posts[0].body.turnstileStatus, 'error');
  assert.equal('turnstileToken' in posts[0].body, false);
});

test("the widget can't even render: the submission says so", async () => {
  dom.window.turnstile = { ...fakeTurnstile(), render: () => { throw new Error('110200'); } };
  await render(form());
  await fillAndSubmit();
  await afterGrace();
  assert.equal(posts[0].body.turnstileStatus, 'error');
});

test('a widget that errored and then recovered posts its token, not the error', async () => {
  dom.window.turnstile = fakeTurnstile({ auto: false });
  await render(form());
  const [w] = dom.window.turnstile.widgets;
  w.opts['error-callback']();
  w.opts.callback('recovered');
  await fillAndSubmit();
  assert.equal(posts[0].body.turnstileToken, 'recovered');
  assert.equal('turnstileStatus' in posts[0].body, false);
});

test('a working widget never posts an error status', async () => {
  await render(form());
  await fillAndSubmit();
  assert.equal('turnstileStatus' in posts[0].body, false);
});
