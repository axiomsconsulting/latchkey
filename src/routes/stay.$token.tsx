import { createFileRoute } from "@tanstack/react-router";
import { Car, Clock, Moon, Phone, ScrollText, Wifi } from "lucide-react";
import type { ReactNode } from "react";

import { GuestFrame, GuestMessage } from "@/components/guest/GuestFrame";
import { StayServices } from "@/components/guest/StayServices";
import { guest as copy } from "@/content/copy";
import { getStay } from "@/lib/checkin.functions";
import { formatUkDate, formatUkTime } from "@/lib/dates";

export const Route = createFileRoute("/stay/$token")({
  loader: ({ params }) => getStay({ data: { token: params.token } }),
  head: () => ({
    meta: [
      { title: "Your stay — Latchkey" },
      { name: "description", content: "Everything you need for your stay." },
      { property: "og:title", content: "Your stay — Latchkey" },
      { property: "og:description", content: "Everything you need for your stay." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  errorComponent: () => (
    <GuestFrame>
      <GuestMessage text={copy.error} />
    </GuestFrame>
  ),
  component: Stay,
});

function Card({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className="card-soft p-5">
      <h2 className="flex items-center gap-2 text-lg">
        {icon} {title}
      </h2>
      <div className="mt-2 text-muted-foreground">{children}</div>
    </section>
  );
}

function Stay() {
  const s = Route.useLoaderData();
  if (!s.found) {
    return (
      <GuestFrame>
        <GuestMessage text={copy.stayGone} />
      </GuestFrame>
    );
  }
  const p = s.property;
  const { token } = Route.useParams();
  return (
    <GuestFrame theme={s.theme} name={p?.name ?? undefined}>
      <main className="mx-auto max-w-4xl space-y-4 py-8">
        <div>
          <h1 className="text-3xl sm:text-5xl">{copy.stayTitle(s.firstName)}</h1>
          <p className="mt-2 text-lg text-muted-foreground">
            {s.room ? copy.roomLine(s.room.display_name, s.room.public_title) : p?.name}
          </p>
          {s.room?.description ? <p className="mt-2">{s.room.description}</p> : null}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {p?.wifi_name ? (
            <Card icon={<Wifi className="size-5 text-primary" />} title={copy.stayWifi}>
              <p>
                {copy.stayNetwork}: <span className="font-medium text-foreground">{p.wifi_name}</span>
              </p>
              {p.wifi_password ? (
                <p>
                  {copy.stayPassword}: <span className="font-mono font-medium text-foreground">{p.wifi_password}</span>
                </p>
              ) : null}
            </Card>
          ) : null}
          <Card icon={<Clock className="size-5 text-primary" />} title={copy.stayCheckout}>
            {formatUkDate(s.checkOutDate)}, {s.checkOutTime}
          </Card>
          {p ? (
            <Card icon={<Moon className="size-5 text-primary" />} title={copy.stayQuiet}>
              {formatUkTime(p.quiet_hours_start)}–{formatUkTime(p.quiet_hours_end)}
            </Card>
          ) : null}
          {p?.parking_notes ? (
            <Card icon={<Car className="size-5 text-primary" />} title={copy.stayParking}>
              {p.parking_notes}
            </Card>
          ) : null}
          <Card icon={<ScrollText className="size-5 text-primary" />} title={copy.stayRules}>
            <ul className="list-disc pl-5">
              {copy.stayRulesList.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </Card>
          {p?.host_contact_phone ? (
            <Card icon={<Phone className="size-5 text-primary" />} title={copy.stayHost}>
              {p.host_contact_name ? `${p.host_contact_name} · ` : ""}
              <a className="font-medium text-primary underline" href={`tel:${p.host_contact_phone.replace(/\s+/g, "")}`}>
                {p.host_contact_phone}
              </a>
            </Card>
          ) : null}
        </div>
        <StayServices token={token} />
      </main>
    </GuestFrame>
  );
}
