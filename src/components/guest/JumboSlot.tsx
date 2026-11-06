import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Jumbo door tablets: a part of a check-in step that belongs in the screen's own bars, like the
 * welcome card screen (Back in the top bar, Ask host and other ways in the bottom status bar).
 * Anywhere else it stays where it is.
 */
export function JumboSlot({
  on,
  to,
  children,
}: {
  on: boolean;
  to: "jumbo-back" | "jumbo-status";
  children: ReactNode;
}) {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setTarget(on ? document.getElementById(to) : null);
  }, [on, to]);
  if (!on) return <>{children}</>;
  return target ? createPortal(children, target) : null;
}
