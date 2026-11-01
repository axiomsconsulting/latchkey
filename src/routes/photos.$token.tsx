import { useCallback, useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, ImageUp, Loader2, Smartphone } from "lucide-react";

import { GuestFrame } from "@/components/guest/GuestFrame";
import { IdCamera } from "@/components/guest/IdCamera";
import { Button } from "@/components/ui/button";
import { guest as copy } from "@/content/copy";
import { supabase } from "@/integrations/supabase/client";
import { rebrand } from "@/lib/brand";
import { fromFile } from "@/lib/photo-file";
import { phoneScreen } from "@/lib/photo-handoff";
import { openPhotoHandoff, phoneFacePhoto, phonePhotoId } from "@/lib/photo-handoff.functions";

/**
 * /photos/<link>: a phone taking the check-in photos for the door tablet
 * (src/lib/photo-handoff.ts). It shows whatever the tablet needs now (the
 * ID, then the selfie), sends it, and the tablet carries on by itself.
 * Opened only by this page's own script, so link previews in messaging
 * apps never count as the phone being here.
 */
export const Route = createFileRoute("/photos/$token")({
  head: () => ({
    meta: [
      { title: rebrand("Check-in photos · Latchkey") },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PhotosPage,
});

type Open = Awaited<ReturnType<typeof openPhotoHandoff>>;

function PhotosPage() {
  const { token } = Route.useParams();
  const openFn = useServerFn(openPhotoHandoff);
  const idFn = useServerFn(phonePhotoId);
  const faceFn = useServerFn(phoneFacePhoto);
  const [st, setSt] = useState<Open | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [cameraFailed, setCameraFailed] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  // An ID photo that didn't find the stay: sent again as soon as the tablet asks for the lead guest's ID.
  const held = useRef<{ full: string; small: string } | null>(null);
  const autoSent = useRef<number | null>(null);
  const inFlight = useRef(false);
  const again = useRef(false);

  const refresh = useCallback(async () => {
    if (inFlight.current) {
      again.current = true;
      return;
    }
    inFlight.current = true;
    try {
      do {
        again.current = false;
        const s = await openFn({ data: { token } }).catch(() => null);
        if (s) setSt(s);
      } while (again.current);
    } finally {
      inFlight.current = false;
    }
  }, [openFn, token]);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), 2000);
    return () => window.clearInterval(id);
  }, [refresh]);

  const channel = st?.open ? st.channel : null;
  useEffect(() => {
    if (!channel) return;
    const ch = supabase
      .channel(`photo-handoff:${channel}`)
      .on("broadcast", { event: "changed" }, () => void refresh());
    ch.subscribe();
    return () => void supabase.removeChannel(ch);
  }, [channel, refresh]);

  const task = st?.open ? st.task : null;
  const screen = st ? phoneScreen(task, st.open ? st.result : null, st.open) : null;

  // A new task: start clean.
  useEffect(() => {
    setMessage(null);
    setCameraFailed(false);
  }, [task?.n, screen]);

  async function sendId(full: string, small: string) {
    if (!task) return;
    setBusy(true);
    setMessage(null);
    try {
      const r = await idFn({ data: { token, n: task.n, image: full, small } });
      if (r.status === "retry") {
        setMessage(
          r.reason === "not_photo_id"
            ? copy.idNotPhotoId
            : r.left
              ? copy.idRetry(r.left)
              : copy.idRetryPlain,
        );
      } else if (r.status === "moved") {
        setMessage(copy.photosPage.moved);
      } else {
        held.current = task.kind === "find" && r.idStatus !== "matched" ? { full, small } : null;
      }
    } catch {
      setMessage(copy.error);
    } finally {
      setBusy(false);
      void refresh();
    }
  }

  async function sendFace(small: string | null) {
    if (!task) return;
    setBusy(true);
    try {
      await faceFn({ data: { token, n: task.n, ...(small ? { image: small } : {}) } });
    } catch {
      setMessage(copy.error);
    } finally {
      setBusy(false);
      void refresh();
    }
  }

  // The tablet found the stay another way and now asks for the ID: the photo already taken goes straight away.
  useEffect(() => {
    if (screen !== "id" || task?.kind !== "lead" || !held.current || autoSent.current === task.n)
      return;
    autoSent.current = task.n;
    const photo = held.current;
    held.current = null;
    void sendId(photo.full, photo.small);
    // Once per task.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, task?.n]);

  const property = st?.open ? st.property : null;
  const guestNo = (task?.position ?? 0) + 1;

  return (
    <GuestFrame theme={property?.theme ?? null} name={property?.name}>
      <div className="mx-auto max-w-xl py-8">
        {!st ? (
          <div className="grid place-items-center py-24">
            <Loader2 className="size-8 animate-spin text-muted-foreground" />
          </div>
        ) : screen === "closed" ? (
          <Note icon="done" title={copy.photosPage.closedTitle} body={copy.photosPage.closedBody} />
        ) : screen === "wait" ? (
          <Note
            icon="phone"
            title={copy.photosPage.connected}
            body={copy.photosPage.connectedBody}
          />
        ) : screen === "sent" ? (
          <Note icon="done" title={copy.photosPage.sentTitle} body={copy.photosPage.sentBody} />
        ) : screen === "id" ? (
          <section>
            <h1 className="font-display text-3xl">
              {task && task.position > 0
                ? copy.photosPage.idTitleOther(guestNo)
                : copy.photosPage.idTitle}
            </h1>
            <div className="mt-6">
              {cameraFailed ? (
                <>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = "";
                      if (f) void fromFile(f).then(({ full, small }) => sendId(full, small));
                    }}
                  />
                  <Button
                    size="touch-xl"
                    className="w-full"
                    disabled={busy}
                    onClick={() => fileRef.current?.click()}
                  >
                    {busy ? (
                      <Loader2 className="size-6 animate-spin" />
                    ) : (
                      <ImageUp className="size-6" aria-hidden />
                    )}
                    {busy ? copy.idChecking : copy.idUpload}
                  </Button>
                </>
              ) : (
                <IdCamera
                  key={`id-${task?.n}`}
                  busy={busy}
                  facing="environment"
                  upload
                  onCapture={(full, small) => void sendId(full, small)}
                  onFail={() => setCameraFailed(true)}
                />
              )}
            </div>
          </section>
        ) : screen === "face" ? (
          <section>
            <h1 className="font-display text-3xl">
              {task && task.position > 0
                ? copy.photosPage.faceTitleOther(guestNo)
                : copy.photosPage.faceTitle}
            </h1>
            <div className="mt-6">
              {cameraFailed ? (
                <p className="text-center text-muted-foreground">{copy.idCameraFailed}</p>
              ) : (
                <IdCamera
                  key={`face-${task?.n}`}
                  kind="face"
                  facing="user"
                  busy={busy}
                  help={copy.photosPage.faceBody}
                  cta={copy.faceTake}
                  busyLabel={copy.faceSaving}
                  onCapture={(_full, small) => void sendFace(small)}
                  onFail={() => setCameraFailed(true)}
                />
              )}
              <Button
                variant="ghost"
                size="lg"
                className="mt-3 w-full"
                disabled={busy}
                onClick={() => void sendFace(null)}
              >
                {copy.photosPage.faceSkip}
              </Button>
            </div>
          </section>
        ) : null}
        {message ? (
          <p className="mt-4 text-center text-lg text-destructive" role="alert">
            {message}
          </p>
        ) : null}
      </div>
    </GuestFrame>
  );
}

function Note({ icon, title, body }: { icon: "done" | "phone"; title: string; body: string }) {
  const Icon = icon === "done" ? CheckCircle2 : Smartphone;
  return (
    <div className="card-soft space-y-3 p-8 text-center">
      <Icon className="mx-auto size-12 text-primary" aria-hidden />
      <h1 className="font-display text-3xl">{title}</h1>
      <p className="text-lg text-muted-foreground">{body}</p>
    </div>
  );
}
