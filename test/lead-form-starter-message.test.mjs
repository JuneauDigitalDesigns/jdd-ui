import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

/**
 * v1.8.0 (Xander, 2026-11-20): a Starter lead says what the visitor needs. "Right now, starter leads
 * land in the portal with no information at all." Every email-mode form (Starter's) now has a
 * required message box and a "Send" button. Phone mode (Growth and Enterprise, the AI callback) is
 * exactly as it was. The words are his, approved word for word on 2026-11-20:
 *   button "Send"; label "What do you need?"; placeholder "The job, where it is, and when you'd
 *   like it done."; empty error "Please tell us what you need."; the form heading's default
 *   "Tell us what you need" (the heading itself is the catalog's, editable per site).
 */

const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://acme.example/' });
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  location: dom.window.location,
  IS_REACT_ACT_ENVIRONMENT: true,
});

const { act, createElement: h } = await import('react');
const { createRoot } = await import('react-dom/client');
const ui = await import('../src/LeadForm.tsx');
const { LeadForm } = ui;

let posts;
let root;
let container;
const realFetch = globalThis.fetch;

beforeEach(() => {
  posts = [];
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
});

const render = (props) => act(async () => root.render(h(LeadForm, { submitLabel: 'Book Online', ...props })));

function type(selector, value) {
  const el = container.querySelector(selector);
  const proto = el.tagName === 'TEXTAREA' ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
  el.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
}
const fill = (pairs) => act(async () => { for (const [s, v] of pairs) type(s, v); });
const submit = () =>
  act(async () => {
    container.querySelector('form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
    await new Promise((done) => setTimeout(done, 100));
  });
const text = () => container.textContent.replace(/\s+/g, ' ');
const box = () => container.querySelector('textarea[name="message"]');
const button = () => container.querySelector('button[type="submit"]');

test('the approved words, exported for the catalog to use too', () => {
  assert.equal(ui.STARTER_SUBMIT_LABEL, 'Send');
  assert.equal(ui.STARTER_FORM_HEADING, 'Tell us what you need');
  assert.equal(ui.STARTER_MESSAGE_LABEL, 'What do you need?');
  assert.equal(ui.STARTER_MESSAGE_PLACEHOLDER, "The job, where it is, and when you'd like it done.");
  assert.equal(ui.STARTER_MESSAGE_REQUIRED, 'Please tell us what you need.');
});

for (const layout of ['stack', 'row']) {
  test(`a Starter form (${layout}) has the message box, required, before a "Send" button`, async () => {
    await render({ mode: 'email', layout });
    const m = box();
    assert.ok(m, 'no message box');
    const label = container.querySelector(`label[for="${m.id}"]`);
    assert.equal(label.textContent.trim(), 'What do you need?');
    assert.equal(m.getAttribute('placeholder'), "The job, where it is, and when you'd like it done.");
    assert.equal(m.getAttribute('aria-required'), 'true');
    assert.equal(button().textContent.trim(), 'Send', 'the site\'s own CTA is not the Starter button');
    // The visitor fills the box before they reach the button.
    assert.ok(m.compareDocumentPosition(button()) & dom.window.Node.DOCUMENT_POSITION_FOLLOWING, 'the button comes before the box');
  });
}

test('a Starter form posts nothing without a message, and says so', async () => {
  await render({ mode: 'email' });
  await fill([['input[name="name"]', 'Dana'], ['input[name="email"]', 'dana@example.com']]);
  await submit();
  assert.equal(posts.length, 0);
  assert.match(text(), /Please tell us what you need\./);
  assert.equal(box().getAttribute('aria-invalid'), 'true');
  await fill([['textarea[name="message"]', '   ']]);
  await submit();
  assert.equal(posts.length, 0, 'blank space is no message');

  await fill([['textarea[name="message"]', 'Interior detail for an SUV, Winter Park, Saturday']]);
  await submit();
  assert.equal(posts.length, 1);
  assert.equal(posts[0].body.message, 'Interior detail for an SUV, Winter Park, Saturday');
  assert.equal(posts[0].body.email, 'dana@example.com');
});

test("a service page's prefill counts as the message, with nothing typed", async () => {
  await render({ mode: 'email', withMessage: true, initialMessage: 'Service: Ceramic Coating' });
  await fill([['input[name="name"]', 'Dana'], ['input[name="email"]', 'dana@example.com']]);
  await submit();
  assert.equal(posts.length, 1);
  assert.equal(posts[0].body.message, 'Service: Ceramic Coating');
});

test('a Growth form is as it was: no box unless asked for, its own button, the box optional and after it', async () => {
  await render({ mode: 'phone' });
  assert.equal(box(), null);
  assert.equal(button().textContent.trim(), 'Book Online');

  await render({ mode: 'phone', withMessage: true });
  const m = box();
  assert.equal(container.querySelector(`label[for="${m.id}"]`).textContent.replace(/\s+/g, ' ').trim(), 'What do you need? (optional)');
  assert.equal(m.getAttribute('placeholder'), null);
  assert.equal(m.getAttribute('aria-required'), null);
  assert.ok(button().compareDocumentPosition(m) & dom.window.Node.DOCUMENT_POSITION_FOLLOWING, 'the box moved');
});
