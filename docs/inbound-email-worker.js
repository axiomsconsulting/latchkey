/**
 * Optional: Cloudflare Email Routing → this Email Worker → Latchkey.
 * Use it instead of Postmark if your domain's DNS is on Cloudflare.
 *
 * 1. Cloudflare dashboard → your domain → Email → Email Routing → enable.
 * 2. Workers & Pages → Create → Worker. Paste this file, add the dependency
 *    "postal-mime" (npm), and set two variables:
 *      LATCHKEY_URL = https://<your-latchkey-site>/api/public/inbound-email/<INBOUND_EMAIL_SECRET>
 * 3. Email Routing → Routes → Catch-all (or a subdomain such as in.yourdomain)
 *    → Send to a Worker → this worker.
 * 4. In Latchkey admin → Integrations, set the pattern to {code}@in.yourdomain
 *    (or anything+{code}@yourdomain).
 */
import PostalMime from "postal-mime";

export default {
  async email(message, env) {
    const parsed = await PostalMime.parse(message.raw);
    const body = {
      to: [message.to],
      from: message.from,
      replyTo: parsed.replyTo?.[0]?.address ?? null,
      subject: parsed.subject ?? "",
      text: parsed.text ?? "",
      html: parsed.html ?? null,
      messageId: parsed.messageId ?? null,
    };
    await fetch(env.LATCHKEY_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  },
};
