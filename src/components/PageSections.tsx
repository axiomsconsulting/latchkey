import { Children, Fragment, isValidElement, type ReactElement, type ReactNode } from "react";

import { useUi } from "@/hooks/use-site";
import { arrange } from "@/lib/ui-config";

/** One block of a page the super admin can move or hide (ids in PAGES, src/lib/ui-config.ts). */
export function Section({ children }: { id: string; children: ReactNode }) {
  return <>{children}</>;
}

/** A page's blocks in the super admin's order, hidden ones left out, for every host. */
export function PageSections({
  page,
  children,
  rail,
}: {
  page: string;
  children: ReactNode;
  /** Long pages (Settings): each block is marked for SectionRail with its name and sub-menu. */
  rail?: Record<string, { label: string; group: string }>;
}) {
  const ui = useUi();
  const items = Children.toArray(children).filter((c): c is ReactElement<{ id: string }> => isValidElement(c) && typeof (c.props as { id?: unknown }).id === "string");
  const byId = new Map(items.map((c) => [c.props.id, c]));
  const ids = arrange(ui.pages[page], items.map((c) => c.props.id));
  return (
    <>
      {ids.map((id) =>
        rail?.[id] ? (
          <div key={id} id={`rail-${id}`} data-rail="" data-rail-label={rail[id]!.label} data-rail-group={rail[id]!.group} className="scroll-mt-24 empty:hidden">
            {byId.get(id)}
          </div>
        ) : (
          <Fragment key={id}>{byId.get(id)}</Fragment>
        ),
      )}
    </>
  );
}
