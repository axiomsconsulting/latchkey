/**
 * Errors people can act on. Server code throws appError({...}) with a plain
 * title, what happened, next steps (optionally with a link) and the
 * technical detail; the message carries them as JSON behind a marker so
 * they survive the trip to the browser. readAppError() turns that, or any
 * other error, into what ErrorReport shows. Pure.
 */

export type ErrorStep = { text: string; href?: string };

export type AppError = {
  code: string;
  title: string;
  body: string;
  steps: ErrorStep[];
  /** Exactly what the system said: shown folded, copied and sent to support. */
  detail: string | null;
  /** Offer "Send to Latchkey support". */
  support: boolean;
};

const MARK = "LKERR:";

export function appError(e: Partial<AppError> & Pick<AppError, "code" | "title" | "body">): Error {
  const full: AppError = { steps: [], detail: null, support: true, ...e };
  return new Error(MARK + JSON.stringify(full));
}

const GENERIC_STEPS: ErrorStep[] = [
  { text: "Try again in a minute." },
  { text: "If it keeps happening, send it to Latchkey support below." },
];

export function readAppError(e: unknown, fallbackTitle = "That didn't work"): AppError {
  const message = e instanceof Error ? e.message : typeof e === "string" ? e : "";
  const at = message.indexOf(MARK);
  if (at >= 0) {
    try {
      const v = JSON.parse(message.slice(at + MARK.length)) as Partial<AppError>;
      if (v && typeof v.title === "string" && typeof v.body === "string") {
        return {
          code: typeof v.code === "string" ? v.code : "error",
          title: v.title,
          body: v.body,
          steps: Array.isArray(v.steps)
            ? v.steps.filter((s): s is ErrorStep => !!s && typeof s.text === "string")
            : [],
          detail: typeof v.detail === "string" ? v.detail : null,
          support: v.support !== false,
        };
      }
    } catch {
      // Fall through to the plain message.
    }
  }
  return {
    code: "error",
    title: fallbackTitle,
    body: message || "Something went wrong.",
    steps: GENERIC_STEPS,
    detail: message || null,
    support: true,
  };
}

/** Plain text for copying or sending to support. */
export function errorText(
  err: AppError,
  where: { page?: string | null; business?: string | null; at?: Date } = {},
): string {
  return [
    err.title,
    err.body,
    ...(err.steps.length
      ? [
          "",
          "Next steps:",
          ...err.steps.map((s, i) => `${i + 1}. ${s.text}${s.href ? ` (${s.href})` : ""}`),
        ]
      : []),
    "",
    `Code: ${err.code}`,
    ...(where.business ? [`Business: ${where.business}`] : []),
    ...(where.page ? [`Page: ${where.page}`] : []),
    `When: ${(where.at ?? new Date()).toISOString()}`,
    ...(err.detail ? ["", "Details:", err.detail] : []),
  ].join("\n");
}
