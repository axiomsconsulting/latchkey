import { useState } from "react";
import { AlertTriangle, BadgeCheck, CircleHelp, IdCard, User } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { guestCard as copy } from "@/content/copy";
import { formatUkDate } from "@/lib/dates";
import { nationalityName } from "@/lib/hotel-register";

export type GuestPerson = {
  id: string;
  position: number;
  kind: "adult" | "child";
  age: number | null;
  fullName: string | null;
  documentType: string | null;
  issuingCountry: string | null;
  dateOfBirth: string | null;
  documentExpiry: string | null;
  documentLast4: string | null;
  nameMatch: "matched" | "partial" | "not_matched" | null;
  idChecked: boolean;
  skipped: boolean;
  idPhotoUrl: string | null;
  facePhotoUrl: string | null;
  deleteAfter: string;
  /** Their UK guest register entry, when there is one. */
  register: {
    fullName: string;
    nationality: string;
    documentNumber: string | null;
    placeOfIssue: string | null;
    nextDestination: string | null;
    nextAddress: string | null;
  } | null;
};

export function personTitle(p: GuestPerson) {
  if (p.kind === "child") return p.register ? `${p.register.fullName} (${p.age})` : copy.child(p.age);
  return p.fullName ?? p.register?.fullName ?? (p.position === 0 ? copy.leadGuest : copy.adult(p.position + 1));
}

/** The tick a host looks for: the photo ID matches the name on the booking. */
export function IdBadge({ p }: { p: GuestPerson }) {
  if (p.kind === "child") return null;
  if (p.nameMatch === "matched") {
    return (
      <Badge className="gap-1 bg-success text-success-foreground hover:bg-success">
        <BadgeCheck className="size-3.5" /> {copy.verified}
      </Badge>
    );
  }
  if (p.nameMatch === "not_matched") {
    return (
      <Badge variant="destructive" className="gap-1">
        <AlertTriangle className="size-3.5" /> {copy.idMismatch}
      </Badge>
    );
  }
  if (p.nameMatch === "partial") return <Badge variant="secondary">{copy.idPartial}</Badge>;
  if (p.idChecked) {
    return (
      <Badge variant="secondary" className="gap-1">
        <IdCard className="size-3.5" /> {copy.idChecked}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1">
      <CircleHelp className="size-3.5" /> {p.skipped ? copy.idSkipped : copy.idNone}
    </Badge>
  );
}

function Face({ p, size }: { p: GuestPerson; size: string }) {
  return p.facePhotoUrl ? (
    <img src={p.facePhotoUrl} alt="" className={`${size} shrink-0 rounded-full object-cover`} />
  ) : (
    <span className={`${size} grid shrink-0 place-items-center rounded-full bg-secondary text-muted-foreground`}>
      <User className="size-1/2" />
    </span>
  );
}

/**
 * Who arrived, with each adult's ID details and photos one tap away.
 * Children show their age only.
 */
export function GuestPeople({
  people,
  arrivedAdults,
  arrivedChildren,
  bookedCount,
}: {
  people: GuestPerson[];
  arrivedAdults: number | null;
  arrivedChildren: number | null;
  bookedCount: number;
}) {
  const [open, setOpen] = useState<GuestPerson | null>(null);

  return (
    <>
      {arrivedAdults ? (
        <p className="mb-2 text-sm text-muted-foreground">
          {copy.arrivedCount(arrivedAdults, arrivedChildren ?? 0)}
          {arrivedAdults + (arrivedChildren ?? 0) !== bookedCount ? ` · ${copy.bookedFor(bookedCount)}` : ""}
        </p>
      ) : null}
      {people.length === 0 ? (
        <p className="text-sm text-muted-foreground">{copy.noPeople}</p>
      ) : (
        <ul className="space-y-2">
          {people.map((p) => {
            const row = (
              <>
                <Face p={p} size="size-11" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{personTitle(p)}</span>
                  <span className="block text-xs text-muted-foreground">
                    {p.kind === "adult" && p.position === 0 ? copy.leadGuest : null}
                    {p.kind === "adult" && p.documentType ? `${p.position === 0 ? " · " : ""}${copy.docType[p.documentType] ?? p.documentType}` : null}
                    {p.register ? `${p.kind === "adult" && (p.position === 0 || p.documentType) ? " · " : ""}${nationalityName(p.register.nationality)}` : null}
                  </span>
                </span>
                <IdBadge p={p} />
              </>
            );
            return (
              <li key={p.id}>
                {p.kind === "adult" ? (
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 rounded-xl border border-border p-3 text-left hover:bg-secondary"
                    aria-label={copy.viewId(personTitle(p))}
                    onClick={() => setOpen(p)}
                  >
                    {row}
                  </button>
                ) : (
                  <div className="flex items-center gap-3 rounded-xl border border-border p-3">{row}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
          {open ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex flex-wrap items-center gap-2 font-display text-xl">
                  {copy.idDialogTitle(personTitle(open))} <IdBadge p={open} />
                </DialogTitle>
                <DialogDescription>{copy.deletedOn(formatUkDate(open.deleteAfter, { withYear: true }))}</DialogDescription>
              </DialogHeader>

              {open.idPhotoUrl || open.facePhotoUrl ? (
                <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                  {open.idPhotoUrl ? (
                    <figure>
                      <a href={open.idPhotoUrl} target="_blank" rel="noreferrer">
                        <img src={open.idPhotoUrl} alt={copy.idPhoto} className="w-full rounded-xl border border-border bg-muted object-contain" />
                      </a>
                      <figcaption className="mt-1 text-xs text-muted-foreground">{copy.idPhoto}</figcaption>
                    </figure>
                  ) : null}
                  {open.facePhotoUrl ? (
                    <figure>
                      <img src={open.facePhotoUrl} alt={copy.facePhoto} className="w-full rounded-xl border border-border object-cover" />
                      <figcaption className="mt-1 text-xs text-muted-foreground">{copy.facePhoto}</figcaption>
                    </figure>
                  ) : null}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">{copy.noPhotos}</p>
              )}

              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <Detail label={copy.detailName} value={open.fullName} />
                <Detail label={copy.detailDob} value={open.dateOfBirth ? formatUkDate(open.dateOfBirth, { withYear: true }) : null} />
                <Detail label={copy.detailDoc} value={open.documentType ? (copy.docType[open.documentType] ?? open.documentType) : null} />
                <Detail label={copy.detailCountry} value={open.issuingCountry} />
                <Detail label={copy.detailExpiry} value={open.documentExpiry ? formatUkDate(open.documentExpiry, { withYear: true }) : null} />
                <Detail label={copy.detailNumber} value={open.documentLast4 ? `•••• ${open.documentLast4}` : null} />
              </dl>

              {open.register ? (
                <section className="rounded-xl border border-border p-3">
                  <h4 className="font-medium">{copy.registerTitle}</h4>
                  <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                    <Detail label={copy.detailName} value={open.register.fullName} />
                    <Detail label={copy.registerNationality} value={nationalityName(open.register.nationality)} />
                    {open.register.documentNumber ? (
                      <>
                        <Detail label={copy.registerDocument} value={open.register.documentNumber} />
                        <Detail label={copy.registerPlace} value={open.register.placeOfIssue} />
                        <Detail label={copy.registerNext} value={open.register.nextDestination} />
                        <Detail label={copy.registerAddress} value={open.register.nextAddress} />
                      </>
                    ) : null}
                  </dl>
                </section>
              ) : null}
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

function Detail({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd>{value ?? "—"}</dd>
    </div>
  );
}
