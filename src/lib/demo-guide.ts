/**
 * The guidance banner in the public demo: one line for whichever screen the
 * visitor is on, so it follows the flow as steps are added or skipped (the
 * platform question, who's staying, the register, extra adults, photos).
 * Pure, so it can be unit tested.
 */

import { guest as copy } from "@/content/copy";
import { formatUkDate } from "./dates";

export type DemoHint = {
  letter: string;
  name?: string;
  checkOut: string;
  channel: string;
  refLast4: string | null;
  phoneLast4: string | null;
};

/** The parts of a check-in screen the banner needs to know about. */
export type DemoStep =
  | {
      name:
        | "welcome"
        | "letter"
        | "checkout"
        | "platform"
        | "no_match"
        | "guestName"
        | "confirm"
        | "party";
    }
  | { name: "register" | "face" | "handover" | "done" | "locked" | "waiting" }
  | { name: "pick"; items: Array<{ label: string }> }
  | { name: "identity"; method: "photo_id" | "last4" | "self_declare"; consented: boolean }
  | { name: "companion"; ready: boolean };

export function demoLine(step: DemoStep, hint: DemoHint, platform: string): string | null {
  const d = copy.demo;
  const date = formatUkDate(hint.checkOut);
  switch (step.name) {
    case "welcome":
      return d.welcome(hint.name || `the guest whose surname starts with ${hint.letter}`);
    case "letter":
      return d.letter(hint.letter);
    case "checkout":
      return d.checkout(date);
    case "platform":
      return d.platform(platform);
    case "pick": {
      const mine =
        step.items.find((i) => i.label.toUpperCase().endsWith(` ${hint.letter}.`)) ?? step.items[0];
      return mine ? d.pick(mine.label) : null;
    }
    case "no_match":
      return d.noMatch(hint.letter, date);
    case "guestName":
      return d.guestName;
    case "confirm":
      return d.confirm;
    case "party":
      return d.party;
    case "identity":
      return step.method === "photo_id"
        ? step.consented
          ? d.idCamera
          : d.idConsent
        : step.method === "last4"
          ? d.last4(hint.refLast4, hint.phoneLast4)
          : d.selfDeclare;
    case "register":
      return d.register;
    case "companion":
      return step.ready ? d.companionCamera : d.companionReady;
    case "face":
      return d.face;
    case "handover":
      return d.handover;
    case "done":
      return d.done;
    default:
      return null;
  }
}
