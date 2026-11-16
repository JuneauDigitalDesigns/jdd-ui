import { test } from 'node:test';
import assert from 'node:assert/strict';

import { paletteVars, contrast } from '../src/palette.ts';

// The bug this encodes (measured 2026-11-15 on the rendered HVAC template): the hero's "today." and
// the final CTA's "the same day you call." are accent-coloured words on the dark band, and they used
// `--accent-text`, which is the accent darkened for a LIGHT ground. On Northstar that is #b34f26 on the
// navy band: 2.2:1. Every HVAC palette failed the same way. `--accent-on-ink` is the accent made
// legible on the dark bands instead.

const typo = { fontSans: 'x', fontHeading: 'x', headingWeight: 600, bodyWeight: 400 };
const brand = (palette) => ({ palette, typography: typo });

const NORTHSTAR = { accent: '#C84B1A', accentFg: '#FFFFFF', accent2: '#1E3A5F', bg: '#FFFFFF', bgSoft: '#F4F6F8', ink: '#13293F', inkSoft: '#4C5E74', rule: '#E2E8F0' };
const NORTHSTAR_OLD = { ...NORTHSTAR, accent: '#E0602C' };
const GLACIER = { accent: '#0E7490', accentFg: '#FFFFFF', accent2: '#12355B', bg: '#FFFFFF', bgSoft: '#EEF5F8', ink: '#0C2233', inkSoft: '#486070', rule: '#D9E6EC' };
const EVERGREEN = { accent: '#15803D', accentFg: '#FFFFFF', accent2: '#1F3B2E', bg: '#FFFFFF', bgSoft: '#F0F5F1', ink: '#11231A', inkSoft: '#4A5E52', rule: '#DAE5DD' };
const CHAMPAGNE = { accent: '#C9A14B', accentFg: '#0D0E12', accent2: '#3E5C82', bg: '#0D0E12', bgSoft: '#14161C', ink: '#F2F4F8', inkSoft: '#A3ADBC', rule: '#262A33' };

for (const [name, p] of Object.entries({ NORTHSTAR, NORTHSTAR_OLD, GLACIER, EVERGREEN, CHAMPAGNE })) {
  test(`${name}: --accent-on-ink clears AA on both dark bands`, () => {
    const v = paletteVars(brand(p));
    const on = v['--accent-on-ink'];
    assert.ok(on, '--accent-on-ink is emitted');
    for (const band of ['--ink-panel', '--ink-panel-2']) {
      const r = contrast(on, v[band]);
      assert.ok(r >= 4.5, `${on} on ${band} ${v[band]} is ${r.toFixed(2)}:1`);
    }
  });
}

test('the old token really failed there (so this test can fail)', () => {
  const v = paletteVars(brand(NORTHSTAR_OLD));
  assert.ok(contrast(v['--accent-text'], v['--ink-panel']) < 3);
});

test('an accent already legible on the dark band is left as authored', () => {
  const v = paletteVars(brand(CHAMPAGNE));
  assert.equal(v['--accent-on-ink'].toLowerCase(), CHAMPAGNE.accent.toLowerCase());
});

test('--accent-on-ink stays recognisably the accent (it only lightens as far as it must)', () => {
  const v = paletteVars(brand(GLACIER));
  // Lightening stops at the first passing step, so it is never the plain readable fallback.
  assert.notEqual(v['--accent-on-ink'].toLowerCase(), '#fbf8f4');
});
