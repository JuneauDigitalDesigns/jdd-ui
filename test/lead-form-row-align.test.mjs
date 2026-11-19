// The row layout's button lines up with the input boxes (Xander, 2026-11-19, on the car detailing
// hero: "it should be in line with the name and email fields", not centred on the whole form).
//
// What shipped: the button was placed by `sm:mt-[26px]`, a guess at the label's height, and was
// 2px shorter than the inputs. Client sites never generated that class from this package, so the
// button sat at the top of the form, level with the labels. Even generated, its bottom edge missed
// the inputs', and a site with a taller body line height moved the labels and broke the guess.
//
// The row now aligns its items by their BOTTOM edge, the button and the inputs share one box (a
// 2px border, 12px padding and a 24px line, so 52px tall on every site), and a field's error goes
// below the row in this layout, so it can never push the button down.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LeadForm } from '../src/LeadForm.tsx';

const render = (props) => renderToStaticMarkup(h(LeadForm, { submitLabel: 'Go', mode: 'email', ...props }));
const classOf = (html, re) => (html.match(re)?.[1] ?? '').split(/\s+/);
const src = readFileSync(new URL('../src/LeadForm.tsx', import.meta.url), 'utf8');

test('the row aligns the button and the fields by their bottom edge, with no guessed offset', () => {
  const html = render({ layout: 'row' });
  const row = classOf(html, /<form[^>]*><div class="([^"]*)"/);
  assert.ok(row.includes('sm:flex-row') && row.includes('sm:items-end'), row.join(' '));
  assert.ok(!row.includes('sm:items-start'));
  const button = classOf(html, /<button type="submit"[^>]*class="([^"]*)"/);
  assert.ok(!button.some((c) => /^sm:mt-/.test(c)), `no top offset: ${button.join(' ')}`);
});

test('the button and the inputs share one box, so their edges meet at any body line height', () => {
  for (const layout of ['row', 'stack']) {
    const html = render({ layout });
    const button = classOf(html, /<button type="submit"[^>]*class="([^"]*)"/);
    const input = classOf(html, /<input id="[^"]*-name"[^>]*class="([^"]*)"/);
    for (const c of ['border-2', 'py-3', 'leading-6']) {
      assert.ok(button.includes(c), `${layout} button lacks ${c}`);
      assert.ok(input.includes(c), `${layout} input lacks ${c}`);
    }
    assert.ok(button.includes('border-transparent'), 'the button\'s border keeps its size, not a line');
  }
});

test('in the row, a field error sits below the row, never inside a field column', () => {
  // The errors only render after a field is touched, so the source is what can be checked here.
  assert.match(src, /\{layout === 'stack' && showNameErr && <span id=\{`\$\{uid\}-name-err`\}/);
  assert.match(src, /\{layout === 'stack' && showContactErr && \(/);
  assert.match(src, /\{layout === 'row' && \(showNameErr \|\| showContactErr\) && \(/);
});
