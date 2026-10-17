import { Bath, BedDouble, BookOpen, CalendarX, Car, CarTaxiFront, DoorOpen, Footprints, LogOut, Moon, Phone, ScrollText, Utensils, type LucideIcon } from "lucide-react";

import type { BuiltInKey } from "@/lib/guide";

export const guestGuideIcons: Record<BuiltInKey, LucideIcon> = {
  getting_in: DoorOpen,
  shoes: Footprints,
  room: BedDouble,
  kitchenette: Utensils,
  bathroom: Bath,
  parking: Car,
  taxis: CarTaxiFront,
  rules: ScrollText,
  quiet: Moon,
  unavailable: CalendarX,
  checkout: LogOut,
  contact: Phone,
};

/** A section's icon; the host's own sections get a book. */
export function sectionIcon(key: string): LucideIcon {
  return (guestGuideIcons as Record<string, LucideIcon>)[key] ?? BookOpen;
}
