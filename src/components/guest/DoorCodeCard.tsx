import { KeyRound } from "lucide-react";

import { doorCodesCopy as copy } from "@/content/copy";

export type GuestDoor = {
  code: string;
  spaced: string;
  steps: string[];
  unlockHow: string;
  lockHow: string;
};

/** The guest's door code and what to press, on their stay guide and at the end of check-in. */
export function DoorCodeCard({ door, className = "" }: { door: GuestDoor; className?: string }) {
  return (
    <section className={`card-soft p-5 text-left ${className}`}>
      <h2 className="flex items-center gap-2 text-lg">
        <KeyRound className="size-5 text-accent" aria-hidden /> {copy.guestTitle}
      </h2>
      <p className="mt-2 font-mono text-3xl tracking-widest sm:text-4xl">{door.spaced}</p>
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
