/**
 * Stripe Global Payouts for Commission Partners outside the countries Stripe
 * Connect can pay (D2). Server only, and switched off: every call first
 * checks the programme setting, PARTNER_GLOBAL_PAYOUTS_ENABLED="true",
 * GLOBAL_PAYOUTS_FINANCIAL_ACCOUNT_ID and the test-mode guard.
 *
 * Before switching it on (PR notes):
 * - Global Payouts needs Stripe Treasury, which is in public preview in the UK.
 * - OMS carries the compliance burden itself (Stripe: "Manage your own legal
 *   and compliance requirements"); take advice first.
 * - UK to overseas may need Stripe's early access for cross-border payouts
 *   (D1/D2): confirm with Stripe for OMS's account.
 * - Payouts come from the Treasury financial account, which must be funded
 *   separately from the payments balance.
 * - It's a v2 JSON API with a preview Stripe-Version; check the request
 *   shapes against https://docs.stripe.com/global-payouts before use.
 */
import type { PartnerConfig } from "./partner-config";
import type { PayoutToSend } from "./partner-close";
import type { AnyDb } from "./partner-data.server";
import { partnerStripeKey, v2 } from "./partner-stripe.server";

export class GlobalPayoutsDisabled extends Error {
  constructor(why: string) {
    super(`Global Payouts is switched off (${why}). Pay this Commission Partner by hand instead.`);
    this.name = "GlobalPayoutsDisabled";
  }
}

export function assertGlobalPayoutsEnabled(
  config: Pick<PartnerConfig, "globalPayoutsEnabled">,
): string {
  if (!config.globalPayoutsEnabled) throw new GlobalPayoutsDisabled("programme setting");
  if (process.env["PARTNER_GLOBAL_PAYOUTS_ENABLED"] !== "true")
    throw new GlobalPayoutsDisabled("PARTNER_GLOBAL_PAYOUTS_ENABLED");
  const fa = process.env["GLOBAL_PAYOUTS_FINANCIAL_ACCOUNT_ID"];
  if (!fa) throw new GlobalPayoutsDisabled("GLOBAL_PAYOUTS_FINANCIAL_ACCOUNT_ID");
  partnerStripeKey();
  return fa;
}

/** A recipient account for a partner, and a Stripe-hosted link for their bank details (Latchkey never holds them). */
export async function createRecipient(
  partner: { id: string; country: string; email: string; legal_name: string },
  config: PartnerConfig,
  returnUrl: string,
) {
  assertGlobalPayoutsEnabled(config);
  const v = { version: config.globalPayoutsApiVersion };
  const account = await v2<{ id: string }>(
    "/core/accounts",
    {
      contact_email: partner.email,
      display_name: partner.legal_name,
      identity: { country: partner.country.toLowerCase() },
      configuration: {
        recipient: {
          capabilities: {
            bank_accounts: { local: { requested: true }, wire: { requested: true } },
          },
        },
      },
      include: ["configuration.recipient", "identity"],
      metadata: { partner_id: partner.id, kind: "commission_partner" },
    },
    { ...v, idempotencyKey: `gp_recipient_${partner.id}` },
  );
  const link = await v2<{ url: string }>(
    "/core/account_links",
    {
      account: account.id,
      use_case: {
        type: "account_onboarding",
        account_onboarding: {
          configurations: ["recipient"],
          return_url: returnUrl,
          refresh_url: returnUrl,
        },
      },
    },
    v,
  );
  return { recipientId: account.id, url: link.url };
}

/** Sends a payout in pounds from the Treasury financial account to the partner's saved payout method. */
export async function sendGlobalPayout(
  db: AnyDb,
  p: PayoutToSend,
  config: PartnerConfig,
): Promise<{ id: string }> {
  const financialAccount = assertGlobalPayoutsEnabled(config);
  const { data: partner } = await db
    .from("partners")
    .select("gp_recipient_id, gp_payout_method_id")
    .eq("id", p.partner_id)
    .single();
  if (!partner?.gp_recipient_id || !partner?.gp_payout_method_id)
    throw new Error("This partner hasn't added bank details through Stripe yet.");
  return v2<{ id: string }>(
    "/money_management/outbound_payments",
    {
      from: { financial_account: financialAccount, currency: "gbp" },
      to: {
        recipient: partner.gp_recipient_id,
        payout_method: partner.gp_payout_method_id,
        currency: "gbp",
      },
      amount: { value: p.amount_pence, currency: "gbp" },
      description: "Latchkey Commission Partner payout",
      metadata: { partner_id: p.partner_id, payout_id: p.id },
    },
    { version: config.globalPayoutsApiVersion, idempotencyKey: p.idempotency_key },
  );
}

export async function getGlobalPayout(id: string, config: PartnerConfig) {
  assertGlobalPayoutsEnabled(config);
  return v2<{ id: string; status: string }>(
    `/money_management/outbound_payments/${encodeURIComponent(id)}`,
    undefined,
    { version: config.globalPayoutsApiVersion },
  );
}
