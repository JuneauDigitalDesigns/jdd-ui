// Pure hex color math for runtime tone derivation. No dependencies; safe on server + client.
function clamp(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '').trim();
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)];
}

export function rgbToHex(r: number, g: number, b: number): string {
  const h = (n: number) => clamp(n).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

/** Linear blend of two hex colors; t=0 → a, t=1 → b. */
export function mix(a: string, b: string, t: number): string {
  try {
    const [ar, ag, ab] = hexToRgb(a);
    const [br, bg, bb] = hexToRgb(b);
    return rgbToHex(ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t);
  } catch {
    return a;
  }
}

export const tint = (hex: string, t: number) => mix(hex, '#ffffff', t); // toward white
export const shade = (hex: string, t: number) => mix(hex, '#000000', t); // toward black

/** rgba() string from a hex + alpha, for glows / translucent rules. */
export function withAlpha(hex: string, a: number): string {
  try {
    const [r, g, b] = hexToRgb(hex);
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  } catch {
    return hex;
  }
}
