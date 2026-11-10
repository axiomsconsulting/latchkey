/**
 * A host's sample photo standing in for the camera (TestStayCard → kiosk ?test=): it plays out
 * what a guest does, so the host sees the same moments: held up at an angle and out of focus,
 * brought in line, sharpened, outlined, held still, then taken by itself. Pure; tested.
 */

export type SamplePhase = "tilt" | "align" | "focus" | "outline" | "hold" | "take";

/** When each moment starts, in ms from the screen opening. */
export const SAMPLE_STEPS: ReadonlyArray<[SamplePhase, number]> = [
  ["tilt", 0],
  ["align", 900],
  ["focus", 1900],
  ["outline", 2600],
  ["hold", 3300],
  ["take", 4500],
];

export function samplePhase(ms: number): SamplePhase {
  let at: SamplePhase = "tilt";
  for (const [phase, from] of SAMPLE_STEPS) if (ms >= from) at = phase;
  return at;
}

/** How the picture looks at each moment (CSS; the image eases between them). */
export function sampleLook(phase: SamplePhase | null): { transform: string; filter: string } {
  switch (phase) {
    case "tilt":
      return {
        transform: "translate(-14%, 10%) rotate(-11deg) scale(0.72)",
        filter: "blur(7px) brightness(0.75)",
      };
    case "align":
      return { transform: "translate(-3%, 2%) rotate(-3deg) scale(0.92)", filter: "blur(4px)" };
    case "focus":
      return { transform: "none", filter: "blur(1.5px)" };
    default:
      // Outlined, held, taken, or waiting for Take photo: square on and sharp.
      return { transform: "none", filter: "none" };
  }
}
