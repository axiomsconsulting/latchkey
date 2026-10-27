import { describe, expect, it } from "vitest";

import {
  abaValid,
  bankFields,
  bankLinesFor,
  bankProblems,
  bankReady,
  bicValid,
  ibanValid,
  normaliseBankAccount,
} from "../src/lib/bank-details";

describe("bank details by country", () => {
  it("asks for what each country's banks use", () => {
    expect(bankFields("GB").local.map((f) => f.key)).toEqual([
      "accountName",
      "sortCode",
      "accountNumber",
      "bankName",
    ]);
    expect(bankFields("FR").local.map((f) => f.key)).toEqual([
      "accountName",
      "iban",
      "bic",
      "bankName",
    ]);
    expect(bankFields("US").local.map((f) => f.key)).toContain("routingNumber");
    expect(bankFields("AU").local.map((f) => f.key)).toContain("bsb");
    expect(bankFields("IN").local.map((f) => f.key)).toContain("ifsc");
    expect(bankFields("BR").local.map((f) => f.key)).toContain("iban");
  });

  it("checks IBANs, BICs and US routing numbers", () => {
    expect(ibanValid("GB29 NWBK 6016 1331 9268 19")).toBe(true);
    expect(ibanValid("GB29NWBK60161331926818")).toBe(false);
    expect(ibanValid("DE89370400440532013000")).toBe(true);
    expect(bicValid("NWBKGB2L")).toBe(true);
    expect(bicValid("NWBKGB2LXXX")).toBe(true);
    expect(bicValid("NWBK")).toBe(false);
    expect(abaValid("026009593")).toBe(true);
    expect(abaValid("026009594")).toBe(false);
  });

  it("tidies what's typed and says what to fix", () => {
    const a = normaliseBankAccount({
      country: "GB",
      accountName: " Trinity  Suites Ltd ",
      sortCode: "60-16-13",
      accountNumber: "3192 6819",
      iban: "gb29 nwbk 6016 1331 9268 19",
      bic: "nwbk gb2l",
    });
    expect(a).toMatchObject({
      accountName: "Trinity Suites Ltd",
      sortCode: "601613",
      accountNumber: "31926819",
      iban: "GB29NWBK60161331926819",
      bic: "NWBKGB2L",
    });
    expect(bankReady(a)).toBe(true);
    const bad = normaliseBankAccount({
      country: "GB",
      accountName: "X",
      sortCode: "12345",
      accountNumber: "123",
    });
    expect(bankProblems(bad).map((p) => p.key)).toEqual(["sortCode", "accountNumber"]);
    expect(bankReady(normaliseBankAccount({ country: "DE", accountName: "Haus" }))).toBe(false);
  });

  it("shows local details at home and international ones abroad", () => {
    const a = normaliseBankAccount({
      country: "GB",
      accountName: "Trinity Suites Ltd",
      sortCode: "601613",
      accountNumber: "31926819",
      iban: "GB29NWBK60161331926819",
      bic: "NWBKGB2L",
      bankName: "NatWest",
    });
    expect(bankLinesFor(a, "GB")).toEqual([
      { label: "Account holder's name", value: "Trinity Suites Ltd" },
      { label: "Sort code", value: "60-16-13" },
      { label: "Account number", value: "31926819" },
      { label: "Bank name", value: "NatWest" },
    ]);
    expect(bankLinesFor(a, "FR")).toEqual([
      { label: "Account holder's name", value: "Trinity Suites Ltd" },
      { label: "IBAN", value: "GB29 NWBK 6016 1331 9268 19" },
      { label: "SWIFT / BIC", value: "NWBKGB2L" },
      { label: "Bank", value: "NatWest" },
      { label: "Bank's country", value: "GB" },
    ]);
  });
});
