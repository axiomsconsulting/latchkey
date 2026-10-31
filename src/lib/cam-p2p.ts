/**
 * Live camera between a door tablet and its host, directly: WebRTC video,
 * encrypted end to end (DTLS-SRTP), straight from device to device. Only
 * the few small messages that set the connection up go over a realtime
 * channel, and that channel's name is a random secret made per viewing
 * session (startCameraLive, kiosk_devices.cam_channel), known only to the
 * signed-in host and the tablet. Public STUN servers help the two devices
 * find each other; there is no relay (TURN), so the video never passes
 * through Latchkey. Networks that block direct connections show "couldn't
 * connect" instead. Browser only.
 *
 * Messages (broadcast event "cam"): viewer → tablet: join, answer, ice,
 * switch, bye; tablet → viewer: offer, ice, cams (how many cameras, which
 * one is on).
 */
import { supabase } from "@/integrations/supabase/client";

const ICE: RTCIceServer[] = [
  { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
  { urls: "stun:stun.cloudflare.com:3478" },
];

type Msg =
  | { t: "join"; viewer: string }
  | { t: "offer"; viewer: string; sdp: RTCSessionDescriptionInit }
  | { t: "answer"; viewer: string; sdp: RTCSessionDescriptionInit }
  | { t: "ice"; viewer: string; from: "tablet" | "viewer"; candidate: RTCIceCandidateInit }
  | { t: "switch"; viewer: string }
  | { t: "bye"; viewer: string }
  | { t: "cams"; count: number; index: number };

const channelName = (secret: string) => `kiosk-cam:${secret}`;

function open(secret: string, onMsg: (m: Msg) => void) {
  const ch = supabase.channel(channelName(secret), { config: { broadcast: { self: false } } });
  ch.on("broadcast", { event: "cam" }, ({ payload }) => onMsg(payload as Msg));
  let ready = false;
  const queue: Msg[] = [];
  ch.subscribe((status) => {
    if (status !== "SUBSCRIBED") return;
    ready = true;
    queue.splice(0).forEach((m) => void ch.send({ type: "broadcast", event: "cam", payload: m }));
  });
  return {
    send: (m: Msg) =>
      ready
        ? void ch.send({ type: "broadcast", event: "cam", payload: m }).catch(() => {})
        : queue.push(m),
    close: () => void supabase.removeChannel(ch),
  };
}

/* --------------------------------- tablet --------------------------------- */

/**
 * On the door tablet while its host watches: opens its camera, answers
 * each viewer with a direct connection, switches between its cameras when
 * asked, and stops everything with stop().
 */
export function serveTabletCamera(secret: string, onLive: (live: boolean) => void): () => void {
  let stopped = false;
  let stream: MediaStream | null = null;
  let cams: MediaDeviceInfo[] = [];
  let index = 0;
  const peers = new Map<string, RTCPeerConnection>();
  const started = new Map<string, number>();

  const getCamera = async () => {
    const id = cams[index]?.deviceId;
    const s = await navigator.mediaDevices.getUserMedia({
      video: id
        ? { deviceId: { exact: id }, width: { ideal: 1280 }, height: { ideal: 720 } }
        : { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
    if (stopped) {
      s.getTracks().forEach((t) => t.stop());
      return null;
    }
    return s;
  };

  const sig = open(secret, (m) => void handle(m));
  const tellCams = () => sig.send({ t: "cams", count: Math.max(1, cams.length), index });

  async function connect(viewer: string) {
    if (!stream) return;
    // A viewer asks again while waiting: leave a connection that's live or still being set up.
    const had = peers.get(viewer);
    if (
      had &&
      (had.connectionState === "connected" || Date.now() - (started.get(viewer) ?? 0) < 10_000)
    )
      return;
    had?.close();
    const pc = new RTCPeerConnection({ iceServers: ICE });
    peers.set(viewer, pc);
    started.set(viewer, Date.now());
    stream.getTracks().forEach((t) => pc.addTrack(t, stream!));
    pc.onicecandidate = (e) => {
      if (e.candidate)
        sig.send({ t: "ice", viewer, from: "tablet", candidate: e.candidate.toJSON() });
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed" || pc.connectionState === "closed") peers.delete(viewer);
      onLive([...peers.values()].some((p) => p.connectionState === "connected"));
    };
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    sig.send({ t: "offer", viewer, sdp: offer });
    tellCams();
  }

  async function handle(m: Msg) {
    if (stopped) return;
    if (m.t === "join") return connect(m.viewer);
    const pc = "viewer" in m ? peers.get(m.viewer) : undefined;
    if (m.t === "answer" && pc) return pc.setRemoteDescription(m.sdp).catch(() => {});
    if (m.t === "ice" && m.from === "viewer" && pc)
      return pc.addIceCandidate(m.candidate).catch(() => {});
    if (m.t === "bye" && pc) {
      pc.close();
      peers.delete(m.viewer);
      onLive([...peers.values()].some((p) => p.connectionState === "connected"));
      return;
    }
    if (m.t === "switch" && cams.length > 1) {
      // The next camera on the device (front, back, others), swapped in without reconnecting.
      index = (index + 1) % cams.length;
      const next = await getCamera().catch(() => null);
      if (!next) return;
      const track = next.getVideoTracks()[0]!;
      for (const p of peers.values())
        await Promise.all(
          p
            .getSenders()
            .filter((x) => x.track?.kind === "video")
            .map((x) => x.replaceTrack(track)),
        );
      stream?.getTracks().forEach((t) => t.stop());
      stream = next;
      tellCams();
    }
  }

  void (async () => {
    try {
      stream = await getCamera();
      if (!stream) return;
      // Labels and ids are only known once the camera is allowed.
      cams = (await navigator.mediaDevices.enumerateDevices()).filter(
        (d) => d.kind === "videoinput",
      );
      const current = stream.getVideoTracks()[0]?.getSettings().deviceId;
      index = Math.max(
        0,
        cams.findIndex((c) => c.deviceId === current),
      );
      // Viewers who joined before the camera was ready ask again on "cams".
      tellCams();
    } catch {
      onLive(false);
    }
  })();

  return () => {
    stopped = true;
    peers.forEach((p) => p.close());
    peers.clear();
    stream?.getTracks().forEach((t) => t.stop());
    sig.close();
    onLive(false);
  };
}

/* --------------------------------- viewer --------------------------------- */

export type CameraState = "connecting" | "live" | "failed";

/**
 * On the host's screen: joins a tablet's private channel and receives its
 * video. `switchCamera` flips to the tablet's next camera. stop() says
 * goodbye so the tablet stops sending.
 */
export function watchTabletCamera(
  secret: string,
  on: {
    stream: (s: MediaStream | null) => void;
    state: (s: CameraState) => void;
    cams: (count: number, index: number) => void;
  },
): { switchCamera: () => void; stop: () => void } {
  const viewer = crypto.randomUUID();
  let pc: RTCPeerConnection | null = null;
  let stopped = false;
  let pending: RTCIceCandidateInit[] = [];
  on.state("connecting");

  const sig = open(secret, (m) => void handle(m));
  const join = () => sig.send({ t: "join", viewer });

  async function handle(m: Msg) {
    if (stopped) return;
    if (m.t === "cams") {
      on.cams(m.count, m.index);
      // The tablet's camera just came on: ask for the video (again) if not connected yet.
      if (!pc || pc.connectionState !== "connected") join();
      return;
    }
    if (!("viewer" in m) || m.viewer !== viewer) return;
    if (m.t === "offer") {
      pc?.close();
      pc = new RTCPeerConnection({ iceServers: ICE });
      pc.ontrack = (e) => on.stream(e.streams[0] ?? new MediaStream([e.track]));
      pc.onicecandidate = (e) => {
        if (e.candidate)
          sig.send({ t: "ice", viewer, from: "viewer", candidate: e.candidate.toJSON() });
      };
      pc.onconnectionstatechange = () => {
        const s = pc?.connectionState;
        if (s === "connected") on.state("live");
        if (s === "failed") on.state("failed");
      };
      await pc.setRemoteDescription(m.sdp);
      for (const c of pending) await pc.addIceCandidate(c).catch(() => {});
      pending = [];
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      sig.send({ t: "answer", viewer, sdp: answer });
      return;
    }
    if (m.t === "ice" && m.from === "tablet") {
      if (pc?.remoteDescription) await pc.addIceCandidate(m.candidate).catch(() => {});
      else pending.push(m.candidate);
    }
  }

  join();
  // Asked again a few times while the tablet hears about the viewing and opens its camera.
  const retry = window.setInterval(() => {
    if (!pc || pc.connectionState !== "connected") join();
  }, 4000);
  const giveUp = window.setTimeout(() => {
    if (!pc || pc.connectionState !== "connected") on.state("failed");
  }, 45_000);

  return {
    switchCamera: () => sig.send({ t: "switch", viewer }),
    stop: () => {
      stopped = true;
      window.clearInterval(retry);
      window.clearTimeout(giveUp);
      sig.send({ t: "bye", viewer });
      // Let the goodbye go before leaving the channel.
      window.setTimeout(() => {
        pc?.close();
        sig.close();
      }, 300);
      on.stream(null);
    },
  };
}
