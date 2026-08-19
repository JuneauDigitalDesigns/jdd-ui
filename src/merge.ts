// Content layering utilities for the studio website-builder flow.
//
// The studio computes a single "effective" SiteContent from three layers:
//   effective = applyEdits( deepMerge(verticalPreset, importedJSON ?? {}), edits )
//
// - verticalPreset is the floor (industry fallback copy)
// - importedJSON overrides the preset, but only where it actually provides a value
// - edits (a flat { "a.b.0.c": value } map from inline editing + the Brand drawer) win last
//
// "Present" decides whether an override replaces the floor: null / "" / undefined / empty
// array are treated as missing, so the vertical fills those gaps.

/** A value the JSON/edit actually provides. Missing values fall through to the floor. */
export function isPresent(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === 'string') return v.trim() !== '';
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

function isPlainObject(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

/**
 * Deep-merge plain objects key by key. For arrays and primitives the override replaces the
 * base only when isPresent(override); otherwise the base value is kept. Never mutates inputs.
 */
export function deepMerge<T>(base: T, override: unknown): T {
  if (isPlainObject(base) && isPlainObject(override)) {
    const out: Record<string, unknown> = { ...base };
    const keys = new Set([...Object.keys(base), ...Object.keys(override)]);
    for (const k of keys) {
      const b = (base as Record<string, unknown>)[k];
      const o = (override as Record<string, unknown>)[k];
      if (k in override) {
        out[k] = deepMerge(b as unknown, o);
      } else {
        out[k] = b;
      }
    }
    return out as T;
  }
  // arrays + primitives: override wins only when it carries a real value
  return (isPresent(override) ? (override as T) : base);
}

function parseSegment(seg: string): string | number {
  return /^\d+$/.test(seg) ? Number(seg) : seg;
}

/** Read a nested value by dotted path, e.g. getPath(obj, "services.items.0.t"). */
export function getPath(obj: unknown, path: string): unknown {
  const segs = path.split('.').map(parseSegment);
  let cur: unknown = obj;
  for (const s of segs) {
    if (cur === null || cur === undefined) return undefined;
    cur = (cur as Record<string | number, unknown>)[s];
  }
  return cur;
}

/**
 * Immutably set a nested value by dotted path, cloning the objects/arrays along the way.
 * Numeric segments create/extend arrays; string segments create objects.
 */
export function setPath<T>(obj: T, path: string, value: unknown): T {
  const segs = path.split('.').map(parseSegment);

  function recurse(node: unknown, i: number): unknown {
    const seg = segs[i];
    const last = i === segs.length - 1;
    if (typeof seg === 'number') {
      const arr = Array.isArray(node) ? [...node] : [];
      arr[seg] = last ? value : recurse(arr[seg], i + 1);
      return arr;
    }
    const o: Record<string, unknown> = isPlainObject(node) ? { ...node } : {};
    o[seg] = last ? value : recurse(o[seg], i + 1);
    return o;
  }

  return recurse(obj, 0) as T;
}

/** Apply a flat { path: value } edit map on top of content, returning a new object. */
export function applyEdits<T>(content: T, edits: Record<string, unknown>): T {
  let out = content;
  for (const [path, value] of Object.entries(edits)) {
    out = setPath(out, path, value);
  }
  return out;
}
