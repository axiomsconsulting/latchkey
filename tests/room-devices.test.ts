import { describe, expect, it } from "vitest";

import { shownTiles } from "../src/lib/guide-tiles";
import {
  applyCommand,
  cleanCommand,
  commandsFor,
  controlsFor,
  deviceAccess,
  demoState,
  knownCapabilities,
  presetsFor,
  stateFromStatus,
  decodeAlias,
  isTapoDevice,
  stateFromTapo,
  suggestRoom,
  tapoCapabilities,
  tapoCapabilitiesFrom,
  tapoParams,
  type AccessInput,
} from "../src/lib/room-devices";

const ALL = ["switch", "switchLevel", "colorTemperature", "colorControl"];

describe("controls", () => {
  it("offers only what the device can do, and nothing without on/off", () => {
    expect(controlsFor(ALL)).toEqual(["power", "brightness", "warmth", "colour"]);
    expect(controlsFor(["switch"])).toEqual(["power"]);
    expect(controlsFor(["switchLevel", "colorControl"])).toEqual([]);
    expect(knownCapabilities(["switch", "healthCheck", "refresh", "colorControl"])).toEqual([
      "switch",
      "colorControl",
    ]);
  });

  it("presets need brightness or colour; colour presets drop their colour on a white-only bulb", () => {
    expect(presetsFor(["power"])).toEqual([]);
    const white = presetsFor(["power", "brightness"]);
    expect(white.map((p) => p.key)).toEqual(["bright", "relax", "night"]);
    expect(white[0]!.command).toEqual({ level: 100 });
    expect(presetsFor(controlsFor(ALL)).map((p) => p.key)).toContain("ocean");
  });
});

describe("commands", () => {
  const controls = controlsFor(ALL);

  it("clamps values and drops what the device can't do", () => {
    expect(cleanCommand({ level: 140, kelvin: 9000 }, controls)).toEqual({
      level: 100,
      kelvin: 6500,
    });
    expect(cleanCommand({ level: 0 }, controls)).toEqual({ level: 1 });
    expect(cleanCommand({ level: 50, hue: 20, saturation: 80 }, ["power"])).toEqual({});
    // Colour wins over warmth when both arrive.
    expect(cleanCommand({ hue: 400, saturation: 50, kelvin: 3000 }, controls)).toEqual({
      hue: 360,
      saturation: 50,
    });
  });

  it("turns into SmartThings commands; off goes alone, anything else switches on", () => {
    expect(commandsFor({ power: false, level: 50 })).toEqual([
      { component: "main", capability: "switch", command: "off" },
    ]);
    expect(commandsFor({ level: 40, hue: 180, saturation: 60 })).toEqual([
      { component: "main", capability: "switch", command: "on" },
      { component: "main", capability: "switchLevel", command: "setLevel", arguments: [40] },
      {
        component: "main",
        capability: "colorControl",
        command: "setColor",
        // SmartThings' hue runs 0-100.
        arguments: [{ hue: 50, saturation: 60 }],
      },
    ]);
    expect(commandsFor({ kelvin: 2700 })[1]).toEqual({
      component: "main",
      capability: "colorTemperature",
      command: "setColorTemperature",
      arguments: [2700],
    });
  });

  it("reads SmartThings' status and health", () => {
    const s = stateFromStatus(
      {
        components: {
          main: {
            switch: { switch: { value: "on" } },
            switchLevel: { level: { value: 64 } },
            colorTemperature: { colorTemperature: { value: 2700 } },
            colorControl: { hue: { value: 50 }, saturation: { value: 30 } },
          },
        },
      },
      { state: "ONLINE" },
    );
    expect(s).toEqual({
      on: true,
      level: 64,
      kelvin: 2700,
      hue: 180,
      saturation: 30,
      online: true,
    });
    expect(stateFromStatus({}, { state: "OFFLINE" }).online).toBe(false);
  });

  it("applies a command to a state (demo mode and the page)", () => {
    const off = demoState(null);
    expect(off.on).toBe(false);
    const warm = applyCommand(off, { level: 30, kelvin: 2200 });
    expect(warm).toMatchObject({ on: true, level: 30, kelvin: 2200, hue: null });
    const blue = applyCommand(warm, { hue: 200, saturation: 70 });
    expect(blue).toMatchObject({ on: true, hue: 200, saturation: 70 });
    expect(applyCommand(blue, { power: false })).toMatchObject({ on: false, level: 30 });
  });
});

describe("when a guest may use the room's lights", () => {
  // London, 10-12 Nov 2026 (GMT), check-in 15:00, check-out 11:00.
  const base: AccessInput = {
    now: new Date("2026-11-10T16:00:00Z"),
    timezone: "Europe/London",
    checkInDate: "2026-11-10",
    checkOutDate: "2026-11-12",
    checkInTime: "15:00",
    checkOutTime: "11:00",
    status: "upcoming",
    roomTaken: false,
    held: false,
  };

  it("from check-in time until check-out time", () => {
    expect(deviceAccess(base)).toEqual({ ok: true, until: "2026-11-12T11:00:00.000Z" });
    expect(deviceAccess({ ...base, now: new Date("2026-11-10T09:00:00Z") })).toEqual({
      ok: false,
      reason: "not_yet",
      from: "2026-11-10T15:00:00.000Z",
    });
    expect(deviceAccess({ ...base, now: new Date("2026-11-12T11:00:00Z") }).ok).toBe(false);
  });

  it("earlier once checked in, but never while the last guest is still in the room", () => {
    const early = { ...base, now: new Date("2026-11-10T12:00:00Z"), status: "checked_in" };
    expect(deviceAccess(early).ok).toBe(true);
    expect(deviceAccess({ ...early, roomTaken: true })).toEqual({ ok: false, reason: "taken" });
  });

  it("never after checking out, when cancelled, or while held without a room", () => {
    expect(deviceAccess({ ...base, status: "checked_out" })).toMatchObject({ reason: "ended" });
    expect(deviceAccess({ ...base, status: "cancelled" })).toMatchObject({ reason: "ended" });
    expect(deviceAccess({ ...base, held: true })).toMatchObject({ reason: "no_room" });
  });

  it("follows the property's time zone (summer time)", () => {
    const summer = {
      ...base,
      checkInDate: "2026-07-10",
      checkOutDate: "2026-07-12",
      now: new Date("2026-07-10T14:30:00Z"), // 15:30 in London
    };
    expect(deviceAccess(summer).ok).toBe(true);
    expect(deviceAccess({ ...summer, now: new Date("2026-07-10T13:30:00Z") }).ok).toBe(false);
  });
});

describe("the Lights tile", () => {
  const ctx = { page: "stay" as const, sections: [], hasWifi: true, canOrder: true };
  it("comes first on a stay with lights, and never on the room guide", () => {
    const tiles = shownTiles(null, { ...ctx, lights: true }, { lights: "Lights" });
    expect(tiles[0]).toMatchObject({
      label: "Lights",
      action: { kind: "jump", target: "stay-lights" },
    });
    expect(shownTiles(null, ctx).some((t) => t.id === "auto-lights")).toBe(false);
    expect(
      shownTiles(null, { ...ctx, page: "room", lights: true }).some((t) => t.id === "auto-lights"),
    ).toBe(false);
  });
});

describe("TP-Link Tapo", () => {
  it("keeps Tapo lights and plugs from the account's list, not Kasa devices", () => {
    expect(isTapoDevice("SMART.TAPOBULB")).toBe(true);
    expect(isTapoDevice("SMART.TAPOPLUG")).toBe(true);
    expect(isTapoDevice("IOT.SMARTBULB")).toBe(false);
    expect(isTapoDevice(undefined)).toBe(false);
  });

  it("reads names whether TP-Link sends them base64 or plain", () => {
    expect(decodeAlias(btoa("Guest Room 4"))).toBe("Guest Room 4");
    expect(decodeAlias("Kitchen")).toBe("Kitchen");
    expect(decodeAlias("Room")).toBe("Room");
    expect(decodeAlias(null)).toBe("");
  });

  it("guesses from the model, then believes the device itself", () => {
    expect(tapoCapabilities("SMART.TAPOBULB", "L530E")).toEqual(ALL);
    expect(tapoCapabilities("SMART.TAPOBULB", "L510E")).toEqual(["switch", "switchLevel"]);
    expect(tapoCapabilities("SMART.TAPOPLUG", "P110")).toEqual(["switch"]);
    expect(
      tapoCapabilitiesFrom({
        device_on: true,
        brightness: 50,
        color_temp: 2700,
        hue: 0,
        saturation: 100,
      }),
    ).toEqual(ALL);
    expect(tapoCapabilitiesFrom({ device_on: true, brightness: 50 })).toEqual([
      "switch",
      "switchLevel",
    ]);
    expect(tapoCapabilitiesFrom({ device_on: false })).toEqual(["switch"]);
  });

  it("reads a bulb's state: color_temp 0 means it's showing a colour", () => {
    expect(
      stateFromTapo({ device_on: true, brightness: 40, color_temp: 0, hue: 200, saturation: 70 }),
    ).toEqual({ on: true, level: 40, kelvin: null, hue: 200, saturation: 70, online: true });
    expect(
      stateFromTapo({ device_on: false, brightness: 80, color_temp: 2700, hue: 0, saturation: 0 }),
    ).toMatchObject({ on: false, kelvin: 2700, hue: null });
  });

  it("turns commands into set_device_info params", () => {
    expect(tapoParams({ power: false, level: 20 })).toEqual({ device_on: false });
    expect(tapoParams({ level: 30, kelvin: 2200 })).toEqual({
      device_on: true,
      brightness: 30,
      color_temp: 2500,
    });
    expect(tapoParams({ hue: 120, saturation: 55 })).toEqual({
      device_on: true,
      hue: 120,
      saturation: 55,
      color_temp: 0,
    });
  });
});

describe("picking the room from a light's name", () => {
  const rooms = [
    { id: "1", name: "Room 1" },
    { id: "4", name: "Room 4" },
    { id: "14", name: "Room 14" },
    { id: "g", name: "Garden Suite" },
  ];
  it("matches one clear room, and nothing when it's unclear", () => {
    expect(suggestRoom("Guest Room 4", rooms)?.id).toBe("4");
    expect(suggestRoom("Room 14 lamp", rooms)?.id).toBe("14");
    expect(suggestRoom("Garden Suite bulb", rooms)?.id).toBe("g");
    expect(suggestRoom("Hallway", rooms)).toBeNull();
    expect(suggestRoom("Guest Room", rooms)).toBeNull();
  });
});
