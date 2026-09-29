import type { Provider } from "./services";

/**
 * Sample Contra freelancers around High Wycombe used in demo mode. Names and
 * profile links are illustrative, not real Contra accounts.
 */
const weekdays = [1, 2, 3, 4, 5];
const all = [0, 1, 2, 3, 4, 5, 6];

export const DEMO_PROVIDERS: Provider[] = [
  { id: "demo-bucks-housekeeping", name: "Bucks Housekeeping Co.", headline: "Turnovers, deep cleans and linen for small hosts", contraUrl: "https://contra.com/", categories: ["cleaning", "linen", "deep_clean", "bathroom"], rating: 4.9, reviews: 86, ratePence: 2200, rateUnit: "hour", responseMinutes: 90, workDays: all, startHour: 8, endHour: 20, verified: true },
  { id: "demo-wycombe-sparkle", name: "Wycombe Sparkle", headline: "Same-day room refresh and towel runs", contraUrl: "https://contra.com/", categories: ["cleaning", "linen"], rating: 4.6, reviews: 23, ratePence: 1800, rateUnit: "hour", responseMinutes: 45, workDays: all, startHour: 7, endHour: 22, verified: false },
  { id: "demo-amersham-plumbing", name: "Amersham Plumbing & Heating", headline: "Gas Safe engineer, boilers, leaks, hot water", contraUrl: "https://contra.com/", categories: ["plumbing", "heating", "bathroom", "boiler_service"], rating: 4.95, reviews: 132, ratePence: 6500, rateUnit: "callout", responseMinutes: 60, workDays: all, startHour: 7, endHour: 21, verified: true },
  { id: "demo-chiltern-heat", name: "Chiltern Heat Pro", headline: "Heating, air con and ventilation", contraUrl: "https://contra.com/", categories: ["heating", "aircon", "boiler_service"], rating: 4.7, reviews: 41, ratePence: 5500, rateUnit: "callout", responseMinutes: 120, workDays: weekdays, startHour: 8, endHour: 18, verified: true },
  { id: "demo-hp-sparks", name: "HP Sparks Electrical", headline: "NICEIC electrician, PAT testing, lighting", contraUrl: "https://contra.com/", categories: ["electrical", "appliance", "pat_testing"], rating: 4.8, reviews: 58, ratePence: 6000, rateUnit: "callout", responseMinutes: 90, workDays: [1, 2, 3, 4, 5, 6], startHour: 8, endHour: 19, verified: true },
  { id: "demo-fixit-ben", name: "Fix-It Ben", headline: "Handyman, appliances, flat-pack and small repairs", contraUrl: "https://contra.com/", categories: ["handyman", "appliance", "kitchenette", "bathroom"], rating: 4.75, reviews: 67, ratePence: 3500, rateUnit: "hour", responseMinutes: 120, workDays: [1, 2, 3, 4, 5, 6], startHour: 8, endHour: 18, verified: false },
  { id: "demo-hilltop-bakery", name: "Hilltop Bakery Baskets", headline: "Local breakfast baskets delivered to the door", contraUrl: "https://contra.com/", categories: ["breakfast"], rating: 4.9, reviews: 104, ratePence: 900, rateUnit: "job", responseMinutes: 30, workDays: all, startHour: 7, endHour: 11, verified: true },
  { id: "demo-chiltern-cycles", name: "Chiltern Cycle Hire", headline: "Hybrid and e-bikes delivered with helmets", contraUrl: "https://contra.com/", categories: ["cycle"], rating: 4.85, reviews: 49, ratePence: 1400, rateUnit: "job", responseMinutes: 60, workDays: all, startHour: 8, endHour: 18, verified: true },
  { id: "demo-wycombe-cars", name: "Wycombe Executive Cars", headline: "Airport runs and local taxis, fixed quotes", contraUrl: "https://contra.com/", categories: ["taxi", "luggage"], rating: 4.7, reviews: 212, ratePence: 1200, rateUnit: "job", responseMinutes: 20, workDays: all, startHour: 0, endHour: 24, verified: true },
  { id: "demo-bag-drop", name: "BagDrop High Wycombe", headline: "Luggage storage and station transfers", contraUrl: "https://contra.com/", categories: ["luggage"], rating: 4.5, reviews: 18, ratePence: 600, rateUnit: "job", responseMinutes: 45, workDays: all, startHour: 7, endHour: 21, verified: false },
  { id: "demo-latecheckout", name: "Bucks Housekeeping Co. (flex)", headline: "Shifts the room clean to allow late check-out", contraUrl: "https://contra.com/", categories: ["late_checkout"], rating: 4.9, reviews: 86, ratePence: 1100, rateUnit: "job", responseMinutes: 15, workDays: all, startHour: 11, endHour: 17, verified: true },
];
