import { describe, expect, it } from "vitest";

import {
  BANKS,
  carriesReference,
  creditsFromCsv,
  creditsFromStarling,
  csvRows,
  matchCredits,
  statementAmount,
  statementDate,
  type Credit,
  type Waiting,
} from "@/lib/bank-match";

describe("reading statements", () => {
  it("splits CSV with quotes, doubled quotes and either line ending", () => {
    expect(csvRows('a,"b, c","say ""hi"""\r\n1,2,3\n')).toEqual([
      ["a", "b, c", 'say "hi"'],
      ["1", "2", "3"],
    ]);
  });

  it("reads UK statement dates and amounts", () => {
    expect(statementDate("31/01/2027")).toBe("2027-01-31");
    expect(statementDate("5-3-27")).toBe("2027-03-05");
    expect(statementDate("2027-03-05T10:00")).toBe("2027-03-05");
    expect(statementDate("05 Mar 2027")).toBe("2027-03-05");
    expect(statementDate("nope")).toBeNull();
    expect(statementAmount("£1,234.50")).toBe(123450);
    expect(statementAmount("-12.00")).toBe(-1200);
    expect(statementAmount("(12.00)")).toBe(-1200);
    expect(statementAmount("12.00 DR")).toBe(-1200);
    expect(statementAmount("")).toBeNull();
  });

  it("Barclays: one signed Amount column, the reference in Memo", () => {
    const csv = [
      "Number,Date,Account,Amount,Subcategory,Memo",
      ",05/03/2027,20-00-00 12345678,240.00,Funds Transfer,J SMITH  K7QX2PMA",
      ",05/03/2027,20-00-00 12345678,-35.20,Direct Debit,ENERGY CO",
    ].join("\n");
    const r = creditsFromCsv(csv);
    expect(r.understood).toBe(true);
    expect(r.credits).toHaveLength(1);
    expect(r.credits[0]).toMatchObject({ date: "2027-03-05", amount: 24000 });
    expect(r.credits[0]!.text).toContain("K7QX2PMA");
  });

  it("Lloyds and Nationwide: separate money in and out columns", () => {
    const lloyds = [
      "Transaction Date,Transaction Type,Sort Code,Account Number,Transaction Description,Debit Amount,Credit Amount,Balance",
      "05/03/2027,FPI,'30-00-00,12345678,SMITH J K7QX2PMA,,240.00,1000.00",
      "06/03/2027,DD,'30-00-00,12345678,COUNCIL TAX,120.00,,880.00",
    ].join("\n");
    expect(creditsFromCsv(lloyds).credits.map((c) => c.amount)).toEqual([24000]);
    const nationwide = [
      '"Account Name:","FlexDirect ****1234"',
      '"Date","Transaction type","Description","Paid out","Paid in","Balance"',
      '"05 Mar 2027","Bank credit SMITH J","K7QX2PMA","","£240.00","£1,000.00"',
    ].join("\n");
    expect(creditsFromCsv(nationwide).credits[0]).toMatchObject({
      date: "2027-03-05",
      amount: 24000,
    });
  });

  it("Starling and Monzo exports: payer name and reference columns", () => {
    const starling = [
      "Date,Counter Party,Reference,Type,Amount (GBP),Balance (GBP),Spending Category,Notes",
      "05/03/2027,Jane Smith,K7QX2PMA,FASTER PAYMENT,240.00,1000.00,INCOME,",
    ].join("\n");
    expect(creditsFromCsv(starling).credits[0]).toMatchObject({
      payer: "Jane Smith",
      amount: 24000,
    });
    const monzo = [
      "Transaction ID,Date,Time,Type,Name,Emoji,Category,Amount,Currency,Local amount,Local currency,Notes and #tags,Address,Receipt,Description",
      "tx_0001,05/03/2027,10:00:00,Faster payment,Jane Smith,,Income,240.00,GBP,240.00,GBP,,,,K7QX2PMA",
    ].join("\n");
    const m = creditsFromCsv(monzo).credits[0]!;
    expect(m.sourceId).toBe("id-tx_0001");
    expect(m.text).toContain("K7QX2PMA");
  });

  it("HSBC: no header, date first and amount last", () => {
    const hsbc = '05/03/2027,"SMITH J K7QX2PMA",240.00\n06/03/2027,"TESCO",-12.50\n';
    const r = creditsFromCsv(hsbc);
    expect(r.understood).toBe(true);
    expect(r.credits).toHaveLength(1);
  });

  it("refuses something that isn't a statement", () => {
    expect(creditsFromCsv("name,email\nAlex,alex@example.com").understood).toBe(false);
  });

  it("gives the same row the same fingerprint, so a statement uploaded twice counts once", () => {
    const csv = "Date,Description,Amount\n05/03/2027,K7QX2PMA,240.00\n";
    expect(creditsFromCsv(csv).credits[0]!.sourceId).toBe(creditsFromCsv(csv).credits[0]!.sourceId);
  });
});

describe("Starling feed", () => {
  it("keeps settled money in, in the account's currency", () => {
    const items = [
      {
        feedItemUid: "a",
        direction: "IN",
        status: "SETTLED",
        amount: { currency: "GBP", minorUnits: 24000 },
        transactionTime: "2027-03-05T10:00:00Z",
        counterPartyName: "Jane Smith",
        reference: "K7QX2PMA",
      },
      {
        feedItemUid: "b",
        direction: "OUT",
        status: "SETTLED",
        amount: { currency: "GBP", minorUnits: 500 },
        transactionTime: "2027-03-05T10:00:00Z",
      },
      {
        feedItemUid: "c",
        direction: "IN",
        status: "PENDING",
        amount: { currency: "GBP", minorUnits: 900 },
        transactionTime: "2027-03-05T10:00:00Z",
      },
      {
        feedItemUid: "d",
        direction: "IN",
        status: "SETTLED",
        amount: { currency: "EUR", minorUnits: 900 },
        transactionTime: "2027-03-05T10:00:00Z",
      },
    ];
    expect(creditsFromStarling(items, "GBP")).toEqual([
      {
        sourceId: "starling-a",
        date: "2027-03-05",
        amount: 24000,
        text: "Jane Smith K7QX2PMA",
        payer: "Jane Smith",
      },
    ]);
    expect(creditsFromStarling(null, "GBP")).toEqual([]);
  });
});

describe("matching", () => {
  const w = (o: Partial<Waiting> = {}): Waiting => ({
    id: "r1",
    reference: "K7QX2PMA",
    total: 24000,
    name: "Jane Smith",
    bookedOn: "2027-03-01",
    ...o,
  });
  const c = (o: Partial<Credit> = {}): Credit => ({
    sourceId: "s1",
    date: "2027-03-05",
    amount: 24000,
    text: "J SMITH K7QX2PMA",
    payer: null,
    ...o,
  });

  it("finds the reference however the bank spaced or cased it", () => {
    expect(carriesReference("smith j k7qx 2pma", "K7QX2PMA")).toBe(true);
    expect(carriesReference("SMITH", "K7QX2PMA")).toBe(false);
  });

  it("the reference and the whole amount (or more): paid", () => {
    expect(matchCredits([c()], [w()])).toEqual([
      { reservationId: "r1", credit: c(), kind: "paid", why: "reference" },
    ]);
    expect(matchCredits([c({ amount: 25000 })], [w()])[0]!.kind).toBe("paid");
  });

  it("the reference with less money: for the host to check", () => {
    expect(matchCredits([c({ amount: 10000 })], [w()])[0]).toMatchObject({
      kind: "check",
      why: "reference_short",
    });
  });

  it("no reference but the exact amount from the guest's surname: for the host to check", () => {
    expect(matchCredits([c({ text: "JANE SMITH HOLIDAY" })], [w()])[0]).toMatchObject({
      kind: "check",
      why: "amount_and_name",
    });
    expect(matchCredits([c({ text: "SOMEONE ELSE" })], [w()])).toEqual([]);
  });

  it("never matches a payment from before the booking, or one payment to two bookings", () => {
    expect(matchCredits([c({ date: "2027-02-20" })], [w()])).toEqual([]);
    const two = matchCredits(
      [c({ text: "JANE SMITH" })],
      [w(), w({ id: "r2", reference: "ZZZZ2222" })],
    );
    expect(two).toHaveLength(1);
  });

  it("lists every major UK bank, with Starling the automatic one", () => {
    expect(BANKS.filter((b) => b.way === "automatic").map((b) => b.key)).toEqual(["starling"]);
    expect(BANKS.map((b) => b.key)).toContain("barclays");
  });
});
