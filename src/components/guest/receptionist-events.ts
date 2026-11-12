/**
 * The ID's sex field, passed from the check-in flow to the receptionist on the same screen so
 * it can answer in the voice the host chose for that guest (receptionist.ts voiceForGuest).
 * Only ever an event on this page: never sent anywhere or kept.
 */
export const GUEST_SEX_EVENT = "lk-guest-sex";

export function tellGuestSex(sex: "M" | "F" | "X" | null | undefined) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(GUEST_SEX_EVENT, { detail: sex ?? null }));
}
