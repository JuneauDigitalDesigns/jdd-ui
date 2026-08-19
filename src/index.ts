// @jdd/ui — the shared half of the catalog's shared code.
//
// SHIPPED AS SOURCE, NOT COMPILED. Unlike @jdd/schema (pure TypeScript + zod, built by
// `prepare`), this package contains a React client component. `'use client'` directives are
// routinely dropped or hoisted by a TypeScript emit, and Next requires the directive to
// survive in the published JS for a client component imported from node_modules — if it is
// lost, LeadForm silently becomes a server component and its useState throws at build time
// in every client repo. Shipping source and letting Next compile it via
// `transpilePackages: ['@jdd/ui']` removes that failure mode by construction.
//
// WHAT IS DELIBERATELY NOT HERE: `editable.tsx`. Its console and template versions are two
// different implementations, not a drifted copy — the console one is interactive, the
// template one is an inert passthrough, and that seam is the only thing keeping
// contentEditable and the icon picker out of production client sites. Unifying it would
// ship the studio's editing scaffolding to every client. See the comment in both copies.
//
// `typographyVars` is also absent for a similar reason: the console applies fonts to its
// preview subtree in a way a real site must not. The console keeps its own wrapper.

export * from './color';
export * from './palette';
export * from './skins';
export * from './motion';
export * from './icons';
export * from './img';
export * from './merge';
export * from './LeadForm';
