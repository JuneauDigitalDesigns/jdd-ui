// The row layout's button sits at the right end and is wider (Xander, 2026-11-26, on the car
// detailing hero: "the send button is all the way to the left when it should be all the way to the
// right. And it should be a little bit wider than it is.").
//
// What shipped: on the Starter and website plans the message is required, so the row puts the
// message box under the fields and the button on a line of its own, in a plain flex row with no
// justification: it sat at the left at its narrowest. The same row layout is used by the car
// detailing hero, the roofing booking band and the inline contact strip.
//
// Now the button's own line ends at the right from sm up, and in the row the button has a minimum
// width on both plans. The stack layout is unchanged (its button already spans the form).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LeadForm } from '../src/LeadForm.tsx';

const render = (props) => renderToStaticMarkup(h(LeadForm, { submitLabel: 'Go', ...props }));
const classOf = (html, re) => (html.match(re)?.[1] ?? '').split(/\s+/).filter(Boolean);
const buttonClass = (html) => classOf(html, /<button type="submit"[^>]*class="([^"]*)"/);
/** The classes of the element that directly wraps the submit button. */
const wrapperOfButton = (html) => {
  const i = html.indexOf('<button type="submit"');
  const before = html.slice(0, i);
  const open = before.lastIndexOf('<div class="');
  return before.slice(open).match(/<div class="([^"]*)"/)[1].split(/\s+/);
};

test('with a required message (Starter, website), the row ends the button at the right from sm up', () => {
  const html = render({ mode: 'email', layout: 'row' });
  const wrap = wrapperOfButton(html);
  assert.ok(wrap.includes('sm:flex-row'), wrap.join(' '));
  assert.ok(wrap.includes('sm:justify-end'), `the button's line ends at the right: ${wrap.join(' ')}`);
});

test('in the row the button is wider on every plan', () => {
  for (const mode of ['email', 'phone']) {
    const cls = buttonClass(render({ mode, layout: 'row' }));
    assert.ok(cls.some((c) => /^sm:min-w-\[\d+px\]$/.test(c)), `${mode}: ${cls.join(' ')}`);
  }
});

test('the stack layout keeps its full-width button and no row classes', () => {
  for (const mode of ['email', 'phone']) {
    const html = render({ mode, layout: 'stack' });
    assert.ok(!buttonClass(html).some((c) => c.startsWith('sm:min-w-')), mode);
    assert.ok(!wrapperOfButton(html).includes('sm:justify-end'), mode);
  }
});
