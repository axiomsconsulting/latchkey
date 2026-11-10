import { createContext, useContext } from "react";

/**
 * A host trying the check-in with sample photos (TestStayCard → the kiosk's ?test= link): every
 * camera on the kiosk shows these instead of the live picture. Null for everyone else.
 */
export type TestSamples = { id: string | null; face: string | null };

export const TestSamplesContext = createContext<TestSamples | null>(null);

export function useTestSample(kind: "id" | "face"): string | null {
  return useContext(TestSamplesContext)?.[kind] ?? null;
}
