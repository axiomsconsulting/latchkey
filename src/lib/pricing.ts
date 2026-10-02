/** Latchkey subscription pricing. Pure, tested. */
export type PricingConfig = {
  base_pence: number; // first property incl. its first room
  extra_room_pence: number; // each further room in any property
  extra_property_pence: number; // each further property
  trial_days: number;
  currency: string;
};

export const DEFAULT_PRICING: PricingConfig = {
  base_pence: 100,
  extra_room_pence: 50,
  extra_property_pence: 100,
  trial_days: 30,
  currency: "GBP",
};

/** roomsPerProperty: one entry per property, each counting its rooms (min 1). */
export function monthlyPence(cfg: PricingConfig, roomsPerProperty: number[]): number {
  if (roomsPerProperty.length === 0) return 0;
  return roomsPerProperty.reduce((sum, rooms, i) => {
    const extraRooms = Math.max(0, Math.floor(rooms) - 1);
    return sum + (i === 0 ? cfg.base_pence : cfg.extra_property_pence) + extraRooms * cfg.extra_room_pence;
  }, 0);
}

export function money(pence: number, currency = "GBP"): string {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency, minimumFractionDigits: pence % 100 ? 2 : 0 }).format(pence / 100);
}
