import { describe, expect, it } from "vitest";
import { identityOf, shortAccount, stripeDashboardUrl, stripeSetupProblem } from "@/lib/stripe-identity";

describe("stripe identity", () => {
  it("prefers the dashboard name and tidies codes", () => {
    const id = identityOf(
      { id: "acct_1AbCdEfGhIjKlMnO", email: " host@example.com ", country: "gb", default_currency: "gbp", charges_enabled: true, business_profile: { name: "Trinity Ltd" }, settings: { dashboard: { display_name: "Trinity Suites" }, payments: { statement_descriptor: "TRINITY SUITES" } } },
      true,
    );
    expect(id).toMatchObject({ name: "Trinity Suites", email: "host@example.com", country: "GB", currency: "GBP", statement: "TRINITY SUITES", charges: true, payouts: false, live: true });
    expect(identityOf({ id: "acct_x", business_profile: { name: "Biz" }, settings: { dashboard: { display_name: " " } } }, false).name).toBe("Biz");
  });
  it("shortens account ids", () => {
    expect(shortAccount("acct_1AbCdEfGhIjKlMnO")).toBe("acct_…KlMnO");
    expect(shortAccount("acct_123")).toBe("acct_123");
    expect(shortAccount(null)).toBe("");
  });
  it("links to the right dashboard", () => {
    expect(stripeDashboardUrl("connected", "acct_1", true)).toBe("https://dashboard.stripe.com/connect/accounts/acct_1");
    expect(stripeDashboardUrl("connected", "acct_1", false)).toBe("https://dashboard.stripe.com/test/connect/accounts/acct_1");
    expect(stripeDashboardUrl("own", null, true)).toBe("https://dashboard.stripe.com/settings/account");
  });
  it("spots Latchkey set-up problems in Stripe's errors", () => {
    expect(stripeSetupProblem("The provided key 'rk_live_...Gg7a' does not have the required permissions for this endpoint on account 'acct_1'. Enabling Accounts Write ('connected_account_write') permissions on this key would allow this request to continue.")).toBe("permission");
    expect(stripeSetupProblem("You can only create new accounts if you've signed up for Connect, which you can learn how to do at https://stripe.com/docs/connect.")).toBe("connect_off");
    expect(stripeSetupProblem("Your card was declined.")).toBeNull();
  });
});
