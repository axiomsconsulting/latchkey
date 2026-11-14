/** How floor maps are drawn: item icons, line looks and area fills (FloorMapView, the editor). */
import {
  Archive,
  Coffee,
  CookingPot,
  Cross,
  Droplet,
  FireExtinguisher,
  Flame,
  Heater,
  Microwave,
  Refrigerator,
  Sandwich,
  Shirt,
  Snowflake,
  Soup,
  Thermometer,
  Trash2,
  Utensils,
  WashingMachine,
  Wine,
  Zap,
  type LucideIcon,
} from "lucide-react";

import type { ItemKind } from "@/lib/floor-map";

/** An icon for each kind of item on a floor map (floor-map.ts ITEM_KINDS). */
export const ITEM_ICON: Record<ItemKind, LucideIcon> = {
  fridge: Refrigerator,
  freezer: Snowflake,
  microwave: Microwave,
  kettle: Coffee,
  toaster: Sandwich,
  hob: Flame,
  oven: CookingPot,
  sink: Droplet,
  dishwasher: Droplet,
  cutlery: Utensils,
  crockery: Soup,
  glasses: Wine,
  pans: CookingPot,
  washing_machine: WashingMachine,
  dryer: WashingMachine,
  iron: Shirt,
  thermostat: Thermometer,
  heater: Heater,
  boiler: Flame,
  fuse_box: Zap,
  stopcock: Droplet,
  first_aid: Cross,
  fire_extinguisher: FireExtinguisher,
  fire_blanket: Archive,
  bins: Trash2,
};

/** How each kind of line is drawn (stroke colour, width in px, dashes). */
export const LINE_LOOK: Record<string, { stroke: string; width: number; dash?: string }> = {
  door: { stroke: "#2563eb", width: 4 },
  opening: { stroke: "#2563eb", width: 3, dash: "2 4" },
  steps: { stroke: "#7c3aed", width: 5, dash: "1 3" },
  barred: { stroke: "#dc2626", width: 5 },
  curtain: { stroke: "#dc2626", width: 3, dash: "6 3" },
  private: { stroke: "#dc2626", width: 3, dash: "10 5" },
  stairs: { stroke: "#d97706", width: 5 },
  radiator: { stroke: "#ea580c", width: 6 },
};

/** Area fills (rgba only: older tablet browsers draw /opacity colours solid). Four clearly different looks: green yours, blue open, grey other guests', red-hatched private. */
export const AREA_FILL: Record<string, string> = {
  shared: "rgba(37,99,235,0.12)",
  /** On a guest's plan: everywhere they can go. */
  open: "rgba(37,99,235,0.30)",
  guest_room: "rgba(71,85,105,0.42)",
  private: "url(#lk-private)",
  yours: "rgba(22,163,74,0.55)",
};

/** Each look's outline, so the kinds stay apart where fills overlap the plan's own colours. */
export const AREA_STROKE: Record<string, { colour: string; width: number }> = {
  shared: { colour: "rgba(15,23,42,0.35)", width: 1 },
  open: { colour: "#1d4ed8", width: 2 },
  guest_room: { colour: "#475569", width: 1.5 },
  private: { colour: "#b91c1c", width: 1.5 },
  yours: { colour: "#15803d", width: 3 },
};
