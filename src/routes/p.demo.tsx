import { createFileRoute } from "@tanstack/react-router";
import { KeyRound, LifeBuoy, MapPin } from "lucide-react";

import { Button } from "@/components/ui/button";
import { guest } from "@/content/copy";

export const Route = createFileRoute("/p/demo")({
  head: () => ({
    meta: [
      { title: "Welcome to The Trinity Rooms — check in" },
      {
        name: "description",
        content:
          "Check yourself in at The Trinity Rooms in High Wycombe. No app, no sign-up, takes about a minute.",
      },
      { property: "og:title", content: "Welcome to The Trinity Rooms — check in" },
      {
        property: "og:description",
        content: "Self check-in for The Trinity Rooms, High Wycombe.",
      },
    ],
  }),
  component: GuestLanding,
});

function GuestLanding() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-5 py-10">
      <main className="card-soft w-full max-w-2xl p-7 text-center sm:p-12">
        <span className="inline-flex items-center gap-2 rounded-full bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground">
          <MapPin className="size-4" />
          {guest.location}
        </span>

        <h1 className="mt-6 text-3xl leading-tight sm:text-5xl">{guest.welcome}</h1>
        <p className="mx-auto mt-5 max-w-prose text-base leading-relaxed text-muted-foreground sm:text-lg">
          {guest.welcomeBody}
        </p>

        <div className="mt-9 flex flex-col items-center gap-3">
          <Button size="touch-xl" variant="default" className="max-w-md">
            <KeyRound />
            {guest.startCta}
          </Button>
          <Button size="touch" variant="ghost" className="w-full max-w-md">
            <LifeBuoy />
            {guest.helpCta}
          </Button>
        </div>

        <p className="mt-8 text-sm text-muted-foreground">{guest.reassurance}</p>
      </main>
    </div>
  );
}
