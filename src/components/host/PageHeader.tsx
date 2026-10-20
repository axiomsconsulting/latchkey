export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl sm:text-3xl">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p> : null}
      </div>
      {/* On a phone, the buttons share each row evenly; from small tablets up they sit at their own size. */}
      {actions ? <div className="flex flex-wrap items-center gap-2 max-sm:[&>*]:flex-auto">{actions}</div> : null}
    </header>
  );
}
