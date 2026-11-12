import { Thermometer } from "lucide-react";

import { AREA_FILL, ITEM_ICON, LINE_LOOK } from "@/components/floor-map-look";
import type { ItemKind, Point } from "@/lib/floor-map";
import { cn } from "@/lib/utils";

export type MapViewArea = { id?: string; poly: Point[]; access: string; kind?: string };
export type MapViewLine = { id?: string; kind: string; pts: Point[] };
export type MapViewItem = { id?: string; kind: string; at: Point };

const poly = (p: Point[]) => p.map((q) => `${q.x},${q.y}`).join(" ");

/**
 * A floor plan picture with its map drawn over it: areas (private ones hatched, the guest's room
 * lit), doors and barriers, stairs with an arrow, items as icons, and the guest's way as a dashed
 * line. Positions are fractions of the picture, so it scales with the image.
 */
export function FloorMapView({
  url,
  alt,
  areas = [],
  lines = [],
  items = [],
  route = null,
  at = null,
  selected = null,
  className,
  children,
  svgProps,
}: {
  url: string | null;
  alt: string;
  areas?: MapViewArea[];
  lines?: MapViewLine[];
  items?: MapViewItem[];
  route?: Point[] | null;
  at?: Point | null;
  selected?: string | null;
  className?: string;
  children?: React.ReactNode;
  svgProps?: React.SVGProps<SVGSVGElement>;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-border bg-white",
        className,
      )}
    >
      {url ? (
        <img src={url} alt={alt} className="block w-full select-none" draggable={false} />
      ) : (
        <div className="aspect-[4/3] w-full" />
      )}
      <svg
        viewBox="0 0 1 1"
        preserveAspectRatio="none"
        className="absolute inset-0 size-full"
        aria-hidden
        {...svgProps}
      >
        <defs>
          <pattern
            id="lk-private"
            width="0.02"
            height="0.02"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <rect width="0.02" height="0.02" fill="rgba(220,38,38,0.08)" />
            <line
              x1="0"
              y1="0"
              x2="0"
              y2="0.02"
              stroke="rgba(220,38,38,0.45)"
              strokeWidth="0.004"
            />
          </pattern>
          <marker
            id="lk-arrow"
            viewBox="0 0 10 10"
            refX="5"
            refY="5"
            markerWidth="5"
            markerHeight="5"
            orient="auto-start-reverse"
          >
            <path d="M0,0 L10,5 L0,10 z" fill="#d97706" />
          </marker>
          <marker
            id="lk-route"
            viewBox="0 0 10 10"
            refX="5"
            refY="5"
            markerWidth="4"
            markerHeight="4"
            orient="auto"
          >
            <path d="M0,0 L10,5 L0,10 z" fill="#16a34a" />
          </marker>
        </defs>
        {areas.map((a, i) => (
          <polygon
            key={a.id ?? i}
            data-area={a.id}
            points={poly(a.poly)}
            fill={AREA_FILL[a.access] ?? "transparent"}
            stroke={
              a.id && a.id === selected
                ? "#0f172a"
                : a.access === "yours"
                  ? "#16a34a"
                  : "rgba(15,23,42,0.35)"
            }
            strokeWidth={a.id && a.id === selected ? 3 : a.access === "yours" ? 3 : 1}
            strokeDasharray={a.id && a.id === selected ? "6 3" : undefined}
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {lines.map((l, i) => {
          const look = LINE_LOOK[l.kind] ?? LINE_LOOK["door"]!;
          return (
            <polyline
              key={l.id ?? i}
              data-line={l.id}
              points={poly(l.pts)}
              fill="none"
              stroke={l.id && l.id === selected ? "#0f172a" : look.stroke}
              strokeWidth={look.width + (l.id && l.id === selected ? 2 : 0)}
              strokeDasharray={look.dash}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              markerEnd={l.kind === "stairs" ? "url(#lk-arrow)" : undefined}
            />
          );
        })}
        {route && route.length > 1 ? (
          <polyline
            points={poly(route)}
            fill="none"
            stroke="#16a34a"
            strokeWidth={4}
            strokeDasharray="8 6"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            markerEnd="url(#lk-route)"
          />
        ) : null}
      </svg>
      {items.map((it, i) => {
        const Icon = ITEM_ICON[it.kind as ItemKind] ?? Thermometer;
        return (
          <span
            key={it.id ?? i}
            data-item={it.id}
            title={it.kind.replace(/_/g, " ")}
            className={cn(
              "pointer-events-none absolute grid size-6 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-white bg-slate-800 text-white shadow",
              it.id && it.id === selected && "ring-2 ring-sky-500",
            )}
            style={{ left: `${it.at.x * 100}%`, top: `${it.at.y * 100}%` }}
          >
            <Icon className="size-3.5" aria-hidden />
          </span>
        );
      })}
      {at ? (
        <span
          aria-hidden
          className="absolute size-6 -translate-x-1/2 -translate-y-1/2 animate-pulse rounded-full border-4 border-white bg-emerald-600 shadow-lg"
          style={{ left: `${at.x * 100}%`, top: `${at.y * 100}%` }}
        />
      ) : null}
      {children}
    </div>
  );
}
