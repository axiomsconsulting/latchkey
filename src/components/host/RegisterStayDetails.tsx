import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download, Eye } from "lucide-react";
import { toast } from "sonner";

import { IdBadge, personTitle, type GuestPerson } from "@/components/host/GuestPeople";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { common, guestCard, registerPage as copy } from "@/content/copy";
import { formatUkDate } from "@/lib/dates";
import { getGuestDetails } from "@/lib/guests.functions";
import { nationalityName } from "@/lib/hotel-register";

const when = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

type Photo = { url: string; who: string; what: string; file: string; deleteAfter: string };

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "guest";

/** Saves the photo as a file; the signed link is short-lived and on another site, so fetch it first. */
async function download(photo: Photo) {
  try {
    const res = await fetch(photo.url);
    if (!res.ok) throw new Error(String(res.status));
    const href = URL.createObjectURL(await res.blob());
    const a = document.createElement("a");
    a.href = href;
    a.download = photo.file;
    a.click();
    URL.revokeObjectURL(href);
  } catch {
    toast.error(copy.downloadFailed);
  }
}

/**
 * Under a stay's entries in the guest register: each guest's ID photographs
 * (preview and download) and everything they gave at check-in. Read when
 * opened, with photo links that last 10 minutes.
 */
export function RegisterStayDetails({ bookingId }: { bookingId: string }) {
  const fetchFn = useServerFn(getGuestDetails);
  const q = useQuery({ queryKey: ["register-stay", bookingId], queryFn: () => fetchFn({ data: { bookingId } }), staleTime: 5 * 60_000 });
  const [preview, setPreview] = useState<Photo | null>(null);

  if (q.isLoading) return <Skeleton className="h-40 rounded-xl" />;
  if (q.error || !q.data) return <p className="text-sm text-muted-foreground">{q.error instanceof Error ? q.error.message : common.errorBody}</p>;

  const { booking: b, people } = q.data as { booking: typeof q.data.booking; people: GuestPerson[] };
  const photos: Photo[] = people.flatMap((p) => {
    const who = personTitle(p);
    const out: Photo[] = [];
    if (p.idPhotoUrl) out.push({ url: p.idPhotoUrl, who, what: guestCard.idPhoto, file: `${slug(who)}-id-${b.checkIn}.jpg`, deleteAfter: p.deleteAfter });
    if (p.facePhotoUrl) out.push({ url: p.facePhotoUrl, who, what: guestCard.facePhoto, file: `${slug(who)}-face-${b.checkIn}.jpg`, deleteAfter: p.deleteAfter });
    return out;
  });

  return (
    <div className="space-y-5">
      <section>
        <h3 className="font-medium">{copy.photosTitle}</h3>
        {photos.length === 0 ? (
          <p className="mt-1 text-sm text-muted-foreground">{copy.noPhotosKept}</p>
        ) : (
          <ul className="mt-2 flex flex-wrap gap-3">
            {photos.map((ph) => (
              <li key={ph.url} className="w-52 rounded-xl border border-border bg-card p-2">
                <button type="button" className="block w-full" onClick={() => setPreview(ph)} aria-label={`${copy.preview}: ${copy.photoOf(ph.who, ph.what)}`}>
                  <img src={ph.url} alt="" className="aspect-[4/3] w-full rounded-lg bg-muted object-cover" />
                </button>
                <p className="mt-1 truncate text-xs font-medium">{ph.who}</p>
                <p className="text-xs text-muted-foreground">{ph.what}</p>
                <div className="mt-1 flex gap-1">
                  <Button size="sm" variant="ghost" className="h-8 flex-1 px-2" onClick={() => setPreview(ph)}>
                    <Eye className="size-4" /> {copy.preview}
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8 flex-1 px-2" onClick={() => void download(ph)}>
                    <Download className="size-4" /> {copy.downloadPhoto}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="font-medium">{copy.dataTitle}</h3>
        <dl className="mt-2 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
          <Fact label={copy.factRef} value={b.reservationCode} />
          <Fact label={copy.factRoom} value={b.roomName} />
          <Fact label={copy.factDates} value={`${formatUkDate(b.checkIn, { withYear: true })} – ${formatUkDate(b.checkOut, { withYear: true })}`} />
          <Fact label={copy.factCheckedIn} value={b.checkedInAt ? when.format(new Date(b.checkedInAt)) : null} />
          <Fact label={copy.factArrived} value={b.arrivedAdults ? guestCard.arrivedCount(b.arrivedAdults, b.arrivedChildren ?? 0) : null} />
          <Fact label={copy.factEmail} value={b.email} />
          <Fact label={copy.factPhone} value={b.phoneLast4 ? `•••• ${b.phoneLast4}` : null} />
          <Fact label={copy.factAddress} value={b.address} />
        </dl>

        {people.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">{copy.noDetails}</p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[52rem] text-left text-xs">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  {[copy.colGuest, copy.colType, guestCard.registerNationality, copy.colIdType, copy.colIssuedBy, copy.colDob, copy.colExpiry, copy.colNumberEnds, copy.colCheck, copy.colDeleted].map((h) => (
                    <th key={h} className="px-3 py-2 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {people.map((p) => (
                  <tr key={p.id} className="align-top">
                    <td className="px-3 py-2 font-medium">
                      {personTitle(p)}
                      {p.position === 0 ? <span className="block font-normal text-muted-foreground">{guestCard.leadGuest}</span> : null}
                    </td>
                    <td className="px-3 py-2">{p.kind === "child" ? copy.child(p.age) : copy.adult}</td>
                    <td className="px-3 py-2">{p.register ? nationalityName(p.register.nationality) : "—"}</td>
                    <td className="px-3 py-2">{p.documentType ? (guestCard.docType[p.documentType] ?? p.documentType) : "—"}</td>
                    <td className="px-3 py-2">{p.issuingCountry ?? "—"}</td>
                    <td className="whitespace-nowrap px-3 py-2">{p.dateOfBirth ? formatUkDate(p.dateOfBirth, { withYear: true }) : "—"}</td>
                    <td className="whitespace-nowrap px-3 py-2">{p.documentExpiry ? formatUkDate(p.documentExpiry, { withYear: true }) : "—"}</td>
                    <td className="whitespace-nowrap px-3 py-2">{p.documentLast4 ? `•••• ${p.documentLast4}` : "—"}</td>
                    <td className="px-3 py-2">
                      <IdBadge p={p} />
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">{p.idPhotoUrl || p.facePhotoUrl ? formatUkDate(p.deleteAfter, { withYear: true }) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-h-[94dvh] overflow-y-auto sm:max-w-3xl">
          {preview ? (
            <>
              <DialogHeader>
                <DialogTitle className="font-display text-xl">{copy.photoOf(preview.who, preview.what)}</DialogTitle>
                <DialogDescription>{guestCard.deletedOn(formatUkDate(preview.deleteAfter, { withYear: true }))}</DialogDescription>
              </DialogHeader>
              <img src={preview.url} alt={copy.photoOf(preview.who, preview.what)} className="mx-auto max-h-[70dvh] w-auto rounded-xl border border-border bg-muted object-contain" />
              <Button onClick={() => void download(preview)}>
                <Download className="size-4" /> {copy.downloadPhoto}
              </Button>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="break-words">{value || "—"}</dd>
    </div>
  );
}
