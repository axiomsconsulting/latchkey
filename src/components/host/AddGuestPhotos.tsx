import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Camera, IdCard, Loader2 } from "lucide-react";
import { toast } from "sonner";

import type { GuestPerson } from "@/components/host/GuestPeople";
import { personTitle } from "@/components/host/GuestPeople";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { common, guestCard as copy } from "@/content/copy";
import { addGuestPhoto } from "@/lib/guests.functions";
import { fromFile } from "@/lib/photo-file";

/**
 * The guest card: the host adds an ID or face photo for anyone on the stay, now or later. The
 * file field opens the phone's camera or photo library (or a file on a computer); the photo is
 * shrunk on the device and kept by the same rules as the door tablet's.
 */
export function AddGuestPhotos({
  bookingId,
  people,
  keepsPhotos,
}: {
  bookingId: string;
  people: GuestPerson[];
  /** The host has confirmed their regulator registration, so photos can be kept. */
  keepsPhotos: boolean;
}) {
  const send = useServerFn(addGuestPhoto);
  const qc = useQueryClient();
  const file = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<"id" | "face">("id");
  const [busy, setBusy] = useState(false);
  const adults = people.filter((p) => p.kind === "adult");
  const next = Math.min(29, Math.max(-1, ...people.map((p) => p.position)) + 1);
  const choices = [
    ...(adults.some((p) => p.position === 0) ? [] : [{ value: "0", label: copy.leadGuest }]),
    ...adults.map((p) => ({ value: String(p.position), label: personTitle(p) })),
    ...(next > 0 ? [{ value: String(next), label: copy.anotherAdult }] : []),
  ];
  const [who, setWho] = useState(choices[0]?.value ?? "0");

  if (!keepsPhotos)
    return (
      <p className="mt-3 rounded-xl bg-muted p-3 text-sm">
        {copy.photoNeedsRegistration}{" "}
        <Link to="/app/settings" search={{ focus: "records" }} className="underline">
          {copy.photoSettings}
        </Link>
      </p>
    );

  async function picked(f: File | undefined) {
    if (!f) return;
    setBusy(true);
    try {
      const { small } = await fromFile(f);
      await send({ data: { bookingId, position: Number(who), kind, image: small } });
      await qc.invalidateQueries({ queryKey: ["guest", bookingId] });
      await qc.invalidateQueries({ queryKey: ["checkin-marks"] });
      toast.success(copy.photoAdded);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : common.errorBody);
    } finally {
      setBusy(false);
    }
  }
  const choose = (k: "id" | "face") => {
    setKind(k);
    file.current?.click();
  };

  return (
    <div className="mt-3 space-y-2 rounded-xl border border-border p-3">
      <p className="text-sm font-medium">{copy.addPhotos}</p>
      <p className="text-xs text-muted-foreground">{copy.addPhotosHelp}</p>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm">{copy.addFor}</span>
        <Select value={who} onValueChange={setWho}>
          <SelectTrigger className="h-9 w-auto min-w-40">
            <SelectValue>{choices.find((c) => c.value === who)?.label}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {choices.map((c) => (
              <SelectItem key={c.value} value={c.value}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => choose("id")}>
          {busy && kind === "id" ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <IdCard className="size-4" />
          )}
          {copy.addIdPhoto}
        </Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => choose("face")}>
          {busy && kind === "face" ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Camera className="size-4" />
          )}
          {copy.addFacePhoto}
        </Button>
      </div>
      {/* No "capture": phones offer the camera or the photo library, computers a file. */}
      <input
        ref={file}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          void picked(f);
        }}
      />
    </div>
  );
}
