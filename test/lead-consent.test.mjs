import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import {
  LEAD_CALL_CONSENT_TEMPLATE,
  LEAD_CALL_CONSENT_VERSION,
  LEAD_SMS_CONSENT_TEXT,
  LEAD_SMS_CONSENT_VERSION,
  canonicalizeConsentText,
  hashLeadCallConsentText,
  hashLeadSmsConsentText,
  leadCallConsentText,
} from '../src/lead-consent-text.ts';
import {
  LeadForm,
  captureLeadCallConsent,
  captureLeadConsent,
  showsCallConsent,
  consentElementId,
  contactDescribedBy,
  contactErrorId,
  showsSmsDisclosure,
} from '../src/LeadForm.tsx';

/**
 * Regressions in the SMS-consent capture added in v1.3.0.
 *
 * Every case here is either a bug the LeadForm header comment says already shipped once, or
 * an invariant that is load-bearing for evidence rather than for looks. Nothing here checks
 * styling for its own sake.
 */

/* ── the frozen version → hash table ───────────────────────────────────────────
 * The one test that matters most, and the only one that fails on a *content* edit.
 *
 * A consent record is the answer to "what did this person actually see?", and it answers
 * with a version string and a hash. If the wording is edited without bumping the version,
 * every record already written silently starts claiming words that were never shown. This
 * table makes that edit impossible to make quietly:
 *
 *   - edit the wording, forget the bump  → the current version's hash no longer matches
 *   - edit the wording, bump the version → the new version is absent from the table
 *
 * Both are red, and both are fixed by a deliberate act: add the new row, keeping the old
 * one forever so historical records stay checkable. Never "fix" a failure here by editing
 * an existing row — that is the exact rewrite the table exists to prevent.
 * ───────────────────────────────────────────────────────────────────────────── */
const KNOWN_CONSENT_HASHES = {
  'lead-sms-consent-v1': '049b68b1a2e396a1d237fdb57198a885e75b14675336357c418591f6801b4726',
  // The hash of the template, `{business}` included: each site renders its own name.
  'lead-call-consent-v1': '6524672d2aacdcdaae2dc9ac9b3dcb939491d150c39122b888aa647685fadbd1',
};

test('the shipped wording matches its recorded version and hash', async () => {
  assert.ok(
    LEAD_SMS_CONSENT_VERSION in KNOWN_CONSENT_HASHES,
    `${LEAD_SMS_CONSENT_VERSION} is not in KNOWN_CONSENT_HASHES. If you changed the wording ` +
      'and bumped the version, add a row for the new version rather than editing an old one.',
  );
  assert.equal(
    await hashLeadSmsConsentText(),
    KNOWN_CONSENT_HASHES[LEAD_SMS_CONSENT_VERSION],
    `The wording changed but ${LEAD_SMS_CONSENT_VERSION} did not. Bump ` +
      'LEAD_SMS_CONSENT_VERSION in the same commit, or every consent record already ' +
      'written claims words that were never shown.',
  );
});

test('the hash is stable, reflow-proof, and sensitive to real edits', async () => {
  const once = await hashLeadSmsConsentText();
  assert.match(once, /^[0-9a-f]{64}$/);
  assert.equal(await hashLeadSmsConsentText(), once, 'same input, same hash across runs');

  // Reflowing the concatenated literals to fit the line limit is an edit nobody thinks of
  // as an edit. It must not change the hash of words that did not change.
  const reflowed = LEAD_SMS_CONSENT_TEXT.replace(/ /g, '\n      ');
  assert.equal(await hashLeadSmsConsentText(reflowed), once, 'whitespace is canonicalised');

  // But the canonicalisation must not be so eager that it hides a real change.
  assert.notEqual(
    await hashLeadSmsConsentText(LEAD_SMS_CONSENT_TEXT.replace('STOP', 'QUIT')),
    once,
    'changed words change the hash',
  );
});

test('the canonical text is already canonical, so what renders is what is hashed', () => {
  // If this drifts, the rendered element shows one string and the hash covers another.
  assert.equal(canonicalizeConsentText(LEAD_SMS_CONSENT_TEXT), LEAD_SMS_CONSENT_TEXT);
});

test('the disclosure carries the four parts a carrier looks for', () => {
  const t = LEAD_SMS_CONSENT_TEXT;
  assert.match(t, /STOP/, 'opt-out keyword');
  assert.match(t, /HELP/, 'help keyword');
  assert.match(t, /rates may apply/i, 'rates notice');
  assert.match(t, /frequency/i, 'frequency notice');
});

/* ── never evidence words that were not shown ───────────────────────────────── */

test('consent is captured only when the disclosure was shown', async () => {
  assert.equal(
    await captureLeadConsent(false),
    null,
    'no disclosure means no consent object — a hash of unseen words is manufactured evidence',
  );

  const consent = await captureLeadConsent(true);
  assert.deepEqual(
    Object.keys(consent).sort(),
    ['basis', 'capturedAt', 'textHash', 'textVersion'],
    'exactly the four keys PLAN-portal-form-capture.md §3 reserves, no extras',
  );
  assert.equal(consent.basis, 'web-form');
  assert.equal(consent.textVersion, LEAD_SMS_CONSENT_VERSION);
  assert.equal(consent.textHash, KNOWN_CONSENT_HASHES[LEAD_SMS_CONSENT_VERSION]);
  assert.equal(new Date(consent.capturedAt).toISOString(), consent.capturedAt, 'ISO 8601');
});

test('only a form collecting a number discloses anything about texting it', () => {
  assert.equal(showsSmsDisclosure('phone'), true);
  assert.equal(
    showsSmsDisclosure('email'),
    false,
    'email mode collects no number: the sentence would describe a field that is not there',
  );
});

/* ── aria-describedby: append, never replace ────────────────────────────────── */

test('an invalid phone field keeps its error id alongside the disclosure', () => {
  const both = contactDescribedBy({
    uid: 'u',
    showContactErr: true,
    showsDisclosure: true,
    consentMode: 'notice',
  });
  assert.ok(
    both.split(' ').includes(contactErrorId('u')),
    'wiring the disclosure in by REPLACING aria-describedby re-introduces bug 3 from the ' +
      'header comment: an invalid field with no error tied to it',
  );
  assert.ok(both.split(' ').includes(consentElementId('u')));
  assert.equal(
    both,
    `${contactErrorId('u')} ${consentElementId('u')}`,
    'error announced first, being the more urgent of the two',
  );
});

test('aria-describedby holds only what applies', () => {
  const d = (o) => contactDescribedBy({ uid: 'u', ...o });
  assert.equal(
    d({ showContactErr: false, showsDisclosure: true, consentMode: 'notice' }),
    consentElementId('u'),
  );
  assert.equal(
    d({ showContactErr: true, showsDisclosure: false, consentMode: 'notice' }),
    contactErrorId('u'),
  );
  assert.equal(
    d({ showContactErr: false, showsDisclosure: false, consentMode: 'notice' }),
    undefined,
    'undefined, not an empty string — React must omit the attribute entirely',
  );
  assert.equal(
    d({ showContactErr: false, showsDisclosure: true, consentMode: 'checkbox' }),
    undefined,
    'in checkbox mode the text is the checkbox own <label>; describing the input with it ' +
      'too would read it out twice',
  );
});

/* ── the rendered component ─────────────────────────────────────────────────── */

const render = (props) =>
  renderToStaticMarkup(h(LeadForm, { submitLabel: 'Go', mode: 'phone', ...props }));

for (const surface of ['light', 'dark']) {
  for (const layout of ['stack', 'row']) {
    for (const withMessage of [false, true]) {
      const name = `${surface}/${layout}/${withMessage ? 'withMessage' : 'noMessage'}`;
      test(`the disclosure is always visible — ${name}`, () => {
        const html = render({ surface, layout, withMessage });
        // The exact canonical string, not a paraphrase: this is what the hash covers.
        assert.ok(html.includes(LEAD_SMS_CONSENT_TEXT), 'canonical text is in the markup');
        // Not behind a tooltip or a collapsed section — someone who never opens one of
        // those has not been told anything.
        assert.ok(!html.includes('<details'), 'not collapsed behind <details>');
        assert.ok(!/title="[^"]*text you/.test(html), 'not hidden in a title tooltip');

        // The id aria-describedby points at must actually exist in the markup, or the
        // wiring is a dangling reference and nothing visibly breaks.
        const described = html.match(/aria-describedby="([^"]+)"/);
        assert.ok(described, 'the phone input is described by something');
        for (const id of described[1].split(' ')) {
          assert.ok(html.includes(`id="${id}"`), `aria-describedby target ${id} exists`);
        }
      });
    }
  }
}

test('email mode renders no SMS disclosure', () => {
  const html = render({ mode: 'email' });
  assert.ok(!html.includes(LEAD_SMS_CONSENT_TEXT));
  assert.ok(!/text you/.test(html), 'nothing about texting beside an email field');
});

test('the checkbox variant renders unticked, with a real label', () => {
  const html = render({ consentMode: 'checkbox' });
  assert.ok(html.includes('type="checkbox"'));
  assert.ok(
    !html.includes('checked'),
    'a pre-ticked box is not an affirmative act and is worth less than the notice it replaces',
  );
  assert.ok(html.includes(LEAD_SMS_CONSENT_TEXT), 'same canonical text as notice mode');
  // A placeholder is not an accessible name and neither is a bare <span>: bug 1 from the
  // header comment, which this component exists to have fixed.
  const forId = html.match(/<label for="([^"]*-consent)"/);
  assert.ok(forId, 'the checkbox has a <label for>');
  assert.ok(html.includes(`id="${forId[1]}"`), 'and it points at the checkbox');
});

/* ── consent to the AI callback ─────────────────────────────────────────────── */

test('the call-consent template matches its recorded version and hash', async () => {
  assert.ok(
    LEAD_CALL_CONSENT_VERSION in KNOWN_CONSENT_HASHES,
    `${LEAD_CALL_CONSENT_VERSION} is not in KNOWN_CONSENT_HASHES. Add a row; never edit one.`,
  );
  assert.equal(
    await hashLeadCallConsentText(LEAD_CALL_CONSENT_TEMPLATE),
    KNOWN_CONSENT_HASHES[LEAD_CALL_CONSENT_VERSION],
    'The wording changed without a version bump.',
  );
});

test('the callback box says it is an automated, AI-voiced, recorded call and names the business', () => {
  const t = leadCallConsentText('Acme Plumbing');
  assert.ok(t.startsWith('I agree that Acme Plumbing may call me back'));
  assert.match(t, /automated system/);
  assert.match(t, /AI-generated voice/);
  assert.match(t, /may be recorded/);
  assert.equal(canonicalizeConsentText(t), t, 'what renders is what is hashed');
});

test('a brand name cannot rewrite the wording', () => {
  assert.ok(leadCallConsentText('A$&B Co').includes('that A$&B Co may call'));
});

test('a callback form shows the box, unticked, with a real label', () => {
  process.env.NEXT_PUBLIC_BRAND_NAME = 'Acme Plumbing';
  try {
    for (const layout of ['stack', 'row']) {
      const html = renderToStaticMarkup(h(LeadForm, { submitLabel: 'Go', mode: 'phone', layout }));
      const input = html.match(/<input id="([^"]*-call-consent)"[^>]*>/);
      assert.ok(input, 'the box is rendered');
      assert.match(input[0], /type="checkbox"/);
      assert.doesNotMatch(input[0], /checked/, 'a pre-ticked box is not an affirmative act');
      assert.ok(html.includes(`<label for="${input[1]}"`), 'the box has a real label');
      assert.ok(
        html.includes(leadCallConsentText('Acme Plumbing').replace(/'/g, '&#x27;')),
        'the words naming the business are on screen',
      );
    }
  } finally {
    delete process.env.NEXT_PUBLIC_BRAND_NAME;
  }
});

test('the consent box is styled inline, because client sites do not generate classes from this package', () => {
  // On the growth fixture's real build, size-4 and accent-accent came out of Tailwind as nothing.
  const html = render({ mode: 'phone' });
  const input = html.match(/<input id="[^"]*-call-consent"[^>]*>/)[0];
  assert.match(input, /style="[^"]*width:16px/);
  assert.doesNotMatch(input, /class=/);
});

test('an email-mode (Starter or web-only) form has no box and no call wording', () => {
  assert.equal(showsCallConsent('email'), false);
  assert.equal(showsCallConsent('phone'), true);
  const html = render({ mode: 'email', withMessage: true });
  assert.ok(!html.includes('call-consent'));
  assert.ok(!html.includes('AI-generated'));
  assert.ok(!html.includes('type="checkbox"'));
});

test('call consent is posted only when ticked, and hashes the words shown', async () => {
  const text = leadCallConsentText('Acme Plumbing');
  assert.equal(await captureLeadCallConsent(false, text), null, 'no tick, no record');

  const consent = await captureLeadCallConsent(true, text);
  assert.deepEqual(Object.keys(consent).sort(), [
    'basis',
    'capturedAt',
    'pageUrl',
    'textHash',
    'textVersion',
  ]);
  assert.equal(consent.basis, 'web-form-checkbox');
  assert.equal(consent.textVersion, LEAD_CALL_CONSENT_VERSION);
  assert.equal(
    consent.textHash,
    '6681bc51390caa2572e46e96b6187a508492f12875f407609d8497ed8b441cfe',
    'the same hash /api/contact derives for this business in jdd-ops',
  );
});

/* ── things v1.3.0 must not have regressed ──────────────────────────────────── */

test('inputs keep the 16px font size that stops iOS zooming mid-form', () => {
  const html = render({ withMessage: true });
  // Below 16px, iOS Safari zooms the viewport on focus and yanks the page around.
  assert.ok(
    (html.match(/text-\[16px\]/g) ?? []).length >= 3,
    'both inputs and the textarea carry text-[16px]',
  );
});

test('every input still has a real label', () => {
  const html = render({ withMessage: true });
  const labelled = [...html.matchAll(/<label for="([^"]+)"/g)].map((m) => m[1]);
  const fields = [...html.matchAll(/<(?:input|textarea) id="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(fields.length >= 3, 'name, contact and message are rendered');
  for (const id of fields) {
    assert.ok(labelled.includes(id), `field ${id} has a <label for>`);
  }
});

test('initialMessage still seeds the textarea (added in v1.2.0)', () => {
  const html = render({ withMessage: true, initialMessage: 'Mow weekly' });
  assert.ok(html.includes('Mow weekly'));
});

test('two forms on one page do not share ids', () => {
  // A contact strip and a final CTA render together; hardcoded ids pointed every label at
  // the first form's inputs.
  const html = renderToStaticMarkup(
    h(
      'div',
      null,
      h(LeadForm, { submitLabel: 'A', mode: 'phone' }),
      h(LeadForm, { submitLabel: 'B', mode: 'phone' }),
    ),
  );
  const described = [...html.matchAll(/aria-describedby="([^"]*-consent)"/g)].map((m) => m[1]);
  assert.equal(described.length, 2, 'both forms describe their phone field');
  assert.notEqual(described[0], described[1], 'with different ids');
});
