import { guest } from "@/content/copy";

/**
 * A door tablet being tried out by the host (service mode, or a test check-in with sample photos):
 * a red border round the screen and "Service mode" in small print at the top, so nobody mistakes
 * it for a real check-in. Nothing in it takes taps.
 */
export function ServiceFrame() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[90]">
      <div className="absolute inset-0" style={{ border: "6px solid #dc2626" }} />
      <p
        className="absolute left-1/2 top-0 -translate-x-1/2 rounded-b-md px-3 py-0.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-white"
        style={{ background: "#dc2626" }}
      >
        {guest.serviceMode}
      </p>
    </div>
  );
}
