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
  only,
  anchors = false,
  decorate,
}: {
  page: string;
  children: ReactNode;
  /** Show just some blocks (Settings: the open tab's group), still in the super admin's order. */
  only?: (id: string) => boolean;
  /** Give each block an anchor (#section-<id>) that links can land on. */
  anchors?: boolean;
  /** Something drawn around a block (the home page's pictures in the margins). */
  decorate?: (id: string) => ReactNode;
}) {
  const ui = useUi();
  const items = Children.toArray(children).filter((c): c is ReactElement<{ id: string }> => isValidElement(c) && typeof (c.props as { id?: unknown }).id === "string");
  const byId = new Map(items.map((c) => [c.props.id, c]));
  const ids = arrange(ui.pages[page], items.map((c) => c.props.id)).filter((id) => !only || only(id));
  return (
    <>
      {ids.map((id) =>
        decorate ? (
          <div key={id} className="relative">
            {decorate(id)}
            {byId.get(id)}
          </div>
        ) : anchors ? (
          <div key={id} id={`section-${id}`} className="scroll-mt-24 empty:hidden">
            {byId.get(id)}
          </div>
        ) : (
          <Fragment key={id}>{byId.get(id)}</Fragment>
        ),
      )}
    </>
  );
}
