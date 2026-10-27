import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Loader2, RefreshCw, TriangleAlert, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { propertyCodesCopy as copy } from "@/content/copy";
import { cleanLink } from "@/lib/property-codes";
import {
  checkDoorPin,
  checkGuestLink,
  newDoorPin,
  suggestGuestLink,
} from "@/lib/property-codes.functions";
import { cn } from "@/lib/utils";

/** Waits until typing stops before asking the server. */
function useDebounced<T>(value: T, ms = 450) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(id);
  }, [value, ms]);
  return v;
}

function Status({
  tone,
  children,
}: {
  tone: "ok" | "bad" | "warn" | "wait" | "hint";
  children: React.ReactNode;
}) {
  const Icon =
    tone === "ok"
      ? CheckCircle2
      : tone === "bad"
        ? XCircle
        : tone === "warn"
          ? TriangleAlert
          : tone === "wait"
            ? Loader2
            : null;
  return (
    <p
      aria-live="polite"
      className={cn(
        "flex items-center gap-1.5 text-sm",
        tone === "ok" && "text-success",
        tone === "bad" && "text-destructive",
        tone === "warn" && "text-amber-700 dark:text-amber-300",
        (tone === "wait" || tone === "hint") && "text-muted-foreground",
      )}
    >
      {Icon ? <Icon className={cn("size-4 shrink-0", tone === "wait" && "animate-spin")} /> : null}
      <span>{children}</span>
    </p>
  );
}

type LinkCtx = { name: string; address?: string | null; postcode?: string | null };

/**
 * The property's guest link. New properties get a free one made from the
 * name, kept in step with the name until the host types their own; every
 * value is checked against all properties, with up to three free
 * alternatives when it's taken.
 */
export function GuestLinkField({
  id = "guest-link",
  label,
  value,
  onChange,
  propertyId,
  context,
  auto = false,
  onValid,
}: {
  id?: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  propertyId?: string | null | undefined;
  context: LinkCtx;
  /** A new property: suggest from the name until the host edits it. */
  auto?: boolean;
  onValid?: ((ok: boolean) => void) | undefined;
}) {
  const check = useServerFn(checkGuestLink);
  const suggest = useServerFn(suggestGuestLink);
  const [edited, setEdited] = useState(!auto || !!value);
  const [result, setResult] = useState<Awaited<ReturnType<typeof checkGuestLink>> | null>(null);
  const [busy, setBusy] = useState(false);
  const name = useDebounced(context.name, 600);
  const code = useDebounced(value);
  const ctx = useRef(context);
  ctx.current = context;

  // Follow the name with a free link until the host types their own.
  useEffect(() => {
    if (edited || !name.trim()) return;
    let live = true;
    void suggest({ data: { ...ctx.current, name, propertyId: propertyId ?? null } })
      .then((r) => live && onChange(r.code))
      .catch(() => {});
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, edited, propertyId]);

  useEffect(() => {
    if (!code) {
      setResult(null);
      onValid?.(!auto ? false : true);
      return;
    }
    let live = true;
    setBusy(true);
    void check({ data: { ...ctx.current, code, propertyId: propertyId ?? null } })
      .then((r) => {
        if (!live) return;
        setResult(r);
        onValid?.(r.available);
      })
      .catch(() => live && setResult(null))
      .finally(() => live && setBusy(false));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, propertyId]);

  const waiting = busy || code !== value;
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex h-12 items-center rounded-xl border border-input bg-background pl-3 focus-within:ring-2 focus-within:ring-ring">
        <span className="select-none text-sm text-muted-foreground">/kiosk/</span>
        <Input
          id={id}
          className="h-full border-0 pl-0.5 shadow-none focus-visible:ring-0"
          value={value}
          autoCapitalize="none"
          spellCheck={false}
          onChange={(e) => {
            setEdited(true);
            onChange(
              e.target.value
                .toLowerCase()
                .replace(/[^a-z0-9-]/g, "-")
                .replace(/-{2,}/g, "-")
                .slice(0, 40),
            );
          }}
          onBlur={() => value && onChange(cleanLink(value))}
        />
      </div>
      {!value ? null : waiting ? (
        <Status tone="wait">{copy.checking}</Status>
      ) : result?.problem && result.problem !== "reserved" ? (
        <Status tone="bad">{copy.linkProblems[result.problem]}</Status>
      ) : result && !result.available ? (
        <div className="space-y-2">
          <Status tone="bad">
            {result.problem === "reserved" ? copy.linkProblems["reserved"] : copy.linkTaken}
          </Status>
          {result.suggestions.length ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted-foreground">{copy.linkTry}</span>
              {result.suggestions.map((s) => (
                <Button
                  key={s}
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 rounded-full font-mono text-xs"
                  onClick={() => onChange(s)}
                >
                  {s}
                </Button>
              ))}
            </div>
          ) : null}
          <p className="text-xs text-muted-foreground">{copy.linkAskMore}</p>
        </div>
      ) : result?.available ? (
        <Status tone="ok">
          {copy.linkFree}
          {!edited ? ` · ${copy.linkAuto}` : ""}
        </Status>
      ) : null}
    </div>
  );
}

/**
 * The door PIN. New properties get a free random one straight away; any PIN
 * typed is checked against all properties, and easy guesses are pointed out.
 */
export function DoorPinField({
  id = "door-pin",
  label,
  value,
  onChange,
  propertyId,
  auto = false,
  onValid,
}: {
  id?: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  propertyId?: string | null | undefined;
  /** A new property: make a free PIN when the field is empty. */
  auto?: boolean;
  onValid?: ((ok: boolean) => void) | undefined;
}) {
  const check = useServerFn(checkDoorPin);
  const make = useServerFn(newDoorPin);
  const [result, setResult] = useState<{ available: boolean; weak: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [made, setMade] = useState<string | null>(null);
  const pin = useDebounced(value, 350);

  async function fresh() {
    setBusy(true);
    try {
      const r = await make({ data: { propertyId: propertyId ?? null } });
      setMade(r.pin);
      onChange(r.pin);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (auto && !value) void fresh().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!/^\d{6}$/.test(pin)) {
      setResult(null);
      onValid?.(pin === "");
      return;
    }
    // A PIN the server just made is free already.
    if (pin === made) {
      setResult({ available: true, weak: false });
      onValid?.(true);
      return;
    }
    let live = true;
    setBusy(true);
    void check({ data: { pin, propertyId: propertyId ?? null } })
      .then((r) => {
        if (!live) return;
        setResult(r);
        onValid?.(r.available);
      })
      .catch(() => live && setResult(null))
      .finally(() => live && setBusy(false));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin, propertyId]);

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex gap-2">
        <Input
          id={id}
          inputMode="numeric"
          autoComplete="off"
          maxLength={6}
          className="h-12 font-mono tracking-[0.3em]"
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
        />
        <Button
          type="button"
          variant="outline"
          className="h-12 shrink-0"
          disabled={busy}
          onClick={() => void fresh()}
        >
          <RefreshCw className={cn("size-4", busy && "animate-spin")} /> {copy.pinNew}
        </Button>
      </div>
      {!value ? null : value.length < 6 ? (
        <Status tone="hint">{copy.pinNeeds}</Status>
      ) : busy || pin !== value ? (
        <Status tone="wait">{copy.checking}</Status>
      ) : result && !result.available ? (
        <Status tone="bad">{copy.pinTaken}</Status>
      ) : result?.available ? (
        <div className="space-y-1">
          <Status tone="ok">
            {copy.pinFree}
            {value === made ? ` · ${copy.pinAuto}` : ""}
          </Status>
          {result.weak ? <Status tone="warn">{copy.pinWeak}</Status> : null}
        </div>
      ) : null}
    </div>
  );
}
