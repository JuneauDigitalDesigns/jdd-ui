import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

/**
 * Drives the real form in a DOM, because the requirement is about a submit that doesn't happen,
 * and a static render can't show that: on a callback site nothing reaches /api/contact until the
 * AI-call box is ticked.
 */

const dom = new JSDOM('<!doctype html><body></body>', {
  url: 'https://acme.example/contact?utm_source=mail',
});
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  location: dom.window.location,
  IS_REACT_ACT_ENVIRONMENT: true,
});

const { act, createElement: h } = await import('react');
const { createRoot } = await import('react-dom/client');
const { LeadForm } = await import('../src/LeadForm.tsx');

let posts;
let root;
let container;
const realFetch = globalThis.fetch;

beforeEach(() => {
  posts = [];
  process.env.NEXT_PUBLIC_BRAND_NAME = 'Acme Plumbing';
  globalThis.fetch = async (url, init) => {
    posts.push({ url, body: JSON.parse(init.body) });
    return new Response('{"ok":true}', { status: 200 });
  };
  container = dom.window.document.createElement('div');
  dom.window.document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  globalThis.fetch = realFetch;
  delete process.env.NEXT_PUBLIC_BRAND_NAME;
});

const render = (props) =>
  act(async () => root.render(h(LeadForm, { submitLabel: 'Go', ...props })));

function type(selector, value) {
  const el = container.querySelector(selector);
  Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(el, value);
  el.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
}

const fill = (field, value) =>
  act(async () => {
    type('input[name="name"]', 'Dana');
    type(field, value);
  });

const submit = () =>
  act(async () => {
    container
      .querySelector('form')
      .dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
    // Hashing is real Web Crypto, which resolves outside the microtask queue. Long enough for
    // a submission to reach fetch, so a "nothing was posted" assertion means something.
    await new Promise((done) => setTimeout(done, 100));
  });

const tick = () => act(async () => container.querySelector('input[name="callConsent"]').click());

test('a callback form posts nothing until the box is ticked, and says why', async () => {
  await render({ mode: 'phone' });
  await fill('input[name="phone"]', '4075550188');
  await submit();

  assert.equal(posts.length, 0, 'an unticked box must stop the submission');
  assert.match(container.textContent, /Please tick this box so we can call you back\./);
  assert.equal(
    container.querySelector('input[name="callConsent"]').getAttribute('aria-invalid'),
    'true',
  );
});

test('once ticked, the proof is posted with the page but not its query string', async () => {
  await render({ mode: 'phone' });
  await fill('input[name="phone"]', '4075550188');
  await tick();
  await submit();

  assert.equal(posts.length, 1);
  const { callConsent, consent } = posts[0].body;
  assert.equal(callConsent.basis, 'web-form-checkbox');
  assert.equal(callConsent.textVersion, 'lead-call-consent-v1');
  assert.equal(callConsent.pageUrl, 'https://acme.example/contact');
  assert.equal(
    callConsent.textHash,
    '6681bc51390caa2572e46e96b6187a508492f12875f407609d8497ed8b441cfe',
    'the hash of the sentence naming this business',
  );
  assert.equal(consent.textVersion, 'lead-sms-consent-v1', 'the SMS record is unchanged');
});

test('a Starter or web-only form submits as before, with no box and no call consent', async () => {
  await render({ mode: 'email' });
  assert.equal(container.querySelector('input[name="callConsent"]'), null);
  await fill('input[name="email"]', 'dana@example.com');
  await submit();

  assert.equal(posts.length, 1);
  assert.deepEqual(posts[0].body, { name: 'Dana', email: 'dana@example.com' });
});
