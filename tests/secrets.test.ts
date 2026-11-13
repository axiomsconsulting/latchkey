import { afterEach, describe, expect, it } from "vitest";

import {
  SECRETS,
  maskSecret,
  secret,
  secretDef,
  secretProblem,
  setSavedSecrets,
  tidySecret,
} from "@/lib/secrets";

describe("keys and secrets", () => {
  afterEach(() => {
    setSavedSecrets({});
    delete process.env["SKIDDLE_API_KEY"];
  });

  it("lists each key once, with steps and a description", () => {
    const names = SECRETS.map((s) => s.name);
    expect(new Set(names).size).toBe(names.length);
    for (const s of SECRETS) {
      expect(s.steps.length).toBeGreaterThan(0);
      expect(s.looks).toBeTruthy();
      if (s.example && s.pattern && !s.example.includes("…"))
        expect(s.pattern.test(s.example)).toBe(true);
    }
  });

  it("never reveals or edits Lovable's own keys", () => {
    expect(secretDef("SUPABASE_SERVICE_ROLE_KEY")?.revealable).toBe(false);
    expect(secretDef("LOVABLE_API_KEY")?.edit).toBe("platform");
    expect(secretDef("PARTNER_PAYOUTS_ALLOW_LIVE")?.edit).toBe("lovable");
    expect(secretDef("PRIVATE_FILE_SIGNING_SECRET")?.edit).toBe("lovable");
  });

  it("a saved key wins over Lovable Secrets, and clearing goes back", () => {
    process.env["SKIDDLE_API_KEY"] = "fromlovable";
    expect(secret("SKIDDLE_API_KEY")).toBe("fromlovable");
    setSavedSecrets({ SKIDDLE_API_KEY: " saved " });
    expect(secret("SKIDDLE_API_KEY")).toBe("saved");
    setSavedSecrets({});
    expect(secret("SKIDDLE_API_KEY")).toBe("fromlovable");
    expect(secret("TICKETMASTER_API_KEY_NOPE")).toBeNull();
  });

  it("tidies paste mistakes", () => {
    expect(tidySecret("SKIDDLE_API_KEY", ' SKIDDLE_API_KEY="abc" ')).toBe("abc");
    expect(tidySecret("X", "Bearer abc")).toBe("abc");
  });

  it("spots likely mistakes", () => {
    expect(secretProblem("STRIPE_SECRET_KEY", "sk_" + "test_" + "x".repeat(24))).toMatch(
      /test key/,
    );
    expect(secretProblem("STRIPE_TEST_API_KEY", "sk_" + "live_" + "x".repeat(24))).toMatch(
      /live key/,
    );
    expect(secretProblem("STRIPE_SECRET_KEY", "pk_live_abc")).toMatch(/publishable/);
    expect(secretProblem("PUBLIC_SITE_URL", "https://example.com/")).toMatch(/\//);
    expect(secretProblem("PUBLIC_SITE_URL", "https://example.com")).toBeNull();
    expect(secretProblem("TWILIO_ACCOUNT_SID", "AC" + "0123456789abcdef".repeat(2))).toBeNull();
    expect(secretProblem("TWILIO_ACCOUNT_SID", "SK0123")).toMatch(/Doesn't look right/);
    expect(secretProblem("GOOGLE_CLIENT_SECRET", "1-a.apps.googleusercontent.com")).toMatch(
      /client ID/,
    );
    expect(secretProblem("FIRECRAWL_API_KEY", "fc-abc def")).toMatch(/space/);
    expect(secretProblem("NOPE", "x")).toMatch(/doesn't use/);
  });

  it("masks with the first and last few characters", () => {
    expect(maskSecret("sk_" + "live_" + "x".repeat(20) + "WXYZ")).toMatch(/^sk_liv•+WXYZ$/);
    expect(maskSecret("short")).toBe("•••••");
    expect(maskSecret("0123456789abc")).toMatch(/^012•+bc$/);
  });
});
