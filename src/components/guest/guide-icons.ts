import { Bath, BedDouble, CalendarX, Car, CarTaxiFront, DoorOpen, Footprints, LogOut, Moon, Phone, ScrollText, Utensils, type LucideIcon } from "lucide-react";

import type { SectionKey } from "@/lib/guide";

export const guestGuideIcons: Record<SectionKey, LucideIcon> = {
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
