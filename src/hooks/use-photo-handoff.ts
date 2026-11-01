/**
 * The door tablet's side of "take the photos on your phone"
 * (src/lib/photo-handoff.ts): one link per check-in, made at the first
 * photo step; each photo step sets the phone's task; the answer comes back
 * at once over a realtime ping (and a check every 1.5 seconds as a safety
 * net, one at a time so answers never cross).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";

import { supabase } from "@/integrations/supabase/client";
import {
  clearPhotoTask,
  photoHandoffState,
  sendPhotoLink,
  setPhotoTask,
  startPhotoHandoff,
} from "@/lib/photo-handoff.functions";
import {
  phoneConnected,
  type PhotoKind,
  type PhotoResult,
  type PhotoTask,
} from "@/lib/photo-handoff";

export type HandoffLink = Awaited<ReturnType<typeof startPhotoHandoff>>;
type State = Awaited<ReturnType<typeof photoHandoffState>>;

export type PhotoHandoff = {
  link: HandoffLink | null;
  task: PhotoTask | null;
  /** The phone's answer to the task now (only ever for that task). */
  result: PhotoResult | null;
  /** A phone has the link open and checked in lately. */
  connected: boolean;
  /** The link couldn't be made (offline, or the database isn't updated yet): this screen's camera only. */
  failed: boolean;
  request: (t: {
    kind: PhotoKind;
    position: number;
    face: boolean;
    keep: boolean;
    token?: string | undefined;
  }) => Promise<void>;
  /** The tablet's own camera took it, or the step moved on: the phone stops. */
  clear: () => Promise<void>;
  /** The check-in at the tablet ended: the link stops working. */
  end: () => void;
  send: (
    phone: string,
    via: "sms" | "whatsapp",
  ) => Promise<Awaited<ReturnType<typeof sendPhotoLink>> | null>;
};

export function usePhotoHandoff(
  code: string,
  deviceId: () => string,
  enabled: boolean,
): PhotoHandoff {
  const start = useServerFn(startPhotoHandoff);
  const setTaskFn = useServerFn(setPhotoTask);
  const clearFn = useServerFn(clearPhotoTask);
  const stateFn = useServerFn(photoHandoffState);
  const sendFn = useServerFn(sendPhotoLink);
  const [link, setLink] = useState<HandoffLink | null>(null);
  const [failed, setFailed] = useState(false);
  const linkRef = useRef<HandoffLink | null>(null);
  const starting = useRef<Promise<HandoffLink | null> | null>(null);
  const [state, setState] = useState<State | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const inFlight = useRef(false);
  const again = useRef(false);

  const ensure = useCallback(async () => {
    if (linkRef.current) return linkRef.current;
    if (!starting.current)
      starting.current = start({ data: { code, deviceId: deviceId() } })
        .then((l) => {
          linkRef.current = l;
          setLink(l);
          return l;
        })
        .catch(() => {
          setFailed(true);
          return null;
        })
        .finally(() => {
          starting.current = null;
        });
    return starting.current;
  }, [code, deviceId, start]);

  // One check at a time; a ping during one asks once more straight after.
  const refresh = useCallback(async () => {
    const l = linkRef.current;
    if (!l) return;
    if (inFlight.current) {
      again.current = true;
      return;
    }
    inFlight.current = true;
    try {
      do {
        again.current = false;
        const s = await stateFn({ data: { key: l.key } }).catch(() => null);
        if (s && linkRef.current === l) setState(s);
      } while (again.current);
    } finally {
      inFlight.current = false;
      setNow(Date.now());
    }
  }, [stateFn]);

  // The server pings the link's channel whenever the phone opens it or sends something.
  useEffect(() => {
    if (!enabled || !link) return;
    const ch = supabase
      .channel(`photo-handoff:${link.channel}`)
      .on("broadcast", { event: "changed" }, () => void refresh());
    ch.subscribe();
    const id = window.setInterval(() => void refresh(), 1500);
    void refresh();
    return () => {
      window.clearInterval(id);
      void supabase.removeChannel(ch);
    };
  }, [enabled, link, refresh]);

  const request: PhotoHandoff["request"] = useCallback(
    async (t) => {
      if (!enabled) return;
      const l = await ensure();
      if (!l) return;
      const res = await setTaskFn({
        data: {
          key: l.key,
          kind: t.kind,
          position: t.position,
          face: t.face,
          keep: t.keep,
          ...(t.token ? { token: t.token } : {}),
        },
      }).catch(() => null);
      if (res) setState((s) => (s?.open ? { ...s, task: res.task, result: null } : s));
      void refresh();
    },
    [enabled, ensure, setTaskFn, refresh],
  );

  const clear = useCallback(async () => {
    const l = linkRef.current;
    if (!l) return;
    setState((s) => (s?.open ? { ...s, task: null, result: null } : s));
    await clearFn({ data: { key: l.key } }).catch(() => undefined);
  }, [clearFn]);

  const end = useCallback(() => {
    const l = linkRef.current;
    linkRef.current = null;
    setLink(null);
    setState(null);
    if (l) void clearFn({ data: { key: l.key, end: true } }).catch(() => undefined);
  }, [clearFn]);

  // Leaving the page (the kiosk resets) ends the link too.
  useEffect(() => () => end(), [end]);

  const send: PhotoHandoff["send"] = useCallback(
    async (phone, via) => {
      const l = await ensure();
      if (!l) return null;
      return sendFn({ data: { key: l.key, phone, via } }).catch(() => null);
    },
    [ensure, sendFn],
  );

  const open = state?.open ? state : null;
  return {
    link,
    task: open?.task ?? null,
    result: open?.result ?? null,
    connected: !!open?.opened && phoneConnected(open.phoneSeenAt, now),
    failed,
    request,
    clear,
    end,
    send,
  };
}
