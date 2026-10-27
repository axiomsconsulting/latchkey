import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { hostNav, team as teamCopy } from "@/content/copy";
import { useWorkspace } from "@/hooks/use-host-data";
import { listTeam } from "@/lib/team.functions";
import { cn } from "@/lib/utils";

function initials(name: string) {
  const parts = name
    .replace(/@.*/, "")
    .split(/[\s._-]+/)
    .filter(Boolean);
  return (
    (
      (parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "")
    ).toUpperCase() || "?"
  );
}

/** The signed-in person: photo or initials, and their name when there's room. */
export function useMe() {
  const { data } = useWorkspace();
  const list = useServerFn(listTeam);
  const hostId = data?.hostId ?? "";
  // Same query as Settings → Team, so the two always agree.
  const team = useQuery({
    queryKey: ["team", hostId],
    enabled: !!hostId,
    queryFn: () => list({ data: { hostId } }),
    staleTime: 5 * 60_000,
  });
  const me = team.data?.members.find((m) => m.isYou) ?? null;
  return me
    ? { name: me.name || me.email, email: me.email, avatarUrl: me.avatarUrl, role: me.role }
    : null;
}

export function Avatar({
  name,
  url,
  className,
}: {
  name: string;
  url: string | null;
  className?: string;
}) {
  return url ? (
    <img src={url} alt="" className={cn("size-8 shrink-0 rounded-full object-cover", className)} />
  ) : (
    <span
      aria-hidden
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground",
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}

/**
 * Opens your own profile (photo, name, email) in Settings → Team.
 * `compact` shows the picture only, for the icon rail and phone header.
 */
export function UserChip({
  compact = false,
  className,
}: {
  compact?: boolean;
  className?: string;
}) {
  const me = useMe();
  if (!me) return null;
  return (
    <Link
      to="/app/settings"
      hash="profile"
      aria-label={hostNav.yourProfile(me.name)}
      title={hostNav.yourProfile(me.name)}
      className={cn(
        "spring flex min-w-0 items-center gap-3 rounded-2xl px-2 py-2 text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground",
        className,
      )}
    >
      <Avatar name={me.name} url={me.avatarUrl} />
      {compact ? null : (
        <span className="min-w-0">
          <span className="block truncate text-foreground">{me.name}</span>
          <span className="block truncate text-xs">{teamCopy.roles[me.role]}</span>
        </span>
      )}
    </Link>
  );
}
