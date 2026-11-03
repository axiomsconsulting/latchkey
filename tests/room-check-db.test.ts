/**
 * Swapping two stays' check-ins (exchange_check_ins): every guest's records go
 * with them, names from an ID follow the guest, names from the booking stay, and
 * only the server may call it.
 */
import { beforeAll, describe, expect, it } from "vitest";

import { USERS, bootDb, type Db } from "./pg-harness";

let db: Db;
let propertyId: string;
let room1: string;
let room2: string;

async function stay(room: string, name: string | null, over: Record<string, unknown> = {}) {
  const row = {
    property_id: propertyId,
    room_id: room,
    guest_full_name: name,
    check_in_date: "2026-11-03",
    check_out_date: "2026-11-05",
    status: name ? "upcoming" : "needs_details",
    ...over,
  };
  const keys = Object.keys(row);
  const r = await db.system<{ id: string }>(
    `insert into bookings (${keys.join(", ")}) values (${keys.map((_, i) => `$${i + 1}`).join(", ")}) returning id`,
    Object.values(row),
  );
  return r[0]!.id;
}

async function person(bookingId: string, name: string) {
  await db.system(
    "insert into guest_ids (booking_id, property_id, position, kind, full_name, delete_after) values ($1, $2, 0, 'adult', $3, '2026-12-01')",
    [bookingId, propertyId, name],
  );
}

const row = async (id: string) =>
  (
    await db.system<{
      status: string;
      guest_full_name: string | null;
      name_from_id: boolean;
      checked_in_at: string | null;
    }>("select status, guest_full_name, name_from_id, checked_in_at from bookings where id = $1", [
      id,
    ])
  )[0]!;
const leadOf = async (id: string) =>
  (
    await db.system<{ full_name: string }>(
      "select full_name from guest_ids where booking_id = $1 and position = 0",
      [id],
    )
  )[0]?.full_name ?? null;

beforeAll(async () => {
  db = await bootDb();
  const hostId = (
    await db.as<{ id: string }>("owner", "select create_host_workspace('Hill', $1) as id", [
      USERS.owner.email,
    ])
  )[0]!.id;
  propertyId = (
    await db.as<{ id: string }>(
      "owner",
      "insert into properties (host_id, name, short_code) values ($1, 'Hill', 'hill-rc') returning id",
      [hostId],
    )
  )[0]!.id;
  const rooms = await db.as<{ id: string }>(
    "owner",
    "insert into rooms (property_id, display_name) values ($1, 'Room 1'), ($1, 'Room 2') returning id",
    [propertyId],
  );
  room1 = rooms[0]!.id;
  room2 = rooms[1]!.id;
});

describe("exchange_check_ins", () => {
  it("moves a guest to the empty stay; the name from their ID goes with them", async () => {
    const wrong = await stay(room1, "Mark Smith", {
      status: "checked_in",
      checked_in_at: "2026-11-03T15:00:00Z",
      name_from_id: true,
    });
    const right = await stay(room2, null);
    await person(wrong, "Mark Smith");
    await db.system(
      "insert into stay_short_links (code, booking_id, expires_at) values ('one-two-three', $1, now() + interval '1 day')",
      [wrong],
    );
    await db.system("select exchange_check_ins($1, $2)", [wrong, right]);

    expect(await leadOf(right)).toBe("Mark Smith");
    expect(await leadOf(wrong)).toBeNull();
    expect(await row(right)).toMatchObject({
      status: "checked_in",
      guest_full_name: "Mark Smith",
      name_from_id: true,
    });
    expect((await row(right)).checked_in_at).not.toBeNull();
    expect(await row(wrong)).toMatchObject({
      status: "needs_details",
      guest_full_name: null,
      name_from_id: false,
      checked_in_at: null,
    });
    const link = await db.system<{ booking_id: string }>(
      "select booking_id from stay_short_links where code = 'one-two-three'",
    );
    expect(link[0]!.booking_id).toBe(right);
  });

  it("swaps two check-ins, each booking keeping its own booked name", async () => {
    const a = await stay(room1, "Ann Lee", { status: "checked_in" });
    const b = await stay(room2, "Bob Ray", { status: "checked_in" });
    await person(a, "Bob Ray");
    await person(b, "Ann Lee");
    await db.system("select exchange_check_ins($1, $2)", [a, b]);
    expect(await leadOf(a)).toBe("Ann Lee");
    expect(await leadOf(b)).toBe("Bob Ray");
    expect((await row(a)).guest_full_name).toBe("Ann Lee");
    expect((await row(b)).guest_full_name).toBe("Bob Ray");
    expect((await row(a)).status).toBe("checked_in");
  });

  it("leaves a booking's own name behind when its guest moves off", async () => {
    const booked = await stay(room1, "Sarah Jones", { status: "checked_in" });
    const blank = await stay(room2, null);
    await person(booked, "Mark Smith");
    await db.system("select exchange_check_ins($1, $2)", [booked, blank]);
    expect(await row(booked)).toMatchObject({ status: "upcoming", guest_full_name: "Sarah Jones" });
    expect(await row(blank)).toMatchObject({
      status: "checked_in",
      guest_full_name: "Mark Smith",
      name_from_id: true,
    });
  });

  it("keeps the register's room in step", async () => {
    const a = await stay(room1, "Reg Guest", { status: "checked_in" });
    const b = await stay(room2, null);
    const host = await db.system<{ host_id: string }>(
      "select host_id from properties where id = $1",
      [propertyId],
    );
    await db.system(
      `insert into guest_register (host_id, property_id, property_name, booking_id, room_name, position, arrival_date, full_name, nationality, is_alien, keep_until)
       values ($1, $2, 'Hill', $3, 'Room 1', 0, '2026-11-03', 'Reg Guest', 'GB', false, '2027-11-03')`,
      [host[0]!.host_id, propertyId, a],
    );
    await db.system("select exchange_check_ins($1, $2)", [a, b]);
    const reg = await db.system<{ room_name: string; booking_id: string }>(
      "select room_name, booking_id from guest_register where full_name = 'Reg Guest'",
    );
    expect(reg[0]).toMatchObject({ room_name: "Room 2", booking_id: b });
  });

  it("is for the server only", async () => {
    const a = await stay(room1, "Own Guest");
    const b = await stay(room2, null);
    await expect(db.as("owner", "select exchange_check_ins($1, $2)", [a, b])).rejects.toThrow();
  });
});
