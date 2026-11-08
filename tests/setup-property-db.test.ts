/**
 * The set-up wizard's save against the real migrations (RLS on): a fresh
 * host and a Commission Partner who opened a host business both save one
 * property with its country, six-digit PIN and times, and its rooms; a
 * retry updates them (the wizard sends the saved ids), never duplicates.
 */
import { beforeAll, describe, expect, it } from "vitest";

import { propertyInput } from "../src/lib/host.functions";
import { setupPropertyPayload } from "../src/lib/setup-property";
import { USERS, bootDb, type Db, type Who } from "./pg-harness";

let db: Db;
const times = {
  check_in: "15:00",
  check_out: "10:00",
  quiet_start: "22:00",
  quiet_end: "08:00",
  pin: "482700",
};

beforeAll(async () => {
  db = await bootDb();
}, 60_000);

/** What saveProperty does with the parsed payload, as the signed-in user. */
async function save(who: Who, hostId: string, code: string, pin: string, id?: string) {
  const {
    id: pid,
    hostId: h,
    ...fields
  } = propertyInput.parse(
    setupPropertyPayload(
      hostId,
      {
        name: "The Hill Suites",
        address: "1 Example Lane, Demo Town (fictional)",
        postcode: "ZZ1 1ZZ",
        short_code: code,
        country_code: "GB",
      },
      { ...times, pin },
      id,
    ),
  );
  const cols = Object.keys(fields);
  const vals = Object.values(fields);
  if (pid) {
    const sets = cols.map((c, i) => c + " = $" + (i + 2)).join(", ");
    const rows = await db.as<{ id: string }>(
      who,
      "update properties set " + sets + " where id = $1 returning id",
      [pid, ...vals],
    );
    return rows[0]!.id;
  }
  const marks = cols.map((_, i) => "$" + (i + 2)).join(", ");
  const rows = await db.as<{ id: string }>(
    who,
    "insert into properties (host_id, " +
      cols.join(", ") +
      ") values ($1, " +
      marks +
      ") returning id",
    [h, ...vals],
  );
  return rows[0]!.id;
}

async function room(who: Who, propertyId: string, name: string, i: number, id?: string) {
  const rows = id
    ? await db.as<{ id: string }>(
        who,
        "update rooms set display_name = $2, max_guests = 2, sort_order = $3 where id = $1 returning id",
        [id, name, i],
      )
    : await db.as<{ id: string }>(
        who,
        "insert into rooms (property_id, display_name, max_guests, has_ensuite, sort_order, active) values ($1, $2, 2, false, $3, true) returning id",
        [propertyId, name, i],
      );
  return rows[0]!.id;
}

async function runWizard(who: Who, hostId: string, code: string, pin: string) {
  const pid = await save(who, hostId, code, pin);
  const r1 = await room(who, pid, "Room 1", 0);
  const r2 = await room(who, pid, "Room 2", 1);
  // A retry after an error: the same ids, nothing new.
  await save(who, hostId, code, pin, pid);
  await room(who, pid, "Room 1", 0, r1);
  await room(who, pid, "Room 2", 1, r2);
  const props = await db.system<Record<string, string>>(
    "select country_code, check_in_pin, default_check_in_time::text as ci, default_check_out_time::text as co, quiet_hours_start::text as qs, quiet_hours_end::text as qe from properties where host_id = $1",
    [hostId],
  );
  const rooms = await db.system<{ display_name: string; max_guests: number }>(
    "select display_name, max_guests from rooms where property_id = $1 order by sort_order",
    [pid],
  );
  return { props, rooms };
}

const expected = {
  country_code: "GB",
  ci: "15:00:00",
  co: "10:00:00",
  qs: "22:00:00",
  qe: "08:00:00",
};

describe("set-up wizard save", () => {
  it("a fresh host saves one property and two rooms, and a retry duplicates nothing", async () => {
    const hostId = (
      await db.as<{ id: string }>("owner", "select create_host_workspace('Hill', $1) as id", [
        USERS.owner.email,
      ])
    )[0]!.id;
    const { props, rooms } = await runWizard("owner", hostId, "hill-suites-fresh", "482700");
    expect(props).toEqual([{ ...expected, check_in_pin: "482700" }]);
    expect(rooms).toEqual([
      { display_name: "Room 1", max_guests: 2 },
      { display_name: "Room 2", max_guests: 2 },
    ]);
  });

  it("a Commission Partner who opened a host business saves it the same way, and stays a partner", async () => {
    await db.system(
      "insert into partners (user_id, legal_name, country, email, status) values ($1, 'Pat Partner', 'GB', 'pat@example.com', 'terminated')",
      [USERS.viewer.id],
    );
    // As startOwnBusiness / getWorkspace({ create: true }) make it.
    const hostId = (
      await db.system<{ id: string }>(
        "insert into hosts (business_name, contact_email) values ('Hill Suites', 'pat@example.com') returning id",
      )
    )[0]!.id;
    await db.system("insert into host_members (host_id, user_id, role) values ($1, $2, 'owner')", [
      hostId,
      USERS.viewer.id,
    ]);
    const { props, rooms } = await runWizard("viewer", hostId, "hill-suites-video-demo", "482701");
    expect(props).toEqual([{ ...expected, check_in_pin: "482701" }]);
    expect(rooms).toHaveLength(2);
    expect(
      await db.system("select count(*)::int as n from partners where user_id = $1", [
        USERS.viewer.id,
      ]),
    ).toEqual([{ n: 1 }]);
  });
});
