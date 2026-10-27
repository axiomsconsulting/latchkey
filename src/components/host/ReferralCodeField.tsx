import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { partnerCopy as copy } from "@/content/copy";
import { deviceId, storedReferral, unconfirmedReferralCode } from "@/lib/attribution";
import {
  attachReasonText,
  attachReferral,
  myReferral,
  type AttachResult,
} from "@/lib/partner-referrals.functions";

/**
 * Set-up's optional Commission Partner code. A code from a partner's link
 * (the lk_ref cookie) is filled in and added straight away; a code from a
 * link this visit came through without cookies accepted is filled in for the
 * owner to confirm; otherwise the owner may type one. The server checks every code and decides; this only
 * asks. Hidden when the programme isn't set up or a partner is already noted.
 */
export function ReferralCodeField({ hostId }: { hostId: string }) {
  const attach = useServerFn(attachReferral);
  const mine = useServerFn(myReferral);
  const status = useQuery({
    queryKey: ["my-referral", hostId],
    queryFn: () => mine({ data: { hostId } }),
    staleTime: 60_000,
  });
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AttachResult | null>(null);
  const tried = useRef(false);

  async function send(c: string, source: "cookie" | "typed", clickedAt?: string) {
    setBusy(true);
    try {
      setResult(
        await attach({
          data: { hostId, code: c, source, clickedAt: clickedAt ?? null, deviceId: deviceId() },
        }),
      );
    } catch {
      setResult({ ok: false, reason: "not_set_up" });
    } finally {
      setBusy(false);
    }
  }

  // A partner's link: added once, as soon as we know there's no partner yet.
  useEffect(() => {
    if (tried.current || !status.data?.setUp || status.data.attached) return;
    const ref = storedReferral();
    if (!ref) {
      const code = unconfirmedReferralCode();
      if (code) setCode(code);
      return;
    }
    tried.current = true;
    setCode(ref.code);
    void send(ref.code, "cookie", ref.clicked_at);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status.data]);

  if (!status.data?.setUp || (status.data.attached && !result)) return null;
  if (result?.ok) {
    return (
      <p className="card-soft flex items-center gap-2 p-4 text-sm">
        <CheckCircle2 className="size-4 shrink-0 text-success" /> {copy.codeAdded}
      </p>
    );
  }
  const problem = result ? attachReasonText(result) : null;
  return (
    <form
      className="card-soft grid gap-2 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (code.trim()) void send(code.trim(), "typed");
      }}
    >
      <Label htmlFor="partner-code">{copy.codeLabel}</Label>
      <div className="flex gap-2">
        <Input
          id="partner-code"
          className="h-11 uppercase"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          maxLength={32}
          autoComplete="off"
          placeholder="OMS-XXXXX"
        />
        <Button
          type="submit"
          variant="outline"
          className="h-11 shrink-0"
          disabled={busy || !code.trim()}
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : copy.codeAdd}
        </Button>
      </div>
      <p
        className={problem ? "text-sm text-destructive" : "text-xs text-muted-foreground"}
        role={problem ? "alert" : undefined}
      >
        {problem ?? copy.codeHint}
      </p>
    </form>
  );
}
