import { describe, expect, it } from "vitest";
import { splitLead } from "@/lib/guide-lead";

describe("a guide section's top line", () => {
  it("is the first line", () => {
    expect(splitLead("Quiet from 10pm.\nThanks for keeping it down.")).toEqual({ lead: "Quiet from 10pm.", rest: "Thanks for keeping it down." });
    expect(splitLead("Just this.")).toEqual({ lead: "Just this.", rest: "" });
    expect(splitLead(null)).toEqual({ lead: "", rest: "" });
  });
  it("is the first sentence of a long first line", () => {
    const long = "The front door has a keypad lock on the right. " + "Press the logo to wake it, then type your code and press the tick, and wait for the green light before you push the door open.";
    expect(splitLead(long)).toEqual({ lead: "The front door has a keypad lock on the right.", rest: "Press the logo to wake it, then type your code and press the tick, and wait for the green light before you push the door open." });
  });
});
