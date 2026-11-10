/** Reviews for the door tablet (migration 0102): the business's members read them; only the server writes. */
import { beforeAll, describe, expect, it } from "vitest";

import { USERS, bootDb, type Db } from "./pg-harness";

let db: Db;
let reviewId: string;

beforeAll(async () => {
  db = await bootDb();
  const hostId = (
    await db.as<{ id: string }>("owner", "select create_host_workspace('Hill', $1) as id", [
      USERS.owner.email,
    ])
  )[0]!.id;
  const propertyId = (
    await db.as<{ id: string }>(
      "owner",
      "insert into properties (host_id, name, short_code) values ($1, 'Hill', 'hill-reviews') returning id",
      [hostId],
    )
  )[0]!.id;
  reviewId = (
    await db.system<{ id: string }>(
      "insert into kiosk_reviews (property_id, site, first_name, rating, out_of, quote, review_key) values ($1, 'airbnb', 'Anna', 5, 5, 'Spotless and comfortable.', 'anna|spotless') returning id",
      [propertyId],
    )
  )[0]!.id;
}, 120_000);

describe("kiosk reviews", () => {
  it("members read them; outsiders don't", async () => {
    expect(await db.as("owner", "select first_name from kiosk_reviews")).toEqual([
      { first_name: "Anna" },
    ]);
    expect(await db.as("outsider", "select id from kiosk_reviews")).toEqual([]);
  });
  it("only the server changes them", async () => {
    let rows: unknown = [];
    try {
      rows = await db.as(
        "owner",
        "update kiosk_reviews set hidden = true where id = $1 returning id",
        [reviewId],
      );
    } catch {
      rows = [];
    }
    expect(rows).toEqual([]);
  });
});
