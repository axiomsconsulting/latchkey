import { describe, expect, it } from "vitest";

import { compareNames, tidyIdName } from "../src/lib/name-match";

describe("tidyIdName", () => {
  it("writes a capitals name the usual way", () => {
    expect(tidyIdName("DANIEL HUGHES")).toBe("Daniel Hughes");
    expect(tidyIdName("SEAN O'NEILL-MCKAY")).toBe("Sean O'Neill-McKay");
    expect(tidyIdName("ÉLODIE DURAND")).toBe("Élodie Durand");
    expect(tidyIdName("JOHN MACHIN")).toBe("John Machin");
  });
  it("leaves a name with small letters, and nothing, alone", () => {
    expect(tidyIdName("Daniel van der Berg")).toBe("Daniel van der Berg");
    expect(tidyIdName(null)).toBeNull();
    expect(tidyIdName("")).toBe("");
  });
  it("still matches the booking", () => {
    expect(compareNames("Daniel Hughes", tidyIdName("DANIEL HUGHES")!)).toBe(
      compareNames("Daniel Hughes", "DANIEL HUGHES"),
    );
  });
});
