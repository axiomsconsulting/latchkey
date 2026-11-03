import { KeyRound } from "lucide-react";

import { doorCodesCopy as copy } from "@/content/copy";
import type { DoorKey } from "@/lib/door-codes";

export type GuestDoor = {
  door: DoorKey;
  code: string | null;
  spaced: string;
  steps: string[];
  unlockHow: string;
  lockHow: string;
  keyNote: string;
};

/** One door on the guest's stay guide and at the end of check-in: its code and what to press, or how the key works. */
export function DoorCodeCard({ door, className = "" }: { door: GuestDoor; className?: string }) {
  return (
    <section className={`card-soft p-5 text-left ${className}`}>
      <h2 className="flex items-center gap-2 text-lg">
        <KeyRound className="size-5 text-accent" aria-hidden /> {copy.doors[door.door]}
      </h2>
      {door.code ? (
        <p className="mt-2 font-mono text-3xl tracking-widest sm:text-4xl">{door.spaced}</p>
      ) : (
        <p className="mt-2 whitespace-pre-line">{door.keyNote}</p>
      )}
      {door.steps.length > 1 ? (
        <ol className="mt-3 list-decimal space-y-0.5 pl-5">
          {door.steps.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
      ) : null}
      {door.unlockHow ? <p className="mt-3 whitespace-pre-line">{door.unlockHow}</p> : null}
      {door.lockHow ? (
        <p className="mt-3 whitespace-pre-line">
          <span className="font-medium">{copy.guestLock}</span> {door.lockHow}
        </p>
      ) : null}
    </section>
  );
}
