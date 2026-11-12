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

/** Area fills (rgba only: older tablet browsers draw /opacity colours solid). */
export const AREA_FILL: Record<string, string> = {
  shared: "rgba(37,99,235,0.10)",
  guest_room: "rgba(100,116,139,0.10)",
  private: "url(#lk-private)",
  yours: "rgba(22,163,74,0.30)",
};
