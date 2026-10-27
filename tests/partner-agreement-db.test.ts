/**
 * Migration 0062: the v1.0 text exactly as in docs/legal, published text that
 * can't change, add-only signatures, ID checks and Drive tables kept from
 * partners and the public, and set-off ledger lines.
 */
import { createHash } from "crypto";
import { readFileSync } from "fs";
import { join } from "path";

import { beforeAll, describe, expect, it } from "vitest";

import { USERS, bootDb, type Db } from "./pg-harness";

let db: Db;
let partnerId: string;
let versionId: string;

beforeAll(async () => {
  db = await bootDb();
  partnerId = (
    await db.system<{ id: string }>(
      "insert into partners (user_id, legal_name, country, email, status) values ($1, 'Pat Partner', 'GB', 'pat@example.com', 'pending_review') returning id",
      [USERS.viewer.id],
    )
  )[0]!.id;
  versionId = (
    await db.system<{ id: string }>(
      "select id from partner_agreement_versions where version = '1.0'",
    )
  )[0]!.id;
}, 60_000);

const sign = () =>
  db.system<{ id: string }>(
    "insert into partner_agreement_acceptances (partner_id, agreement_version_id, version, body_sha256, rendered_sha256, typed_name, ticks, ip, user_agent) values ($1, $2, '1.1', 'x', 'y', 'Pat Partner', '[]', '203.0.113.9', 'test') returning id",
    [partnerId, versionId],
  );

describe("agreement versions", () => {
  it("have v1.2 in force and v1.0 and v1.1 retired, each word for word from its file", async () => {
    for (const [version, status] of [
      ["1.0", "retired"],
      ["1.1", "retired"],
      ["1.2", "current"],
    ] as const) {
      const file = readFileSync(
        join(__dirname, `../docs/legal/partner-agreement-v${version}.md`),
        "utf8",
      );
      const [row] = await db.system<{ status: string; body_sha256: string; body_markdown: string }>(
        "select status, body_sha256, body_markdown from partner_agreement_versions where version = $1",
        [version],
      );
      expect(row!.status).toBe(status);
      expect(row!.body_markdown).toBe(file);
      expect(row!.body_sha256).toBe(createHash("sha256").update(file, "utf8").digest("hex"));
    }
  });

  it("refuse changes to published text, but allow retiring it", async () => {
    await expect(
      db.system(
        "update partner_agreement_versions set body_markdown = body_markdown || ' ' where version = '1.0'",
      ),
    ).rejects.toThrow();
    await expect(
      db.system("delete from partner_agreement_versions where version = '1.0'"),
    ).rejects.toThrow();
    await expect(
      db.system(
        "insert into partner_agreement_versions (version, body_markdown, body_sha256) values ('9.9', 'x', 'wrong')",
      ),
    ).rejects.toThrow(/SHA-256/);
  });

  it("allow only one version in force", async () => {
    await expect(
      db.system(
        "insert into partner_agreement_versions (version, status, published_at, effective_from, body_markdown, body_sha256) values ('2.0', 'current', now(), now(), 'b', encode(sha256(convert_to('b','UTF8')),'hex'))",
      ),
    ).rejects.toThrow();
  });

  it("need 30 days' notice before a version that reduces terms is in force", async () => {
    await expect(
      db.system(
        "insert into partner_agreement_versions (version, status, published_at, effective_from, reduces_terms, notice_sent_at, body_markdown, body_sha256) values ('3.0', 'retired', now(), now(), true, now(), 'c', encode(sha256(convert_to('c','UTF8')),'hex'))",
      ),
    ).rejects.toThrow();
  });

  it("let anyone read the text in force, never drafts", async () => {
    await db.system(
      "insert into partner_agreement_versions (version, status, body_markdown, body_sha256) values ('1.9', 'draft', 'd', encode(sha256(convert_to('d','UTF8')),'hex'))",
    );
    expect(
      await db.as("anon", "select version from partner_agreement_versions order by version"),
    ).toEqual([{ version: "1.0" }, { version: "1.1" }, { version: "1.2" }]);
    expect(
      (await db.as("admin", "select version from partner_agreement_versions")).length,
    ).toBeGreaterThan(1);
  });
});

describe("signatures", () => {
  it("are add-only: the evidence can't change; the file links, email time and OMS confirmation can be filled in", async () => {
    const id = (await sign())[0]!.id;
    await db.system(
      "update partner_agreement_acceptances set signature_png_path = 'drive:abc', pdf_path = 'queue:x', pdf_sha256 = 'p', emailed_at = now(), oms_confirmed_at = now() where id = $1",
      [id],
    );
    await db.system(
      "update partner_agreement_acceptances set pdf_path = 'drive:def' where id = $1",
      [id],
    );
    await expect(
      db.system(
        "update partner_agreement_acceptances set typed_name = 'Someone Else' where id = $1",
        [id],
      ),
    ).rejects.toThrow();
    await expect(
      db.system("update partner_agreement_acceptances set pdf_sha256 = 'q' where id = $1", [id]),
    ).rejects.toThrow();
    await expect(
      db.system("delete from partner_agreement_acceptances where id = $1", [id]),
    ).rejects.toThrow();
  });

  it("are visible to the partner who signed and to super admins only", async () => {
    expect(
      (await db.as("viewer", "select id from partner_agreement_acceptances")).length,
    ).toBeGreaterThan(0);
    expect(await db.as("manager", "select id from partner_agreement_acceptances")).toEqual([]);
  });
});

describe("identity checks and private files", () => {
  it("keep ID checks, the access log and the Drive queue from partners and the public", async () => {
    const check = (
      await db.system<{ id: string }>(
        "insert into partner_id_checks (partner_id, status, id_image_path) values ($1, 'manual_review', 'queue:partner_id/x.jpg') returning id",
        [partnerId],
      )
    )[0]!.id;
    await db.system(
      "insert into drive_queue (path, kind, owner_key, file_name, mime, sha256, ref_table, ref_column) values ('partner_id/x.jpg', 'partner_id', $1, 'x.jpg', 'image/jpeg', 'h', 'partner_id_checks', 'id_image_path')",
      [partnerId],
    );
    expect(await db.as("viewer", "select id from partner_id_checks")).toEqual([]);
    expect(await db.as("viewer", "select id from drive_queue")).toEqual([]);
    expect(await db.as("admin", "select id from drive_queue")).toEqual([]);
    expect((await db.as("admin", "select id from partner_id_checks")).length).toBe(1);
    await expect(
      db.system(
        "insert into partner_id_access_log (check_id, viewer_user_id, reason) values ($1, $2, '')",
        [check, USERS.admin.id],
      ),
    ).rejects.toThrow();
    await db.system(
      "insert into partner_id_access_log (check_id, viewer_user_id, reason) values ($1, $2, 'Reviewing check')",
      [check, USERS.admin.id],
    );
  });

  it("accept set-off lines in the ledger (10.6)", async () => {
    await db.system(
      "insert into commission_ledger (partner_id, kind, amount_pence, state, note) values ($1, 'set_off', -500, 'payable', 'Overpayment')",
      [partnerId],
    );
    expect(
      (await db.system("select id from commission_ledger where kind = 'set_off'")).length,
    ).toBe(1);
  });
});
