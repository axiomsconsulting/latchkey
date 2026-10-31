import { describe, expect, it } from "vitest";

import {
  KIOSK_COMPAT_SCRIPT,
  aboveDetected,
  browserLabel,
  chosenMode,
  compatFor,
  detectMode,
  detectedModeOf,
  effectiveCompat,
  effectiveMode,
  needsCompat,
} from "@/lib/kiosk-compat";

const IPAD2 =
  "Mozilla/5.0 (iPad; CPU OS 9_3_5 like Mac OS X) AppleWebKit/601.1.46 (KHTML, like Gecko) Version/9.0 Mobile/13G36 Safari/601.1";
const OLD_ANDROID =
  "Mozilla/5.0 (Linux; Android 7.0; SM-T580) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/70.0.3538.110 Safari/537.36";

describe("compatibility mode", () => {
  it("is needed without module scripts or modern colours", () => {
    expect(needsCompat({ moduleScripts: true, colorMix: true })).toBe(false);
    expect(needsCompat({ moduleScripts: false, colorMix: true })).toBe(true);
    expect(needsCompat({ moduleScripts: true, colorMix: false })).toBe(true);
  });

  it("follows the host's choice, else what the tablet detected", () => {
    expect(effectiveCompat(null, true)).toBe(true);
    expect(effectiveCompat(undefined, false)).toBe(false);
    expect(effectiveCompat(false, true)).toBe(false);
    expect(effectiveCompat(true, false)).toBe(true);
  });

  it("detects the richest level the browser can run", () => {
    expect(detectMode({ moduleScripts: true, colorMix: true })).toBe("full");
    expect(detectMode({ moduleScripts: false, colorMix: true, flexbox: true, svg: true })).toBe(
      "enhanced",
    );
    expect(detectMode({ moduleScripts: false, colorMix: false })).toBe("enhanced");
    expect(detectMode({ moduleScripts: false, colorMix: false, flexbox: false })).toBe("lite");
    expect(detectMode({ moduleScripts: false, colorMix: false, svg: false })).toBe("lite");
  });

  it("reads the host's level, and the older on/off tick", () => {
    expect(chosenMode({ kiosk_mode: "lite", compat: true })).toBe("lite");
    expect(chosenMode({ kiosk_mode: null, compat: true })).toBe("enhanced");
    expect(chosenMode({ compat: false })).toBe("full");
    expect(chosenMode({ kiosk_mode: "nonsense", compat: null })).toBeNull();
    expect(detectedModeOf({ mode_detected: "lite" })).toBe("lite");
    expect(detectedModeOf({ compat_detected: true })).toBe("enhanced");
    expect(detectedModeOf({})).toBe("full");
    expect(effectiveMode(null, "enhanced")).toBe("enhanced");
    expect(effectiveMode("lite", "full")).toBe("lite");
    expect(compatFor("full")).toBe(false);
    expect(compatFor("lite")).toBe(true);
    expect(compatFor(null)).toBeNull();
    expect(aboveDetected("full", "enhanced")).toBe(true);
    expect(aboveDetected("lite", "enhanced")).toBe(false);
  });

  it("names the browser for the host", () => {
    expect(browserLabel(IPAD2)).toBe("Safari 9 on iPad, iOS 9.3");
    expect(
      browserLabel(
        "Mozilla/5.0 (iPad; CPU OS 9_3_5 like Mac OS X) AppleWebKit/601.1.46 (KHTML, like Gecko) Mobile/13G36",
      ),
    ).toBe("Safari (home screen app) on iPad, iOS 9.3");
    expect(browserLabel(OLD_ANDROID)).toBe("Chrome 70 on Android");
    expect(browserLabel("Mozilla/5.0 (iPad; CPU OS 12_5 like Mac OS X) CriOS/87.0 Mobile")).toBe(
      "Chrome 87 on iPad, iOS 12.5",
    );
    expect(browserLabel("something")).toBe("Browser");
  });
});

describe("the check before the kiosk is drawn", () => {
  const run = (o: {
    path?: string;
    search?: string;
    w?: number;
    h?: number;
    module?: boolean;
    mix?: boolean;
    store?: Record<string, string>;
    booted?: boolean;
  }) => {
    let went: string | null = null;
    let waiting: (() => void) | null = null;
    const env = {
      location: {
        pathname: o.path ?? "/kiosk/hill",
        search: o.search ?? "",
        replace: (u: string) => {
          went = u;
        },
      },
      screen: { width: o.w ?? 1024, height: o.h ?? 768 },
      localStorage: { getItem: (k: string) => o.store?.[k] ?? null },
      document: {
        createElement: () => (o.module === false ? {} : { noModule: false }),
      },
      window: {
        CSS: { supports: () => o.mix !== false },
      },
      CSS: { supports: () => o.mix !== false },
      setTimeout: (f: () => void) => {
        waiting = f;
      },
    };
    new Function(...Object.keys(env), KIOSK_COMPAT_SCRIPT)(...Object.values(env));
    if (o.booted !== undefined && waiting) {
      (env.window as { __lkBooted?: boolean }).__lkBooted = o.booted;
      (waiting as () => void)();
    }
    return went;
  };

  it("sends an old tablet to the compatible kiosk", () => {
    expect(run({ module: false })).toBe("/lite/hill");
    expect(run({ mix: false })).toBe("/lite/hill");
  });

  it("leaves a modern tablet, guests' phones and other pages alone", () => {
    expect(run({})).toBeNull();
    expect(run({ mix: false, search: "?guest=1" })).toBeNull();
    expect(run({ mix: false, w: 375, h: 667 })).toBeNull();
    expect(run({ mix: false, path: "/kiosk/hill/x" })).toBeNull();
  });

  it("follows the host's choice for this tablet", () => {
    expect(run({ store: { "latchkey.compat.hill": "on" } })).toBe("/lite/hill");
    expect(run({ mix: false, store: { "latchkey.compat.hill": "off" } })).toBeNull();
    expect(run({ store: { "latchkey.kioskMode.hill": "lite" } })).toBe("/lite/hill");
    expect(run({ store: { "latchkey.kioskMode.hill": "enhanced" } })).toBe("/lite/hill");
    expect(run({ mix: false, store: { "latchkey.kioskMode.hill": "full" } })).toBeNull();
  });

  it("goes back to the older-tablet page when the full kiosk doesn't start", () => {
    const full = { "latchkey.kioskMode.hill": "full" };
    expect(run({ mix: false, store: full, booted: false })).toBe("/lite/hill?nofull=1");
    expect(run({ mix: false, store: full, booted: true })).toBeNull();
  });
});

describe("old browsers", () => {
  it("can run the check (plain ES5)", async () => {
    const { parse } = await import("acorn");
    expect(() => parse(KIOSK_COMPAT_SCRIPT, { ecmaVersion: 5 })).not.toThrow();
  });
});
