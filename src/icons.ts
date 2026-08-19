import type { Icon } from '@phosphor-icons/react';
import {
  Wrench, Hammer, Screwdriver, Toolbox, GearSix, Ruler, HardHat,
  Drop, DropSimple, Pipe, Wind, Snowflake, Thermometer, Fire, Lightning, Plug, Lightbulb,
  Broom, Sparkle, PaintBrush, PaintRoller, PaintBucket,
  Tree, Leaf, Plant, Scissors, Bug,
  House, Buildings, Door, Key, Stairs,
  ShieldCheck, SealCheck, Certificate, Medal, Star, Clock, Tag,
  Phone, CalendarBlank, MapPin, Truck, Car, Recycle, Heartbeat, FirstAid,
} from '@phosphor-icons/react';

// ONE icon registry for schema-driven catalog icons (service items, about pillars). It
// replaces four verbatim-duplicated lookup maps (ServicesGrid/ServicesAccordion/
// ServicesSpotlight TAG_ICONS + AboutPillars/AboutStatBand/AboutStory ICON_MAP — several of
// those variants were pruned in the 2026-08-19 catalog cut; the registry outlived them).
//
// This file is COPIED VERBATIM into client repos at export (template/src/lib/icons.ts is
// its twin), because catalog components import from `@/lib/icons`. Keep it pure data — no
// editing scaffolding, no console-only imports — so the two copies stay identical.

// Curated for home-services trades. Keys are stable identifiers stored in the schema's
// `icon` field; they are also what the picker lists. ~40 entries fit a small popup.
export const ICON_REGISTRY: Record<string, Icon> = {
  wrench: Wrench, hammer: Hammer, screwdriver: Screwdriver, toolbox: Toolbox,
  gear: GearSix, ruler: Ruler, hardhat: HardHat,
  drop: Drop, faucet: DropSimple, pipe: Pipe,
  wind: Wind, snowflake: Snowflake, thermometer: Thermometer, fire: Fire,
  lightning: Lightning, plug: Plug, lightbulb: Lightbulb,
  broom: Broom, sparkle: Sparkle,
  paintbrush: PaintBrush, paintroller: PaintRoller, paintbucket: PaintBucket,
  tree: Tree, leaf: Leaf, plant: Plant, scissors: Scissors, bug: Bug,
  house: House, buildings: Buildings, door: Door, key: Key, stairs: Stairs,
  shield: ShieldCheck, seal: SealCheck, certificate: Certificate, medal: Medal,
  star: Star, clock: Clock, tag: Tag,
  phone: Phone, calendar: CalendarBlank, pin: MapPin,
  truck: Truck, car: Car, recycle: Recycle, heart: Heartbeat, firstaid: FirstAid,
};

/** Ordered keys for the picker grid. */
export const ICON_PICKER_KEYS: string[] = Object.keys(ICON_REGISTRY);

/**
 * Service `tag` words → registry keys, used when content has no explicit `icon`.
 *
 * A MISSING ENTRY IS SILENT: `serviceIcon` falls through to `Wrench`, so the card still
 * renders, just with the wrong picture. That is exactly what happened. This table carried
 * no HVAC vocabulary despite `hvac` being a supported vertical in VERTICAL_PRESETS — the
 * e2e client's tags are Heating, Cooling, Air Quality, Heat Pump and Emergency, none of
 * which matched, and "Maintenance" matched but also resolved to wrench. All seven service
 * cards rendered the identical wrench. It passed every typecheck, build and Lighthouse run
 * and was only caught by looking at a screenshot.
 *
 * Keys must exist in ICON_REGISTRY above. When adding a vertical to VERTICAL_PRESETS, add
 * its tag vocabulary here as well.
 */
const TAG_ALIASES: Record<string, string> = {
  // generic trades
  cleaning: 'broom', electrical: 'lightning', plumbing: 'drop', painting: 'paintbrush',
  landscaping: 'tree', construction: 'hardhat', roofing: 'hardhat',
  flooring: 'house', trimming: 'scissors', carpentry: 'hammer',
  general: 'wrench', repair: 'wrench', maintenance: 'gear',
  installation: 'toolbox', inspection: 'certificate', emergency: 'lightning',
  // hvac
  hvac: 'wind', heating: 'fire', furnace: 'fire', boiler: 'fire',
  cooling: 'snowflake', ac: 'snowflake', 'air conditioning': 'snowflake',
  'heat pump': 'thermometer', thermostat: 'thermometer',
  'air quality': 'wind', ventilation: 'wind', ducts: 'wind', 'duct cleaning': 'wind',
  // plumbing / water
  drains: 'pipe', 'water heater': 'fire', leaks: 'faucet', sewer: 'pipe',
};

function lookup(key: string | undefined | null): Icon | null {
  if (!key) return null;
  return ICON_REGISTRY[key] ?? null;
}

/**
 * Service item icon. Resolution: explicit `icon` field → legacy `tag`-word alias → Wrench.
 * Matches the old `TAG_ICONS[...] ?? Wrench` behaviour when `icon` is unset.
 */
export function serviceIcon(icon: string | undefined, tag: string | undefined): Icon {
  return lookup(icon) ?? lookup(TAG_ALIASES[(tag ?? '').toLowerCase()]) ?? Wrench;
}

/**
 * Pillar icon. Resolution: explicit `icon` field → legacy `k` key (shield/clock/tag/star are
 * registry keys directly) → null (pillars render nothing when unmatched, as before).
 */
export function pillarIcon(icon: string | undefined, k: string | undefined): Icon | null {
  return lookup(icon) ?? lookup((k ?? '').toLowerCase());
}
