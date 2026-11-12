import { JumboSlot } from "@/components/guest/JumboSlot";
import { tellGuestSex } from "@/components/guest/receptionist-events";
import { DoorCodeCard, type GuestDoor } from "@/components/guest/DoorCodeCard";
import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  CircleHelp,
  HandHeart,
  Loader2,
  Minus,
  Phone,
  Plus,
  Smartphone,
  Tablet,
} from "lucide-react";

import { ChannelIcon } from "@/components/ChannelIcon";

import { CardQr, CheckInQr, KioskQr, GuideLink } from "@/components/guest/CheckInQr";
import { IdCamera } from "@/components/guest/IdCamera";
import { PhotoChoice } from "@/components/guest/PhonePhotos";
import { usePhotoHandoff } from "@/hooks/use-photo-handoff";
import { faceNext, type PhotoKind } from "@/lib/photo-handoff";
import { PinPad } from "@/components/guest/PinPad";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { guest as copy } from "@/content/copy";
import { useIsMobile } from "@/hooks/use-mobile";
import { deviceSignature } from "@/lib/kiosk-devices";
import { spotFor, type CameraSpots } from "@/lib/kiosk-camera-spot";
import { useLandscapeDisplay } from "@/hooks/use-display";
import type { CheckinMethod } from "@/lib/checkin-logic";
import {
  addFacePhoto,
  askHostToCheckIn,
  checkCompanionId,
  checkInProgress,
  checkoutOptions,
  findByPhotoId,
  handoffState,
  joinCheckIn,
  joinDone,
  joinInfo,
  joinPerson,
  shareCheckIn,
  completeCheckIn,
  confirmBooking,
  listArrivals,
  matchBooking,
  pickArrival,
  resumeSession,
  saveHandoff,
  selfDeclare,
  sessionTestSamples,
  setGuestName,
  saveRegister,
  setParty,
  skipCompanionId,
  startFromCard,
  startFromWelcome,
  startServiceCheckIn,
  takeHandoff,
  verifyLast4,
  verifyPhotoId,
} from "@/lib/checkin.functions";
import { cameraFor, type GuestFlow } from "@/lib/checkin-flow";
import { handoffView, type HandoffState, type HandoffStep } from "@/lib/checkin-handoff";
import { nightsBetween } from "@/lib/checkin-logic";
import { addDays } from "@/lib/dates";
import { deviceToken } from "@/lib/kiosk-presence";

import { formatUkDate, formatUkTime } from "@/lib/dates";
import { demoLine, type DemoHint } from "@/lib/demo-guide";
import {
  REGISTER_AGE,
  cleanRegisterEntry,
  homeDestination,
  isAlien,
  nationalityOptions,
  type RegisterProblem as RegisterMissing,
} from "@/lib/hotel-register";
import { flagEmoji, pageReady, registerPages, type RegisterPage } from "@/lib/kiosk-register";
import { CountryPicker } from "@/components/guest/CountryPicker";
import { VoiceRing, useCanSpeak } from "@/components/guest/VoiceConcierge";
import { unlockAudio } from "@/lib/voice-engine";
import { TestSamplesContext, type TestSamples } from "@/components/guest/TestSamples";
import { cn } from "@/lib/utils";
import { BrandBlock, ThemeFeatures } from "@/components/theme/ThemeDecor";
import { welcomeTitle, type ThemeConfig } from "@/lib/theme";

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
type Last4Kind = "reference" | "phone" | "email";

export type GuestSite = { key: string; label: string; iconUrl: string | null };

/** Who's staying and what is asked, from the host's settings for this room. */
type PartyPlan = {
  ask: boolean;
  booked: number | null;
  capacity: number | null;
  childrenAllowed: boolean;
  everyAdult: boolean;
  facePhoto: boolean;
  keepIdPhoto: boolean;
  keepDays: number;
  /** UK guest register: name and nationality of everyone 16 or over. */
  register: boolean;
};

/** What the register form starts with, read from the person's own ID. */
type Prefill = {
  fullName: string | null;
  nationality: string | null;
  documentNumber: string | null;
  placeOfIssue: string | null;
  /** Their home address and its town, as printed on a driving licence or ID card. */
  homeAddress?: string | null;
  homeTown?: string | null;
  /** From their last stay, for them to confirm. */
  fromLastStay?: boolean;
};

const NO_SPOTS: CameraSpots = {};

/** Steps after the lead guest's ID, run in order. */
type After =
  | { kind: "face"; position: number }
  | { kind: "companion"; position: number }
  | { kind: "register"; position: number; child: boolean };

type Step =
  | { name: "welcome" }
  | { name: "letter" }
  | { name: "checkout" }
  /** Three close check-out days to pick from (the host's journey), each with its nights. */
  | { name: "checkout3"; days: Array<{ date: string; nights: number }> }
  /** Only when the first answers fit stays on more than one platform. */
  | { name: "platform"; only: string[] }
  | {
      name: "pick";
      items: Array<{ id: string; label: string; checkOut: string; channel?: string }>;
    }
  | { name: "no_match" }
  | { name: "locked"; until: string }
  | { name: "guestName" }
  | { name: "confirm"; firstName: string; returning?: boolean; again?: boolean }
  | { name: "party" }
  | { name: "companion"; position: number; ready: boolean }
  | { name: "face"; position: number }
  /** `only`: the ID filled in the rest, so just these are asked. */
  | { name: "register"; position: number; child: boolean; only?: RegisterAsk[] | undefined }
  /** The guest asked the host to check them in; `back` resumes where they were. */
  | { name: "handover"; back: Step }
  /** Everyone left is filling in on their own phone. */
  | { name: "waiting" }
  | { name: "identity"; method: CheckinMethod; consented: boolean }
  | {
      name: "done";
      firstName: string;
      roomName: string | null;
      roomTitle: string | null;
      stayToken: string;
      /** No room yet: the host places them. */
      held?: boolean;
      doors?: GuestDoor[];
      /** Three words for /g/<words>, the easy-to-remember link to the guide. */
      shortCode?: string | null;
    }
  /** ID first: the photo of the ID finds the stay (and is the lead guest's ID check). */
  | { name: "idFirst"; consented: boolean };

function deviceId(): string {
  const key = "latchkey.device";
  let id = window.localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    window.localStorage.setItem(key, id);
  }
  return id;
}

export type CheckinProperty = {
  name: string;
  code: string;
  checkoutChoices: string[];
  demoHint?: DemoHint | null;
  listFlow: boolean;
  checkInFrom?: string;
  checkOutBy?: string;
  sites?: GuestSite[];
  /** The property's look and words (src/lib/theme.ts). */
  theme?: ThemeConfig;
  /** The host's check-in journey (src/lib/checkin-flow.ts). */
  flow?: GuestFlow;
  /** The first check-out day a guest arriving now can have: nights count from the day before. */
  firstCheckout?: string;
  /** What the host keeps from an ID check (getCheckinProperty), for consent before the stay is found. */
  records?: { keepDays: number; keepsPhoto: boolean };
};

type RegisterAsk = "nationality" | "document" | "place" | "destination";
type RegisterOutcome =
  { kind: "none" | "saved" | "later" } | { kind: "ask"; missing: RegisterAsk[] };

const DEFAULT_GUEST_FLOW: GuestFlow = {
  welcomeGo: true,
  idFirst: false,
  confirm: true,
  checkout: "week",
  idCamera: "front",
  selfieCamera: "front",
};

export function CheckInFlow({
  property,
  hostPhone,
  kiosk = false,
  onActivity,
  onWelcome,
  onStep,
  qrPanel = true,
  jumbo = false,
  cameraSpots = NO_SPOTS,
  resumeToken,
  voiceStart = null,
  welcomeStart = null,
  service = false,
  onDone,
}: {
  /** Door tablet: "I'm done" at the end goes back to the start for the next guest. */
  onDone?: (() => void) | undefined;
  /**
   * The guest tapped Check in on the host's welcome: with a version, that
   * welcome's stay opens straight away (startFromWelcome); without, the
   * usual questions find it.
   */
  welcomeStart?: {
    version: number | null;
    n: number;
    source?: "device" | "all";
    /** A returning guest's own card (startFromCard): their stay opens without the photo ID. */
    card?: string;
  } | null;
  /** Service mode (the host's test sent to this door tablet): Check in opens the test stay. */
  service?: boolean;
  /** Door tablet welcome: the full phone panel on the right (Latchkey admin setting), else only the icon at the top. */
  qrPanel?: boolean;
  /** Jumbo door tablet: very large words and buttons, no floating preview. */
  jumbo?: boolean;
  /** Where this tablet's front camera is, as the host set it. */
  cameraSpots?: CameraSpots;
  /** Tells the kiosk whether the welcome (first) screen is showing. */
  onWelcome?: (atWelcome: boolean) => void;
  /** Each new screen (and which guest it's for), so the kiosk can fit it to the display. */
  onStep?: ((key: string) => void) | undefined;
  property: CheckinProperty;
  hostPhone?: string | null;
  kiosk?: boolean;
  onActivity?: (() => void) | undefined;
  /** Present when the guest scanned the square on another device. */
  resumeToken?: string | null;
  /** The voice concierge is offered (Pro plan, host's switch): the bubble beside Check in starts it. */
  voiceStart?: (() => void) | null;
}) {
  const [step, setStep] = useState<Step>({ name: "welcome" });
  const [letter, setLetter] = useState("");
  const [checkOut, setCheckOut] = useState("");
  // Read by steps that follow each other within one tap (found → confirm → finish), so kept in a ref too.
  const [token, setTokenState] = useState("");
  // The receptionist on this screen knows the stay once it's found (Receptionist.tsx).
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("lk-checkin-session", { detail: token || null }));
  }, [token]);
  const tokenRef = useRef("");
  const setToken = (t: string) => {
    tokenRef.current = t;
    setTokenState(t);
  };
  const [sequence, setSequence] = useState<CheckinMethod[]>(["self_declare"]);
  const [kinds, setKinds] = useState<Last4Kind[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [platform, setPlatform] = useState<string | null>(null);
  // The check-out day was picked from three close days (a wrong pick counts for more).
  const [picked, setPicked] = useState(false);
  const flow = property.flow ?? DEFAULT_GUEST_FLOW;
  // ID first: the lead guest's ID is already checked (found their stay), or the photo to reuse once it's found another way.
  const leadVerified = useRef(false);
  // Stayed before with a passed ID check: no selfie for them. Cleared if they fall back to the ID photo.
  const trustedLead = useRef(false);
  const pendingPhoto = useRef<{ full: string; small: string } | null>(null);
  // ID first: the selfie follows straight away, before anything else is asked.
  const faceFirst = useRef(false);
  const leadFaceDone = useRef(false);
  const idFirstTries = useRef(0);
  // No booking found the usual way: the guest carries on with their ID; the host sorts out the room.
  const forceFind = useRef(false);
  // The register from each guest's ID: saved, left for the host, or only a few things to ask.
  const registerFrom = useRef<Record<number, string>>({});
  const registerAsk = useRef<Record<number, RegisterAsk[]>>({});
  const noteRegister = (position: number, r: RegisterOutcome | undefined) => {
    if (!r) return;
    registerFrom.current[position] = r.kind;
    if (r.kind === "ask") registerAsk.current[position] = r.missing;
  };
  // Tries per extra guest's ID: a second failed read keeps the photo for the host instead.
  const companionTries = useRef<Record<number, number>>({});
  const [plan, setPlan] = useState<PartyPlan | null>(null);
  const [listFlow, setListFlow] = useState(false);
  const [adults, setAdults] = useState(1);
  const [queue, setQueue] = useState<After[]>([]);
  const [prefill, setPrefill] = useState<Record<number, Prefill>>({});
  // Read when the steps after the lead guest are planned, sometimes in the
  // same tap that set them, so kept in a ref rather than state.
  const childAges = useRef<number[]>([]);
  const onPhone = useIsMobile();
  const canSpeak = useCanSpeak();
  // Photos on a phone instead of the tablet's camera (photo-handoff.ts): one link for the whole check-in.
  const phone = usePhotoHandoff(property.code, deviceId, kiosk);
  // Answers from the phone already acted on (task number and part), and selfies the phone took.
  const handled = useRef(new Set<string>());
  const phoneFaces = useRef(new Set<number>());
  // ID first on the phone found no stay: the phone keeps the photo and sends it once the stay is found.
  const phoneHeldId = useRef(false);
  // The guest chose this screen's camera for this step.
  const [screenStep, setScreenStep] = useState<string | null>(null);

  const match = useServerFn(matchBooking);
  const options = useServerFn(checkoutOptions);
  const fromWelcome = useServerFn(startFromWelcome);
  const fromCard = useServerFn(startFromCard);
  const serviceStartFn = useServerFn(startServiceCheckIn);
  const byPhoto = useServerFn(findByPhotoId);
  // They've stayed with this business before: greeted as someone returning.
  const [stayedBefore, setStayedBefore] = useState(false);
  const list = useServerFn(listArrivals);
  const pick = useServerFn(pickArrival);
  const confirm = useServerFn(confirmBooking);
  const photo = useServerFn(verifyPhotoId);
  const last4 = useServerFn(verifyLast4);
  const declare = useServerFn(selfDeclare);
  const complete = useServerFn(completeCheckIn);
  const resume = useServerFn(resumeSession);
  const saveName = useServerFn(setGuestName);
  const party = useServerFn(setParty);
  const companionId = useServerFn(checkCompanionId);
  const skipCompanion = useServerFn(skipCompanionId);
  const face = useServerFn(addFacePhoto);
  const register = useServerFn(saveRegister);
  const handover = useServerFn(askHostToCheckIn);
  const shareFn = useServerFn(shareCheckIn);
  const progressFn = useServerFn(checkInProgress);
  // The host's own test stay: its sample photos stand in for the camera from here on.
  const samplesFn = useServerFn(sessionTestSamples);
  const outerSamples = useContext(TestSamplesContext);
  const [stayedSamples, setStayedSamples] = useState<TestSamples | null>(null);
  // One check-in on the door tablet and a phone (checkin-handoff.ts): only one has it at a time.
  const handoffSide = kiosk ? ("kiosk" as const) : ("phone" as const);
  const saveHandoffFn = useServerFn(saveHandoff);
  const takeHandoffFn = useServerFn(takeHandoff);
  const handoffStateFn = useServerFn(handoffState);
  // The tablet always keeps its place; a phone only once it has picked a check-in up.
  const handoffLive = useRef(kiosk);
  // The other device has the check-in: this screen waits, offering to carry on here.
  const [away, setAway] = useState(false);
  // Adding someone from the end screen: until their first screen is saved, "complete" is the lead's.
  const adding = useRef(false);
  const [fullName, setFullName] = useState("");
  // Other guests filling in on their own phones: the square they scan, and who's where.
  const [share, setShare] = useState<string | null>(null);
  type Slot = Awaited<ReturnType<typeof checkInProgress>>["slots"][number];
  const [slots, setSlots] = useState<Slot[]>([]);
  const slotsRef = useRef<Slot[]>([]);
  slotsRef.current = slots;
  const takenElsewhere = (position: number) =>
    position > 0 && slotsRef.current.some((x) => x.position === position && x.state !== "open");
  const otherGuestStep =
    step.name === "waiting" ||
    step.name === "companion" ||
    ((step.name === "register" || step.name === "face") && step.position > 0);

  useEffect(() => {
    if (step.name === "welcome") adding.current = false;
    onActivity?.();
    setMessage(null);
    onWelcome?.(step.name === "welcome");
    onStep?.(`${step.name}:${"position" in step ? step.position : ""}`);
  }, [step, onActivity, onWelcome, onStep]);

  // The device in control saves where it is, so the other can open exactly this screen.
  useEffect(() => {
    if (!token || !handoffLive.current || away) return;
    if (step.name !== "face" && step.name !== "companion" && step.name !== "register") return;
    const current: HandoffStep =
      step.name === "register"
        ? { kind: "register", position: step.position, child: step.child, only: step.only }
        : { kind: step.name, position: step.position };
    const rest: HandoffStep[] = queue
      .filter(
        (x) =>
          !(
            x.kind === "register" &&
            ["saved", "later"].includes(registerFrom.current[x.position] ?? "")
          ),
      )
      .map((x) => (x.kind === "register" ? { ...x, only: registerAsk.current[x.position] } : x));
    const steps = [current, ...rest];
    const wanted = new Set(steps.filter((x) => x.kind === "register").map((x) => x.position));
    const kept = Object.fromEntries(Object.entries(prefill).filter(([k]) => wanted.has(Number(k))));
    void saveHandoffFn({
      data: { token, side: handoffSide, state: { steps, prefill: kept } },
    })
      // Once this screen is saved, the server only says done when the added guest has finished.
      .then(() => {
        adding.current = false;
      })
      .catch(() => undefined);
    // Saved once per screen; prefill changes alongside the step that uses it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, queue, token, away]);

  // Watch for the other device taking over, or finishing.
  useEffect(() => {
    if (!token || step.name === "welcome" || step.name === "done") return;
    let live = true;
    const tick = async () => {
      if (!handoffLive.current) return;
      const h = await handoffStateFn({ data: { token } }).catch(() => null);
      if (!live || !h) return;
      const view = handoffView(handoffSide, h, adding.current);
      if (view === "done") {
        setAway(false);
        const done = await complete({ data: { token } }).catch(() => null);
        if (live && done) setStep({ name: "done", ...done });
      } else setAway(view === "elsewhere");
    };
    const id = window.setInterval(() => void tick(), 3000);
    return () => {
      live = false;
      window.clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, step.name]);

  useEffect(() => {
    setStayedSamples(null);
    if (!token) return;
    let live = true;
    samplesFn({ data: { token } })
      .then((r) => {
        if (live && r.samples && (r.samples.id || r.samples.face)) setStayedSamples(r.samples);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Scanned square: rejoin the same check-in rather than starting over.
  useEffect(() => {
    if (!resumeToken || kiosk) return;
    let live = true;
    setBusy(true);
    resume({ data: { token: resumeToken } })
      .then(async (res) => {
        if (!live) return;
        setToken(resumeToken);
        setSequence([...res.sequence] as CheckinMethod[]);
        setKinds(res.last4Kinds);
        setPlatform(res.platform);
        setPlan(res.party);
        setListFlow(res.listFlow);
        if (res.adults) setAdults(res.adults);
        // The tablet saved the screen it was on: open exactly that one here.
        const took = await takeHandoffFn({
          data: { token: resumeToken, side: "phone" },
        }).catch(() => null);
        handoffLive.current = true;
        if (!live) return;
        if (took?.state && res.verified && !res.completed) return void pickUp(took.state);
        if (res.verified && !res.completed) {
          // Identity is done: carry on with only the steps still missing.
          childAges.current = res.childAges;
          const people = res.adults ?? 1;
          const steps: After[] = [];
          for (let i = 0; i < people; i++) {
            if (i > 0 && res.party.everyAdult && !res.idsDone.includes(i))
              steps.push({ kind: "companion", position: i });
            if (res.party.register && !res.registered.includes(i) && !res.photoKept.includes(i))
              steps.push({ kind: "register", position: i, child: false });
          }
          res.childAges.forEach((age, i) => {
            if (res.party.register && age >= REGISTER_AGE && !res.registered.includes(people + i)) {
              steps.push({ kind: "register", position: people + i, child: true });
            }
          });
          if (steps.length && live) return void advance(steps);
        }
        if (res.completed || res.verified) {
          const done = await complete({ data: { token: resumeToken } });
          if (live) setStep({ name: "done", ...done });
          return;
        }
        setStep({ name: "confirm", firstName: res.firstName });
      })
      .catch(() => {
        if (live) setMessage(copy.error);
      })
      .finally(() => {
        if (live) setBusy(false);
      });
    return () => {
      live = false;
    };
    // Runs once for the scanned token.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumeToken, kiosk]);

  /** Carries on from the place the other device saved: the same screen, then the same ones after it. */
  function pickUp(state: HandoffState) {
    for (const x of state.steps) {
      if (x.kind !== "register") continue;
      delete registerFrom.current[x.position];
      if (x.only) registerAsk.current[x.position] = x.only;
      else delete registerAsk.current[x.position];
    }
    setPrefill((p) => {
      const next = { ...p };
      for (const [k, v] of Object.entries(state.prefill)) next[Number(k)] = v;
      return next;
    });
    void advance(
      state.steps.map((x): After =>
        x.kind === "register"
          ? { kind: "register", position: x.position, child: x.child }
          : { kind: x.kind, position: x.position },
      ),
    );
  }

  /** The guest chose to carry on on this device: take the check-in back from the other one. */
  async function takeBack() {
    const res = await run(() =>
      takeHandoffFn({ data: { token: tokenRef.current, side: handoffSide } }),
    );
    if (!res) return;
    handoffLive.current = true;
    setAway(false);
    if (res.completed) return void finish();
    if (res.state) pickUp(res.state);
  }

  async function run<T>(fn: () => Promise<T>): Promise<T | null> {
    setBusy(true);
    try {
      return await fn();
    } catch (err) {
      setMessage(err instanceof Error && err.message.length < 120 ? err.message : copy.error);
      return null;
    } finally {
      setBusy(false);
    }
  }

  function restart() {
    phone.end();
    setAway(false);
    handoffLive.current = kiosk;
    setStayedBefore(false);
    trustedLead.current = false;
    handled.current.clear();
    phoneFaces.current.clear();
    phoneHeldId.current = false;
    setScreenStep(null);
    setLetter("");
    setCheckOut("");
    setPicked(false);
    setToken("");
    setPlatform(null);
    setPlan(null);
    setAdults(1);
    setQueue([]);
    setPrefill({});
    childAges.current = [];
    faceFirst.current = false;
    leadFaceDone.current = false;
    setStep({ name: "welcome" });
  }

  /** The host's name and icon for a booking site, or the standard wording. */
  function siteOf(key: string): GuestSite {
    return (
      property.sites?.find((s) => s.key === key) ?? {
        key,
        label: copy.platforms[key] ?? key,
        iconUrl: null,
      }
    );
  }

  /** List flow: every stay with that initial, across platforms. */
  async function listStays(chosenLetter: string) {
    const res = await run(() =>
      list({ data: { code: property.code, deviceId: deviceId(), letter: chosenLetter } }),
    );
    if (!res) return;
    if ("until" in res && res.until) return setStep({ name: "locked", until: res.until });
    setStep({ name: "pick", items: res.items });
  }

  /** Asks for the platform only if the server says the answers so far fit more than one. */
  async function findStay(day: string, channel?: string, fromThree = picked) {
    const res = await run(() =>
      match({
        data: {
          code: property.code,
          deviceId: deviceId(),
          letter,
          checkOut: day,
          ...(channel ? { channel } : {}),
          ...(fromThree ? { picked: true } : {}),
        },
      }),
    );
    if (!res) return;
    if (res.status === "locked") return setStep({ name: "locked", until: res.until });
    if (res.status === "no_match") return setStep({ name: "no_match" });
    if (res.status === "choose_platform") return setStep({ name: "platform", only: res.channels });
    await found(
      res.token,
      res.platform,
      res.firstName,
      res.needsName,
      res.returning === true,
      flow.confirm,
      res.again === true,
    );
  }

  /** The stay is found: a name if it has none, then "Is this you?" unless the host left it out. */
  async function found(
    t: string,
    site: string | null,
    first: string,
    needsName: boolean,
    returning: boolean,
    ask = flow.confirm,
    again = false,
  ) {
    setToken(t);
    setStayedBefore(again);
    setPlatform(site);
    if (needsName) return setStep({ name: "guestName" });
    if (!ask && !returning) return void onConfirm(t);
    setStep({ name: "confirm", firstName: first, returning, again });
  }

  /** Finding the stay: the photo ID first when the journey has it, otherwise the surname initial. */
  function startFind() {
    // Service mode: this tablet only does the host's test check-in, straight away.
    if (service && !serviceTried.current) return void startService();
    serviceTried.current = false;
    setStep(
      flow.idFirst && !pendingPhoto.current
        ? { name: "idFirst", consented: false }
        : { name: "letter" },
    );
  }

  const serviceTried = useRef(false);
  async function startService() {
    const device = deviceToken(property.code);
    const res = device
      ? await run(() =>
          serviceStartFn({ data: { code: property.code, deviceId: deviceId(), device } }),
        )
      : null;
    if (!res || res.status !== "matched") {
      // Service mode ended (or the test was reset): the usual start.
      serviceTried.current = true;
      return startFind();
    }
    void found(res.token, res.platform, res.firstName, false, res.returning, false, false);
  }

  /** ID first: the name on it finds the stay; otherwise the photo waits to be used once it's found. */
  async function onIdFirst(full: string, small: string) {
    await phone.clear();
    const res = await run(() =>
      byPhoto({
        data: {
          code: property.code,
          deviceId: deviceId(),
          image: full,
          small,
          ...(forceFind.current ? { force: true } : {}),
        },
      }),
    );
    if (res) await afterIdFirst(res, { full, small });
  }

  /** The answer to the ID first, from this screen's camera or the phone's (`photo` null: the phone keeps it). */
  async function afterIdFirst(
    res: Awaited<ReturnType<typeof findByPhotoId>>,
    photo: { full: string; small: string } | null,
  ) {
    if (res.status === "locked") return setStep({ name: "locked", until: res.until });
    if (res.status === "retry" && photo) {
      idFirstTries.current += 1;
      if (idFirstTries.current < 2)
        return setMessage(res.reason === "not_photo_id" ? copy.idNotPhotoId : copy.idRetryPlain);
    }
    if ((res.status !== "matched" || !res.token) && forceFind.current) {
      // They'd already tried the usual way: never send them back round. The host is told at once.
      forceFind.current = false;
      return void handOver();
    }
    if (res.status !== "matched" || !res.token) {
      // Found the usual way instead; the same photo is then their ID check.
      if (photo) pendingPhoto.current = photo;
      else phoneHeldId.current = true;
      setStep({ name: "letter" });
      setTimeout(() => setMessage(copy.idFirstNoMatch), 0);
      return;
    }
    leadVerified.current = true;
    tellGuestSex(res.sex);
    setPrefill((p) => ({ ...p, 0: res.prefill }));
    noteRegister(0, res.register);
    setToken(res.token);
    setPlatform(res.platform);
    setStayedBefore(res.again === true);
    trustedLead.current = res.trusted === true;
    if (phoneFaces.current.has(0)) leadFaceDone.current = true;
    else if (res.facePhoto) {
      faceFirst.current = true;
      setQueue([]);
      return setStep({ name: "face", position: 0 });
    }
    await onConfirm(res.token);
  }

  /** A face photo is done with: after the ID-first selfie the rest of the check-in starts, otherwise on to the next step. */
  function faceDone() {
    if (!faceFirst.current) return void advance(queue);
    faceFirst.current = false;
    leadFaceDone.current = true;
    void onConfirm();
  }

  // The phone's task follows the photo step on screen; leaving one stops the phone (unless its selfie is still to come).
  const facePendingAt = (() => {
    const t = phone.task;
    const r = phone.result;
    if (!t || !r?.id || r.face) return null;
    return faceNext(t, String(r.id["status"] ?? "")) ? t.position : null;
  })();
  const stepKey = `${step.name}:${"position" in step ? step.position : ""}`;
  const onScreen = screenStep === stepKey;
  const wanted: { kind: PhotoKind; position: number; face: boolean } | null =
    !kiosk || onScreen
      ? null
      : step.name === "idFirst" && step.consented
        ? { kind: "find", position: 0, face: !!flow.selfie }
        : step.name === "identity" && step.method === "photo_id" && step.consented
          ? { kind: "lead", position: 0, face: !!plan?.facePhoto }
          : step.name === "companion" && step.ready
            ? { kind: "companion", position: step.position, face: !!plan?.facePhoto }
            : step.name === "face" && facePendingAt !== step.position
              ? { kind: "face", position: step.position, face: false }
              : null;
  const wantedKey = wanted ? `${wanted.kind}:${wanted.position}:${wanted.face}` : "";
  // On a door tablet's camera screens a message ("that isn't a photo ID") floats over the screen
  // for 3 seconds, so the preview never shrinks and Take photo stays where it was.
  const cameraOn =
    kiosk &&
    ((step.name === "idFirst" && step.consented) ||
      (step.name === "identity" && step.method === "photo_id" && step.consented) ||
      (step.name === "companion" && step.ready) ||
      step.name === "face");
  useEffect(() => {
    if (!cameraOn || !message) return;
    const t = setTimeout(() => setMessage(null), 3000);
    return () => clearTimeout(t);
  }, [cameraOn, message]);
  const keepFace = facePendingAt !== null;
  useEffect(() => {
    if (!kiosk) return;
    if (wanted)
      void phone.request({
        ...wanted,
        keep: !!plan?.keepIdPhoto,
        token: tokenRef.current || undefined,
      });
    else if (!keepFace) void phone.clear();
    // Only when the step's photo changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantedKey]);

  // The phone's answers: acted on once each, exactly as this screen's own camera would.
  useEffect(() => {
    const t = phone.task;
    const r = phone.result;
    if (!kiosk || !t || !r) return;
    if (r.id && !handled.current.has(`${t.n}:id`)) {
      handled.current.add(`${t.n}:id`);
      const id = r.id as never;
      if (t.kind === "find") void afterIdFirst(id, null);
      else if (t.kind === "lead") {
        phoneHeldId.current = false;
        afterPhoto(id);
      } else if (t.kind === "companion") void afterCompanion(t.position, id);
    }
    if (r.face && !handled.current.has(`${t.n}:face`)) {
      handled.current.add(`${t.n}:face`);
      phoneFaces.current.add(t.position);
      if (step.name === "face" && step.position === t.position) faceDone();
    }
    // Acted on when the answer arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phone.task?.n, phone.result]);

  // The end screen: the phone's part is over.
  useEffect(() => {
    if (step.name === "done") phone.end();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.name]);

  /** The surname initial: the stays with it, or the check-out day as the host's journey asks. */
  async function onLetter(l: string) {
    setLetter(l);
    if (property.listFlow) return void listStays(l);
    if (flow.checkout === "week") return setStep({ name: "checkout" });
    const res = await run(() =>
      options({ data: { code: property.code, deviceId: deviceId(), letter: l } }),
    );
    if (!res) return;
    if (res.status === "locked") return setStep({ name: "locked", until: res.until });
    setStep({ name: "checkout3", days: res.days });
  }

  // Tapped Check in on the host's welcome: that guest's stay opens without any questions.
  useEffect(() => {
    if (!welcomeStart) return;
    let live = true;
    const device = deviceToken(property.code);
    if (welcomeStart.card && device) {
      void run(() =>
        fromCard({
          data: { code: property.code, deviceId: deviceId(), handle: welcomeStart.card!, device },
        }),
      ).then((res) => {
        if (!live) return;
        if (!res || res.status !== "matched") return startFind();
        // Their own card: no "Is this you?", and their ID is already on file.
        void found(res.token, res.platform, res.firstName, false, false, false, true);
      });
      return () => {
        live = false;
      };
    }
    if (welcomeStart.version === null) return startFind();
    void run(() =>
      fromWelcome({
        data: {
          code: property.code,
          deviceId: deviceId(),
          version: welcomeStart.version!,
          source: welcomeStart.source ?? "all",
          ...(deviceToken(property.code) ? { device: deviceToken(property.code)! } : {}),
        },
      }),
    ).then((res) => {
      if (!live) return;
      if (!res || res.status !== "matched") return startFind();
      // The host already said who's arriving: no "Is this you?".
      void found(
        res.token,
        res.platform,
        res.firstName,
        res.needsName,
        res.returning,
        false,
        res.again === true,
      );
    });
    return () => {
      live = false;
    };
    // Runs once per tap on the welcome.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [welcomeStart?.n]);

  async function onGuestName(e: React.FormEvent) {
    e.preventDefault();
    const res = await run(() => saveName({ data: { token: tokenRef.current, fullName } }));
    if (!res) return;
    // Arrived from the host's welcome (or "Is this you?" is left out): straight on.
    if (welcomeStart?.version || !flow.confirm) return void onConfirm();
    setStep({ name: "confirm", firstName: res.firstName });
  }

  async function onPick(bookingId: string) {
    const res = await run(() =>
      pick({ data: { code: property.code, deviceId: deviceId(), bookingId, letter } }),
    );
    if (!res) return;
    setToken(res.token);
    setPlatform(res.platform);
    setStep({ name: "confirm", firstName: res.firstName });
  }

  // The square for others appears with the first other-guest screen.
  useEffect(() => {
    if (!otherGuestStep || share || !token) return;
    void shareFn({ data: { token: tokenRef.current } })
      .then((r) => setShare(r.share))
      .catch(() => {});
  }, [otherGuestStep, share, token, shareFn]);

  // Who's filling in where, every few seconds while others might be.
  useEffect(() => {
    if (!share || !token || step.name === "done") return;
    let live = true;
    const load = () =>
      void progressFn({ data: { token: tokenRef.current } })
        .then((r) => live && setSlots(r.slots))
        .catch(() => {});
    load();
    const id = window.setInterval(load, 3_000);
    return () => {
      live = false;
      window.clearInterval(id);
    };
  }, [share, token, step.name, progressFn]);

  // Someone picked up the guest on screen with their own phone: move on; when the last one finishes, finish.
  useEffect(() => {
    if (step.name === "waiting") {
      if (!slots.some((x) => x.state === "phone")) void finish();
      return;
    }
    if (
      (step.name === "companion" || step.name === "register" || step.name === "face") &&
      takenElsewhere(step.position)
    ) {
      const slot = slots.find((x) => x.position === step.position);
      void advance(
        queue,
        slot?.state === "phone"
          ? copy.onTheirPhone(copy.guestLabel(slot.kind, slot.position + 1))
          : undefined,
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slots]);

  /** From the end screen: someone else with them adds their ID (and register entry, face photo), then back to the end. */
  async function onAddGuest() {
    const position = adults;
    const res = await run(() =>
      party({
        data: { token: tokenRef.current, adults: adults + 1, childAges: childAges.current },
      }),
    );
    if (!res) return;
    setAdults(adults + 1);
    adding.current = true;
    const steps: After[] = [{ kind: "companion", position }];
    if (plan?.register) steps.push({ kind: "register", position, child: false });
    if (plan?.facePhoto) steps.push({ kind: "face", position });
    await advance(steps);
  }

  async function finish() {
    const res = await run(() => complete({ data: { token: tokenRef.current } }));
    if (res) setStep({ name: "done", ...res });
  }

  async function onConfirm(t = tokenRef.current) {
    const res = await run(() => confirm({ data: { token: t } }));
    if (!res) return;
    const seq = [...res.sequence] as CheckinMethod[];
    setSequence(seq);
    setKinds(res.last4Kinds);
    setPlan(res.party);
    setListFlow(res.listFlow);
    if (res.trusted) trustedLead.current = true;
    // Their ID was checked on an earlier stay: no ID photo or selfie, their register details to confirm.
    if (res.idFromEarlier) {
      leadVerified.current = true;
      const known = res.idFromEarlier.prefill;
      setPrefill((p) => ({ ...p, 0: known }));
      setTimeout(() => setMessage(copy.idFromEarlier), 0);
      if (res.party.register) await registerFromLastStay(known, t);
    }
    if (res.party.ask) {
      // The booking (or the host) already says how many: nothing to ask; anyone else can be added at the end.
      if (res.party.booked !== null)
        return void onParty(res.party.booked, [], res.listFlow, seq, res.party);
      setAdults(Math.max(1, res.party.booked ?? 1));
      return setStep({ name: "party" });
    }
    await startIdentity(res.listFlow, seq, 1, res.party);
  }

  /**
   * A returning guest's register entry from their last stay, when it's complete: kept again as
   * it was for a guest who only gives name and nationality; otherwise only the next destination
   * (it changes every stay) is asked. An incomplete one gets the usual form.
   */
  async function registerFromLastStay(known: Prefill, t: string) {
    const nationality = known.nationality ?? "";
    const entry = {
      fullName: known.fullName ?? "",
      nationality,
      documentNumber: known.documentNumber ?? null,
      placeOfIssue: known.placeOfIssue ?? null,
      nextDestination: null,
      nextAddress: null,
    };
    // Complete apart from where they go next.
    if (!cleanRegisterEntry({ ...entry, nextDestination: "known" }).ok) return;
    if (isAlien(nationality)) {
      registerAsk.current[0] = ["destination"];
      return;
    }
    const saved = await run(() =>
      register({
        data: { token: t, position: 0, ...entry, documentNumber: null, placeOfIssue: null },
      }),
    );
    if (saved?.ok) registerFrom.current[0] = "saved";
  }

  async function startIdentity(list = listFlow, seq = sequence, people = adults, p = plan) {
    // Their ID found the stay: it's already checked.
    if (leadVerified.current) return afterLead(people, p);
    // The phone kept the ID photo that didn't find the stay: it sends it as soon as the step asks.
    if (phoneHeldId.current && !list && seq[0] === "photo_id") {
      return setStep({ name: "identity", method: "photo_id", consented: true });
    }
    // A photo taken first that didn't find the stay: used now rather than asked for again.
    const photo = pendingPhoto.current;
    if (photo && !list && seq[0] === "photo_id") {
      pendingPhoto.current = null;
      setStep({ name: "identity", method: "photo_id", consented: true });
      return void onPhoto(photo.full, photo.small, p, people);
    }
    if (list) {
      const ok = await run(() => declare({ data: { token: tokenRef.current } }));
      if (ok) afterLead(people, p);
      return;
    }
    setStep({ name: "identity", method: seq[0] ?? "self_declare", consented: false });
  }

  async function onParty(
    nextAdults: number,
    ages: number[],
    list = listFlow,
    seq = sequence,
    p = plan,
  ) {
    const res = await run(() =>
      party({ data: { token: tokenRef.current, adults: nextAdults, childAges: ages } }),
    );
    if (!res) return;
    setAdults(nextAdults);
    childAges.current = ages;
    await startIdentity(list, seq, nextAdults, p);
  }

  /**
   * After the lead guest: their register entry and face photo, then each
   * other adult's ID, register entry and face, then any 16 or 17 year olds'
   * register entries.
   */
  function afterLead(people = adults, p = plan) {
    const steps: After[] = [];
    if (p?.register) steps.push({ kind: "register", position: 0, child: false });
    if (p?.facePhoto) steps.push({ kind: "face", position: 0 });
    for (let i = 1; i < people; i++) {
      if (p?.everyAdult) steps.push({ kind: "companion", position: i });
      if (p?.register) steps.push({ kind: "register", position: i, child: false });
      if (p?.facePhoto) steps.push({ kind: "face", position: i });
    }
    if (p?.register) {
      childAges.current.forEach((age, i) => {
        if (age >= REGISTER_AGE)
          steps.push({ kind: "register", position: people + i, child: true });
      });
    }
    void advance(steps);
  }

  async function advance(all: After[], note?: string) {
    // Guests filling in (or done) on their own phones are left to them.
    // The register entry came from their ID, or the host adds it from the kept photo: nothing to ask.
    const steps = all.filter(
      (x) =>
        !takenElsewhere(x.position) &&
        !(x.kind === "face" && phoneFaces.current.has(x.position)) &&
        !(x.kind === "face" && x.position === 0 && (leadFaceDone.current || trustedLead.current)) &&
        !(
          x.kind === "register" &&
          ["saved", "later"].includes(registerFrom.current[x.position] ?? "")
        ),
    );
    const [next, ...rest] = steps;
    setQueue(rest);
    if (!next) {
      if (slotsRef.current.some((x) => x.state === "phone")) setStep({ name: "waiting" });
      else await finish();
    } else if (next.kind === "face") {
      setStep({ name: "face", position: next.position });
    } else if (next.kind === "register") {
      setStep({
        name: "register",
        position: next.position,
        child: next.child,
        only: registerAsk.current[next.position],
      });
    } else {
      setStep({ name: "companion", position: next.position, ready: false });
    }
    if (note) setTimeout(() => setMessage(note), 0);
  }

  async function onCompanion(position: number, full: string, small: string) {
    await phone.clear();
    const tries = (companionTries.current[position] ?? 0) + 1;
    companionTries.current[position] = tries;
    const res = await run(() =>
      companionId({
        data: {
          token: tokenRef.current,
          position,
          image: full,
          ...(plan?.keepIdPhoto ? { small } : {}),
          ...(tries > 1 ? { again: true } : {}),
        },
      }),
    );
    if (res) await afterCompanion(position, res);
  }

  /** The answer to another guest's ID, from this screen's camera or the phone's. */
  async function afterCompanion(
    position: number,
    res: Awaited<ReturnType<typeof checkCompanionId>>,
  ) {
    if (res.status === "retry") {
      return setMessage(res.reason === "not_photo_id" ? copy.idNotPhotoId : copy.idRetryPlain);
    }
    if (res.status === "skip") {
      const ok = await run(() => skipCompanion({ data: { token: tokenRef.current, position } }));
      if (ok) await advance(queue, copy.companionSkipped);
      return;
    }
    setPrefill((p) => ({ ...p, [position]: res.prefill }));
    noteRegister(position, res.register);
    await advance(
      queue,
      res.under18
        ? copy.companionUnder18
        : res.firstName
          ? copy.companionThanks(res.firstName)
          : copy.companionKept,
    );
  }

  async function onRegister(position: number, entry: RegisterForm) {
    const res = await run(() =>
      register({ data: { token: tokenRef.current, position, ...entry } }),
    );
    if (!res) return;
    if (!res.ok) return setMessage(res.missing.map((m) => copy.registerMissing[m]).join(" "));
    await advance(queue);
  }

  async function onSkipCompanion(position: number) {
    const ok = await run(() => skipCompanion({ data: { token: tokenRef.current, position } }));
    if (ok) await advance(queue, copy.companionSkipped);
  }

  async function onFace(position: number, small: string) {
    await phone.clear();
    const ok = await run(() => face({ data: { token: tokenRef.current, position, image: small } }));
    if (ok) faceDone();
  }

  function fallback(from: CheckinMethod, note?: string) {
    trustedLead.current = false;
    const i = sequence.indexOf(from);
    const next = sequence[Math.min(i + 1, sequence.length - 1)] ?? "self_declare";
    setStep({ name: "identity", method: next, consented: false });
    if (note) setTimeout(() => setMessage(note), 0);
  }

  async function onPhoto(full: string, small: string, p = plan, people = adults) {
    await phone.clear();
    const res = await run(() =>
      photo({
        data: { token: tokenRef.current, image: full, ...(p?.keepIdPhoto ? { small } : {}) },
      }),
    );
    afterPhoto(res, p, people);
  }

  /** The answer to the lead guest's ID, from this screen's camera or the phone's. */
  function afterPhoto(
    res: Awaited<ReturnType<typeof verifyPhotoId>> | null,
    p = plan,
    people = adults,
  ) {
    if (!res) return fallback("photo_id");
    if (res.status === "retry") {
      return setMessage(
        res.reason === "not_photo_id"
          ? `${copy.idNotPhotoId} ${copy.idTriesLeft(res.left)}`
          : copy.idRetry(res.left),
      );
    }
    if (res.status === "fallback") return fallback("photo_id");
    if ("sex" in res) tellGuestSex(res.sex);
    setPrefill((x) => ({ ...x, 0: res.prefill }));
    noteRegister(0, res.register);
    afterLead(people, p);
  }

  const lockedTime =
    step.name === "locked"
      ? formatUkTime(
          new Date(step.until).toLocaleTimeString("en-GB", {
            timeZone: "Europe/London",
            hour: "2-digit",
            minute: "2-digit",
          }),
        )
      : "";

  // Shared demo only: tell visitors the fake guest's answers for the step they're on.
  // Public demo only: a line for whichever screen is showing, so the
  // guidance follows the flow as steps appear or are skipped.
  const hint = property.demoHint;
  const demoHint = hint ? demoLine(step, hint, siteOf(hint.channel).label) : null;

  const canGoBack = [
    "idFirst",
    "letter",
    "checkout",
    "checkout3",
    "platform",
    "pick",
    "guestName",
  ].includes(step.name);
  // Nights on the week's check-out days count from the day before the first one (today, or yesterday after midnight).
  const arrivalDay = property.firstCheckout ? addDays(property.firstCheckout, -1) : null;
  // Every step between the welcome and the end offers a way out to the host.
  const canHandOver = !["welcome", "done", "handover", "locked"].includes(step.name);

  async function handOver() {
    const back = step;
    // The host is told even if this call fails, so never leave the guest stuck.
    await run(() =>
      handover({
        data: { code: property.code, ...(tokenRef.current ? { token: tokenRef.current } : {}) },
      }),
    );
    setStep({ name: "handover", back });
  }

  // On a tablet or computer at the door, guests can use their own phone instead.
  // The kiosk prop already means a shared screen (a phone held upright is the guest's own),
  // so this holds either way up; only the welcome's layout depends on the way up.
  // The way the device is held (a keyboard never flips it), or a computer window's shape.
  const landscape = useLandscapeDisplay();
  const kioskWide = kiosk;
  // A door tablet on its side: the camera beside its buttons, the guide's QR beside its button,
  // so those steps use the width instead of shrinking the text to fit the height.
  const cameraSide = kiosk && landscape;
  // The preview floats right by the tablet's front camera.
  const cameraSpot = useMemo(() => {
    if (!kiosk || jumbo || typeof window === "undefined") return null;
    const way = landscape ? ("landscape" as const) : ("portrait" as const);
    const sig = deviceSignature(navigator.userAgent, {
      w: window.screen.width,
      h: window.screen.height,
      dpr: window.devicePixelRatio,
      touch: navigator.maxTouchPoints,
    });
    // Only once the host has placed this tablet's camera: until then, the standard layout.
    return cameraSpots[way] ? spotFor(cameraSpots, sig, way) : null;
  }, [kiosk, jumbo, landscape, cameraSpots]);
  const phoneUrl =
    typeof window === "undefined" ? "" : `${window.location.origin}/kiosk/${property.code}?guest=1`;
  // While other guests are being filled in: the square lets each use their own phone at once.
  const joinUrl =
    typeof window === "undefined" || !share
      ? null
      : `${window.location.origin}/kiosk/${property.code}?join=${encodeURIComponent(share)}`;
  const othersNow = otherGuestStep && !!joinUrl;

  // The square only means something once there is a stay to carry across.
  const handoffUrl =
    typeof window === "undefined"
      ? null
      : step.name === "done"
        ? null // The guest guide link and its QR sit on the done screen itself.
        : token
          ? `${window.location.origin}/kiosk/${property.code}?resume=${encodeURIComponent(token)}`
          : null;

  return (
    // data-kx: the parts that stretch to fill a door tablet set to expanded buttons (styles.css).
    <TestSamplesContext.Provider value={stayedSamples ?? outerSamples}>
      {stayedSamples && !outerSamples ? (
        <p
          role="status"
          className="pointer-events-none fixed left-1/2 top-2 z-50 -translate-x-1/2 rounded-full bg-amber-300 px-4 py-1 text-sm font-semibold text-black"
        >
          {copy.testSamplesFound}
        </p>
      ) : null}
      <div
        data-kiosk-flow
        data-kx="col"
        className={cn("mx-auto w-full", kiosk ? "max-w-6xl py-6" : "max-w-6xl py-8")}
      >
        {canGoBack ? (
          <JumboSlot on={jumbo} to="jumbo-back">
            <Button
              variant="ghost"
              size="lg"
              className="mb-4"
              onClick={() =>
                setStep(
                  step.name === "letter" || step.name === "idFirst"
                    ? { name: "welcome" }
                    : step.name === "checkout" || step.name === "checkout3" || step.name === "pick"
                      ? { name: "letter" }
                      : flow.checkout === "three"
                        ? { name: "letter" }
                        : { name: "checkout" },
                )
              }
            >
              <ArrowLeft className="size-5" /> {copy.back}
            </Button>
          </JumboSlot>
        ) : null}

        <div
          data-kx="grow"
          className={cn(
            "grid gap-6",
            // Upright, the phone square sits under the welcome instead of beside it.
            kioskWide && step.name === "welcome" && qrPanel
              ? landscape
                ? "grid-cols-[minmax(0,1fr)_minmax(13rem,20rem)] items-center"
                : "items-center"
              : handoffUrl && !onPhone && !kiosk
                ? "lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start"
                : "",
          )}
        >
          <main data-kx="col" className="card-soft relative p-6 sm:p-10" aria-live="polite">
            {away ? (
              <HandoffAway kiosk={kiosk} busy={busy} onTakeBack={() => void takeBack()} />
            ) : null}
            {demoHint ? (
              <p className="mb-6 rounded-2xl bg-secondary px-4 py-3 text-center text-base">
                {demoHint}
              </p>
            ) : null}
            {step.name === "welcome" ? (
              <div
                data-jumbo-welcome={jumbo ? "" : undefined}
                className={
                  jumbo
                    ? "grid h-full min-h-0 grid-cols-[3fr_1fr] items-center gap-[4cqmin]"
                    : "contents"
                }
              >
                <div data-kx="center" className="py-6 text-center">
                  {/* The theme's own words and mark: a centred crest and name, a small heading, its welcome and features. */}
                  {property.theme?.layout === "centred" ? (
                    <BrandBlock theme={property.theme} name={property.name} className="mb-6" />
                  ) : null}
                  {property.theme?.eyebrow ? (
                    <p className="mb-2 text-sm font-semibold uppercase tracking-[0.3em] text-accent">
                      {property.theme.eyebrow}
                    </p>
                  ) : null}
                  <h1 className="text-3xl leading-tight sm:text-5xl">
                    {property.theme
                      ? welcomeTitle(property.theme, property.name, copy.welcomeTo(property.name))
                      : copy.welcomeTo(property.name)}
                  </h1>
                  {property.theme?.layout === "centred" ? (
                    <span
                      aria-hidden
                      className="mx-auto mt-4 flex w-48 items-center gap-2 text-accent"
                    >
                      <span className="h-px flex-1 bg-current opacity-60" />
                      <span className="size-2 rotate-45 bg-current" />
                      <span className="h-px flex-1 bg-current opacity-60" />
                    </span>
                  ) : null}
                  <p className="mt-4 text-xl text-muted-foreground sm:text-2xl">
                    {property.theme?.welcomeBody || copy.letsCheckIn}
                  </p>
                  {property.theme?.features.length && !jumbo ? (
                    <ThemeFeatures
                      theme={property.theme}
                      className="mt-6 justify-center text-left"
                    />
                  ) : null}
                  <div className="mt-10 flex w-full items-center justify-center gap-3">
                    {voiceStart && canSpeak ? (
                      // One Check in: the concierge starts with it (muted if the tablet was set so before).
                      <VoiceRing>
                        <Button
                          size="touch-xl"
                          className="w-full text-xl"
                          onClick={() => {
                            // This tap is what lets an Android tablet play and measure sound later.
                            unlockAudio();
                            // The concierge and the first step start together: it speaks as the
                            // next screen appears, and the welcome never shows a second button.
                            voiceStart();
                            startFind();
                          }}
                          data-voice="yes"
                        >
                          {copy.startCta}
                        </Button>
                      </VoiceRing>
                    ) : (
                      <Button
                        size="touch-xl"
                        className="w-full max-w-md text-xl"
                        onClick={startFind}
                        data-voice="yes"
                      >
                        {copy.startCta}
                      </Button>
                    )}
                  </div>
                  {property.checkInFrom && property.checkOutBy ? (
                    <p className="mt-6 text-muted-foreground">
                      {copy.stayWindow(property.checkInFrom, property.checkOutBy)}
                    </p>
                  ) : null}
                </div>
                {jumbo ? <CardQr url={phoneUrl} label={copy.jumboWords.phone} /> : null}
              </div>
            ) : null}

            {step.name === "letter" ? (
              <section data-kx="col">
                <h1 className="text-2xl sm:text-4xl">{copy.stepLetter}</h1>
                <p className="mt-2 text-muted-foreground">{copy.stepLetterHint}</p>
                <div
                  data-kx="grid"
                  className="mt-6 grid grid-cols-5 gap-2 sm:grid-cols-7 lg:grid-cols-9"
                >
                  {LETTERS.map((l) => (
                    <Button
                      key={l}
                      variant="outline"
                      size="touch"
                      className="text-2xl font-semibold"
                      disabled={busy}
                      data-voice={`letter-${l}`}
                      onClick={() => void onLetter(l)}
                    >
                      {l}
                    </Button>
                  ))}
                </div>
              </section>
            ) : null}

            {step.name === "checkout" ? (
              <section data-kx="col">
                <h1 className="text-2xl sm:text-4xl">{copy.stepCheckout}</h1>
                <div
                  data-kx="grid"
                  data-kx-fit
                  className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
                >
                  {property.checkoutChoices.map((d) => (
                    <Button
                      key={d}
                      variant="outline"
                      size="touch-xl"
                      className="h-auto flex-col gap-0 py-3 text-xl"
                      disabled={busy}
                      onClick={() => {
                        setCheckOut(d);
                        setPicked(false);
                        void findStay(d, undefined, false);
                      }}
                    >
                      {formatUkDate(d)}
                      {arrivalDay ? (
                        <span className="text-sm font-normal text-muted-foreground">
                          {copy.nights(nightsBetween(arrivalDay, d))}
                        </span>
                      ) : null}
                    </Button>
                  ))}
                </div>
              </section>
            ) : null}

            {step.name === "checkout3" ? (
              <section data-kx="col">
                <h1 className="text-2xl sm:text-4xl">{copy.stepCheckoutPick}</h1>
                <p className="mt-2 text-muted-foreground">{copy.stepCheckoutPickHint}</p>
                <div data-kx="grid" data-kx-fit className="mt-6 grid gap-3 sm:grid-cols-3">
                  {step.days.map((d) => (
                    <Button
                      key={d.date}
                      variant="outline"
                      size="touch-xl"
                      className="h-auto flex-col gap-1 py-5 text-2xl"
                      disabled={busy}
                      onClick={() => {
                        setCheckOut(d.date);
                        setPicked(true);
                        void findStay(d.date, undefined, true);
                      }}
                    >
                      {formatUkDate(d.date)}
                      <span className="text-base font-normal text-muted-foreground">
                        {copy.nights(d.nights)}
                      </span>
                    </Button>
                  ))}
                </div>
                {busy ? (
                  <Loader2 className="mx-auto mt-6 size-8 animate-spin text-muted-foreground" />
                ) : null}
              </section>
            ) : null}

            {step.name === "platform" ? (
              <section data-kx="col">
                <h1 className="text-2xl sm:text-4xl">{copy.stepPlatform}</h1>
                <div data-kx="grid" data-kx-fit className="mt-6 grid gap-3 sm:grid-cols-2">
                  {step.only.map(siteOf).map((site) => (
                    <Button
                      key={site.key}
                      variant="outline"
                      size="touch-xl"
                      className="justify-start gap-4 text-xl"
                      disabled={busy}
                      onClick={() => void findStay(checkOut, site.key)}
                    >
                      <ChannelIcon channel={site.key} iconUrl={site.iconUrl} label={site.label} />
                      {site.label}
                    </Button>
                  ))}
                </div>
                {busy ? (
                  <Loader2 className="mx-auto mt-6 size-8 animate-spin text-muted-foreground" />
                ) : null}
              </section>
            ) : null}

            {step.name === "pick" ? (
              <section data-kx="col">
                <h1 className="text-2xl sm:text-4xl">{copy.stepPickBooking}</h1>
                {step.items.length === 0 ? (
                  <p className="mt-6 text-lg text-muted-foreground">{copy.noArrivals}</p>
                ) : (
                  <div data-kx="grid" data-kx-fit className="mt-6 grid gap-3 sm:grid-cols-2">
                    {step.items.map((i) => (
                      <Button
                        key={i.id}
                        variant="outline"
                        size="touch-xl"
                        className="flex-col gap-0 text-xl"
                        disabled={busy}
                        onClick={() => void onPick(i.id)}
                      >
                        <span className="flex items-center gap-2">
                          {i.channel ? (
                            <ChannelIcon
                              channel={i.channel}
                              iconUrl={siteOf(i.channel).iconUrl}
                              label={siteOf(i.channel).label}
                              size="1em"
                            />
                          ) : null}
                          {i.label}
                        </span>
                        <span className="text-sm font-normal text-muted-foreground">
                          {copy.stayCheckout} {formatUkDate(i.checkOut)}
                        </span>
                      </Button>
                    ))}
                  </div>
                )}
              </section>
            ) : null}

            {step.name === "no_match" ? (
              <section className="py-4 text-center">
                <h1 className="text-2xl sm:text-4xl">{copy.noMatchTitle}</h1>
                <p className="mx-auto mt-4 max-w-prose text-lg text-muted-foreground">
                  {copy.noMatchBody}
                </p>
                <div className="mt-8 flex flex-col items-center gap-3">
                  <Button
                    size="touch-xl"
                    className="w-full max-w-md"
                    onClick={() => {
                      // Their ID and selfie are taken anyway, and the host is told at once.
                      forceFind.current = true;
                      setStep({ name: "idFirst", consented: true });
                    }}
                  >
                    {copy.continueWithId}
                  </Button>
                  <JumboSlot on={jumbo} to="jumbo-status">
                    <Button
                      size="touch"
                      variant="outline"
                      className="w-full max-w-md"
                      onClick={() => setStep({ name: "letter" })}
                    >
                      {copy.startAgain}
                    </Button>
                  </JumboSlot>
                  <HostCall phone={hostPhone} />
                </div>
              </section>
            ) : null}

            {step.name === "locked" ? (
              <section className="py-4 text-center">
                <h1 className="text-2xl sm:text-4xl">{copy.lockedTitle}</h1>
                <p className="mx-auto mt-4 max-w-prose text-lg text-muted-foreground">
                  {copy.lockedBody(lockedTime)}
                </p>
                <div className="mt-8 flex justify-center">
                  <HostCall phone={hostPhone} />
                </div>
              </section>
            ) : null}

            {step.name === "guestName" ? (
              <section className="mx-auto max-w-xl">
                <h1 className="text-2xl sm:text-4xl">{copy.nameTitle}</h1>
                <p className="mt-2 text-muted-foreground">{copy.nameHint}</p>
                <form className="mt-6 space-y-4" onSubmit={(e) => void onGuestName(e)}>
                  <Input
                    aria-label={copy.nameTitle}
                    className="h-16 text-2xl"
                    autoComplete="name"
                    autoFocus
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                  />
                  <Button
                    type="submit"
                    size="touch-xl"
                    className="w-full"
                    disabled={busy || fullName.trim().split(/\s+/).length < 2}
                  >
                    {busy ? <Loader2 className="size-6 animate-spin" /> : null}
                    {copy.nameCta}
                  </Button>
                </form>
              </section>
            ) : null}

            {step.name === "confirm" ? (
              <section data-kx="col" className="py-4 text-center">
                <h1 className="text-4xl sm:text-6xl">
                  {step.returning || step.again
                    ? copy.welcomeBack(step.firstName)
                    : copy.hi(step.firstName)}
                </h1>
                <p className="mt-4 text-xl text-muted-foreground">
                  {step.returning ? (
                    copy.welcomeBackBody
                  ) : platform &&
                    !(
                      platform === "other" && siteOf(platform).label === copy.platforms["other"]
                    ) ? (
                    <ConfirmOnSite site={siteOf(platform)} />
                  ) : (
                    copy.confirmBody
                  )}
                </p>
                <div
                  data-kx="grid"
                  className="mx-auto mt-8 grid w-full max-w-xl gap-3 sm:grid-cols-2"
                >
                  <Button
                    size="touch-xl"
                    data-voice="yes"
                    onClick={() => void onConfirm()}
                    disabled={busy}
                  >
                    {busy ? <Loader2 className="size-6 animate-spin" /> : null}
                    {copy.confirmYes}
                  </Button>
                  <Button
                    size="touch-xl"
                    variant="outline"
                    data-voice="no"
                    onClick={restart}
                    disabled={busy}
                  >
                    {copy.confirmNo}
                  </Button>
                </div>
              </section>
            ) : null}

            {step.name === "idFirst" ? (
              <section
                className={cn("mx-auto", step.consented && cameraSide ? "max-w-5xl" : "max-w-xl")}
              >
                <h1 className="text-2xl sm:text-4xl">{copy.idFirstTitle}</h1>
                {!step.consented ? (
                  <>
                    <p className="mt-4 text-lg">{copy.idFirstLead}</p>
                    <WhyAsk>
                      {property.records?.keepsPhoto
                        ? copy.idConsentPhoto(property.records.keepDays)
                        : copy.idConsentDetails(property.records?.keepDays ?? 30)}
                    </WhyAsk>
                    <div className="mt-8 grid gap-3">
                      <Button
                        size="touch-xl"
                        data-voice="yes"
                        onClick={() => setStep({ ...step, consented: true })}
                      >
                        {copy.idConsentAgree}
                      </Button>
                      <Button
                        size="touch"
                        variant="outline"
                        data-voice="no"
                        onClick={() => setStep({ name: "letter" })}
                      >
                        {jumbo ? copy.jumboWords.noId : copy.idFirstOther}
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className="mt-6">
                    <PhotoChoice
                      kiosk={kiosk}
                      compact={jumbo ? "jumbo" : kiosk && !cameraSpot}
                      phone={phone}
                      kind="id"
                      task="find"
                      facing={cameraFor("id", kiosk, flow)}
                      onUseScreen={() => setScreenStep(stepKey)}
                      screen={onScreen}
                      extra={
                        <Button
                          variant="ghost"
                          size="lg"
                          className="w-full"
                          onClick={() => setStep({ name: "letter" })}
                        >
                          {jumbo ? copy.jumboWords.noId : copy.idFirstOther}
                        </Button>
                      }
                      camera={({ facing, onFail, panel }) => (
                        <IdCamera
                          auto={kiosk}
                          jumbo={jumbo}
                          aside={panel}
                          spot={cameraSpot}
                          busy={busy}
                          side={cameraSide}
                          facing={facing}
                          upload={!kiosk}
                          onCapture={(full, small) => void onIdFirst(full, small)}
                          onFail={kiosk ? onFail : () => setStep({ name: "letter" })}
                          extra={
                            <>
                              <Button
                                variant="ghost"
                                size="lg"
                                className="w-full"
                                onClick={() => setStep({ name: "letter" })}
                              >
                                {jumbo ? copy.jumboWords.noId : copy.idFirstOther}
                              </Button>
                            </>
                          }
                        />
                      )}
                    />
                  </div>
                )}
              </section>
            ) : null}

            {step.name === "identity" && step.method === "photo_id" ? (
              <section
                className={cn("mx-auto", step.consented && cameraSide ? "max-w-5xl" : "max-w-xl")}
              >
                <h1 className="text-2xl sm:text-4xl">{copy.idTitle}</h1>
                {!step.consented ? (
                  <>
                    <p className="mt-4 text-lg">{copy.idConsentLead}</p>
                    <WhyAsk>
                      {plan?.keepIdPhoto
                        ? copy.idConsentPhoto(plan.keepDays)
                        : copy.idConsentDetails(plan?.keepDays ?? 30)}
                    </WhyAsk>
                    <div className="mt-8 grid gap-3">
                      <Button size="touch-xl" onClick={() => setStep({ ...step, consented: true })}>
                        {copy.idConsentAgree}
                      </Button>
                      <Button size="touch" variant="outline" onClick={() => fallback("photo_id")}>
                        {jumbo ? copy.jumboWords.otherWay : copy.idUseOther}
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className="mt-6">
                    <PhotoChoice
                      kiosk={kiosk}
                      compact={jumbo ? "jumbo" : kiosk && !cameraSpot}
                      phone={phone}
                      kind="id"
                      task="lead"
                      facing={cameraFor("id", kiosk, flow)}
                      onUseScreen={() => setScreenStep(stepKey)}
                      screen={onScreen}
                      extra={
                        <Button
                          variant="ghost"
                          size="lg"
                          className="w-full"
                          onClick={() => fallback("photo_id")}
                        >
                          {jumbo ? copy.jumboWords.otherWay : copy.idUseOther}
                        </Button>
                      }
                      camera={({ facing, onFail, panel }) => (
                        <IdCamera
                          auto={kiosk}
                          jumbo={jumbo}
                          aside={panel}
                          spot={cameraSpot}
                          busy={busy}
                          side={cameraSide}
                          facing={facing}
                          upload={!kiosk}
                          onCapture={(full, small) => void onPhoto(full, small)}
                          onFail={kiosk ? onFail : () => fallback("photo_id", copy.idCameraFailed)}
                          extra={
                            <>
                              <Button
                                variant="ghost"
                                size="lg"
                                className="w-full"
                                onClick={() => fallback("photo_id")}
                              >
                                {jumbo ? copy.jumboWords.otherWay : copy.idUseOther}
                              </Button>
                            </>
                          }
                        />
                      )}
                    />
                  </div>
                )}
              </section>
            ) : null}

            {step.name === "identity" && step.method === "last4" ? (
              <Last4Step
                kinds={kinds}
                busy={busy}
                onSubmit={async (kind, value) => {
                  const res = await run(() =>
                    last4({ data: { token: tokenRef.current, kind, value } }),
                  );
                  if (!res) return;
                  if (res.status === "retry") return setMessage(copy.last4Retry(res.left));
                  if (res.status === "fallback") return fallback("last4");
                  if (res.prefill) {
                    const known = res.prefill;
                    setPrefill((p) => ({ ...p, 0: known }));
                  }
                  afterLead();
                }}
                onOther={() => fallback("last4")}
              />
            ) : null}

            {step.name === "identity" && step.method === "self_declare" ? (
              <section className="mx-auto max-w-xl">
                <h1 className="text-2xl sm:text-4xl">{copy.selfTitle}</h1>
                <p className="mt-4 text-lg">{copy.selfBody}</p>
                <p className="mt-4 rounded-2xl bg-secondary p-4 text-secondary-foreground">
                  {copy.selfNote}
                </p>
                <Button
                  size="touch-xl"
                  className="mt-8 w-full"
                  disabled={busy}
                  onClick={async () => {
                    const ok = await run(() => declare({ data: { token: tokenRef.current } }));
                    if (ok) afterLead();
                  }}
                >
                  {busy ? <Loader2 className="size-6 animate-spin" /> : null}
                  {copy.selfConfirm}
                </Button>
              </section>
            ) : null}

            {step.name === "party" && plan ? (
              <PartyStep
                plan={plan}
                initialAdults={adults}
                busy={busy}
                onSubmit={(a, ages) => void onParty(a, ages)}
              />
            ) : null}

            {step.name === "companion" ? (
              <section
                className={cn("mx-auto", step.ready && cameraSide ? "max-w-5xl" : "max-w-xl")}
              >
                <h1 className="text-2xl sm:text-4xl">
                  {copy.companionTitle(step.position + 1, adults)}
                </h1>
                {!step.ready ? (
                  <>
                    <p className="mt-4 text-lg">{copy.companionBody}</p>
                    <p className="mt-2 text-muted-foreground">{copy.companionConsentLead}</p>
                    <WhyAsk>
                      {plan?.keepIdPhoto
                        ? copy.idConsentPhoto(plan.keepDays)
                        : copy.idConsentDetails(plan?.keepDays ?? 30)}
                    </WhyAsk>
                    <div className="mt-8 grid gap-3">
                      <Button size="touch-xl" onClick={() => setStep({ ...step, ready: true })}>
                        {copy.companionReady}
                      </Button>
                      <Button
                        size="touch"
                        variant="outline"
                        disabled={busy}
                        onClick={() => void onSkipCompanion(step.position)}
                      >
                        {jumbo ? copy.jumboWords.skip : copy.companionSkip}
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className="mt-6">
                    <PhotoChoice
                      key={`companion-${step.position}`}
                      kiosk={kiosk}
                      compact={jumbo ? "jumbo" : kiosk && !cameraSpot}
                      phone={phone}
                      kind="id"
                      task="companion"
                      facing={cameraFor("id", kiosk, flow)}
                      onUseScreen={() => setScreenStep(stepKey)}
                      screen={onScreen}
                      extra={
                        <Button
                          variant="ghost"
                          size="lg"
                          className="w-full"
                          disabled={busy}
                          onClick={() => void onSkipCompanion(step.position)}
                        >
                          {jumbo ? copy.jumboWords.skip : copy.companionSkip}
                        </Button>
                      }
                      camera={({ facing, onFail, panel }) => (
                        <IdCamera
                          auto={kiosk}
                          jumbo={jumbo}
                          aside={panel}
                          spot={cameraSpot}
                          busy={busy}
                          side={cameraSide}
                          facing={facing}
                          upload={!kiosk}
                          onCapture={(full, small) => void onCompanion(step.position, full, small)}
                          onFail={kiosk ? onFail : () => void onSkipCompanion(step.position)}
                          extra={
                            <>
                              <Button
                                variant="ghost"
                                size="lg"
                                className="w-full"
                                disabled={busy}
                                onClick={() => void onSkipCompanion(step.position)}
                              >
                                {jumbo ? copy.jumboWords.skip : copy.companionSkip}
                              </Button>
                            </>
                          }
                        />
                      )}
                    />
                  </div>
                )}
              </section>
            ) : null}

            {step.name === "register" ? (
              <RegisterStep
                key={`register-${step.position}`}
                title={
                  step.only
                    ? copy.registerAskTitle
                    : step.child
                      ? copy.registerTitleChild
                      : step.position === 0
                        ? prefill[0]?.fullName
                          ? copy.registerTitleYou
                          : copy.registerTitleBlank
                        : copy.registerTitleAdult(step.position + 1)
                }
                lead={
                  step.only && prefill[step.position]?.fromLastStay
                    ? copy.registerAskLeadAgain
                    : step.only
                      ? copy.registerAskLead(prefill[step.position]?.fullName ?? "")
                      : step.position === 0
                        ? copy.registerLead
                        : copy.registerLeadOther
                }
                only={step.only}
                prefill={prefill[step.position] ?? null}
                busy={busy}
                kiosk={kiosk}
                jumbo={jumbo}
                onSubmit={(entry) => void onRegister(step.position, entry)}
              />
            ) : null}

            {step.name === "face" ? (
              <section className={cn("mx-auto", cameraSide ? "max-w-5xl" : "max-w-xl")}>
                <h1 className="text-2xl sm:text-4xl">
                  {step.position === 0 ? copy.faceTitle : copy.faceTitleOther(step.position + 1)}
                </h1>
                <div className="mt-6">
                  <PhotoChoice
                    key={`face-${step.position}`}
                    kiosk={kiosk}
                    compact={jumbo ? "jumbo" : kiosk && !cameraSpot}
                    phone={phone}
                    kind="face"
                    task="face"
                    facePending={facePendingAt === step.position}
                    facing={cameraFor("face", kiosk, flow)}
                    onUseScreen={() => setScreenStep(stepKey)}
                    screen={onScreen}
                    extra={
                      <Button
                        variant="ghost"
                        size="lg"
                        className="w-full"
                        disabled={busy}
                        onClick={() => faceDone()}
                      >
                        {jumbo ? copy.jumboWords.skip : copy.faceSkip}
                      </Button>
                    }
                    camera={({ facing, onFail, panel }) => (
                      <IdCamera
                        auto={kiosk}
                        jumbo={jumbo}
                        aside={panel}
                        spot={cameraSpot}
                        facing={facing}
                        kind="face"
                        busy={busy}
                        side={cameraSide}
                        help={copy.faceBody}
                        cta={copy.faceTake}
                        busyLabel={copy.faceSaving}
                        upload={!kiosk}
                        onCapture={(_full, small) => void onFace(step.position, small)}
                        onFail={kiosk ? onFail : () => faceDone()}
                        extra={
                          <>
                            <Button
                              variant="ghost"
                              size="lg"
                              className="w-full"
                              disabled={busy}
                              onClick={() => faceDone()}
                            >
                              {jumbo ? copy.jumboWords.skip : copy.faceSkip}
                            </Button>
                          </>
                        }
                      />
                    )}
                  />
                </div>
              </section>
            ) : null}

            {step.name === "waiting" ? (
              <section className="mx-auto max-w-xl text-center">
                <Loader2 className="mx-auto size-10 animate-spin text-primary" />
                <h1 className="mt-4 text-2xl sm:text-4xl">{copy.waitingTitle}</h1>
                <p className="mt-3 text-lg text-muted-foreground">{copy.waitingBody}</p>
                <ul className="mx-auto mt-6 max-w-sm space-y-2 text-left">
                  {slots.map((x) => (
                    <li
                      key={x.position}
                      className="flex items-center justify-between gap-3 rounded-xl border border-border px-4 py-3"
                    >
                      <span className="font-medium">{copy.guestLabel(x.kind, x.position + 1)}</span>
                      <span
                        className={cn(
                          "flex items-center gap-1.5 text-sm",
                          x.state === "done" ? "text-success" : "text-muted-foreground",
                        )}
                      >
                        {x.state === "done" ? (
                          <CheckCircle2 className="size-4" />
                        ) : x.state === "phone" ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : null}
                        {x.state === "done"
                          ? copy.slotDone
                          : x.state === "phone"
                            ? copy.slotPhone
                            : copy.slotOpen}
                      </span>
                    </li>
                  ))}
                </ul>
                <Button
                  size="touch"
                  variant="ghost"
                  className="mt-6"
                  disabled={busy}
                  onClick={() => void finish()}
                >
                  {copy.waitingSkip}
                </Button>
              </section>
            ) : null}

            {step.name === "handover" ? (
              <section className="py-4 text-center">
                <HandHeart className="mx-auto size-14 text-primary" />
                <h1 className="mt-4 text-2xl sm:text-4xl">{copy.handoverTitle}</h1>
                <p className="mx-auto mt-4 max-w-prose text-lg text-muted-foreground">
                  {copy.handoverBody}
                </p>
                <div className="mt-8 flex flex-col items-center gap-3">
                  <HostCall phone={hostPhone} />
                  <JumboSlot on={jumbo} to="jumbo-status">
                    <Button
                      size="touch"
                      variant="ghost"
                      className="w-full max-w-md"
                      onClick={() => setStep(step.back)}
                    >
                      {copy.handoverResume}
                    </Button>
                  </JumboSlot>
                </div>
              </section>
            ) : null}

            {step.name === "done" && jumbo ? (
              // Jumbo: the door codes (or, without codes, the welcome and the room) on the left, the guide's
              // QR on the right; "Someone else" and "I'm done" in the bars below.
              <section
                data-jumbo-done
                className="grid h-full min-h-0 grid-cols-[3fr_2fr] items-center gap-[4cqmin]"
              >
                <div className="flex min-h-0 flex-col justify-center gap-[2cqmin]">
                  {step.doors?.length ? (
                    <>
                      {step.roomName && !step.held ? (
                        <p className="font-bold">{copy.roomLine(step.roomName, step.roomTitle)}</p>
                      ) : null}
                      {step.doors.map((d) => (
                        <DoorCodeCard key={d.door} door={d} />
                      ))}
                    </>
                  ) : (
                    <>
                      <h1>
                        {step.held
                          ? copy.heldTitle(step.firstName)
                          : stayedBefore
                            ? copy.doneTitleAgain(step.firstName)
                            : copy.doneTitle(step.firstName)}
                      </h1>
                      <p>
                        {step.held
                          ? copy.heldLine
                          : step.roomName
                            ? copy.roomLine(step.roomName, step.roomTitle)
                            : copy.noRoom}
                      </p>
                    </>
                  )}
                </div>
                {typeof window !== "undefined" ? (
                  <CardQr
                    url={
                      step.shortCode
                        ? `${window.location.origin}/g/${step.shortCode}`
                        : `${window.location.origin}/stay/${step.stayToken}`
                    }
                    label={copy.jumboWords.guide}
                  />
                ) : null}
                {plan && !listFlow ? (
                  <JumboSlot on to="jumbo-back">
                    <Button
                      size="touch"
                      variant="outline"
                      disabled={busy}
                      data-voice="add"
                      onClick={() => void onAddGuest()}
                    >
                      {copy.doneAddGuest}
                    </Button>
                  </JumboSlot>
                ) : null}
                {onDone ? (
                  <JumboSlot on to="jumbo-status">
                    <Button size="touch" data-voice="done" onClick={onDone}>
                      {copy.doneFinished}
                    </Button>
                  </JumboSlot>
                ) : null}
              </section>
            ) : null}

            {step.name === "done" && !jumbo ? (
              <section
                data-kx={cameraSide ? undefined : "center"}
                className={cn(
                  "py-4 text-center",
                  cameraSide && "grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center gap-10",
                )}
              >
                <div>
                  <CheckCircle2 className="mx-auto size-14 text-success" />
                  <h1 className="mt-4 text-3xl sm:text-5xl">
                    {step.held
                      ? copy.heldTitle(step.firstName)
                      : stayedBefore
                        ? copy.doneTitleAgain(step.firstName)
                        : copy.doneTitle(step.firstName)}
                  </h1>
                  <p className="mt-4 text-2xl">
                    {step.held
                      ? copy.heldLine
                      : step.roomName
                        ? copy.roomLine(step.roomName, step.roomTitle)
                        : copy.noRoom}
                  </p>
                  {step.doors?.map((d) => (
                    <DoorCodeCard key={d.door} door={d} className="mx-auto mt-6 max-w-md" />
                  ))}
                  {/* A shared tablet never opens the guide: the guest takes the link away instead. */}
                  {!kiosk ? (
                    <Button asChild size="touch-xl" className="mt-10 w-full max-w-md text-xl">
                      <Link to="/stay/$token" params={{ token: step.stayToken }}>
                        <BookOpen className="size-6" /> {copy.stayGuideCta}
                      </Link>
                    </Button>
                  ) : null}
                  <div className={cn("flex flex-col items-center gap-3", kiosk ? "mt-10" : "mt-4")}>
                    {plan && !listFlow ? (
                      <Button
                        size="touch"
                        variant="outline"
                        className="w-full max-w-md"
                        disabled={busy}
                        data-voice="add"
                        onClick={() => void onAddGuest()}
                      >
                        {copy.doneAddGuest}
                      </Button>
                    ) : null}
                    {kiosk && onDone ? (
                      <Button
                        size="touch-xl"
                        className="w-full max-w-md text-xl"
                        data-voice="done"
                        onClick={onDone}
                      >
                        {copy.doneFinished}
                      </Button>
                    ) : null}
                  </div>
                </div>
                {typeof window !== "undefined" ? (
                  <GuideLink
                    url={
                      step.shortCode
                        ? `${window.location.origin}/g/${step.shortCode}`
                        : `${window.location.origin}/stay/${step.stayToken}`
                    }
                    shortText={
                      step.shortCode ? `${window.location.host}/g/${step.shortCode}` : null
                    }
                    kiosk={kiosk}
                    beside={cameraSide}
                  />
                ) : null}
              </section>
            ) : null}

            {message && cameraOn ? (
              <p
                role="alert"
                data-camera-note
                // rgba, not a Tailwind /opacity colour: older tablet browsers draw those solid.
                style={{ background: "rgba(0, 0, 0, 0.6)", color: "#ffffff" }}
                className="pointer-events-none fixed left-1/2 top-1/2 z-[95] w-[min(90vw,40rem)] -translate-x-1/2 -translate-y-1/2 rounded-3xl px-8 py-6 text-center text-2xl font-semibold"
              >
                {message}
              </p>
            ) : message ? (
              <p
                role="alert"
                className="mt-6 rounded-xl bg-accent/10 p-4 text-center text-lg text-foreground"
              >
                {message}
              </p>
            ) : null}

            {canHandOver ? (
              <JumboSlot on={jumbo} to="jumbo-status">
                <div className="mt-8 border-t border-border pt-4 text-center">
                  <Button
                    variant="ghost"
                    size="lg"
                    className="text-muted-foreground"
                    disabled={busy}
                    onClick={() => void handOver()}
                  >
                    <HandHeart className="size-5" />{" "}
                    {jumbo ? copy.jumboWords.askHost : copy.handoverCta}
                  </Button>
                </div>
              </JumboSlot>
            ) : null}
          </main>

          {/* Front-door tablet: the phone square sits beside the welcome, then in the corner. */}
          {kioskWide && step.name !== "done" && !(jumbo && step.name === "welcome") ? (
            <KioskQr
              url={othersNow ? joinUrl! : (handoffUrl ?? phoneUrl)}
              large={step.name === "welcome" && qrPanel}
              carryOn={!othersNow && !!handoffUrl}
              others={othersNow}
              onTakeBack={away ? () => void takeBack() : undefined}
            />
          ) : null}
          {/* On a phone, only while others are filled in: they can use their own phones instead of this one. */}
          {othersNow && !kiosk ? (
            <CheckInQr
              url={joinUrl!}
              heading={copy.othersHeading}
              blurb={copy.othersBlurb}
              compact={onPhone}
            />
          ) : null}
        </div>
      </div>
    </TestSamplesContext.Provider>
  );
}

/**
 * Covers the step while the other device has the check-in: the guest can
 * finish there, or carry on here, which picks up exactly where they got to.
 */
function HandoffAway({
  kiosk,
  busy,
  onTakeBack,
}: {
  kiosk: boolean;
  busy: boolean;
  onTakeBack: () => void;
}) {
  return (
    <div
      data-handoff-away
      className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-6 rounded-[inherit] p-6 text-center"
      style={{ background: "inherit" }}
    >
      {kiosk ? (
        <Smartphone className="size-16 text-primary" aria-hidden />
      ) : (
        <Tablet className="size-16 text-primary" aria-hidden />
      )}
      <h1 className="text-2xl sm:text-4xl">{kiosk ? copy.handoffOnPhone : copy.handoffOnKiosk}</h1>
      <p className="text-lg text-muted-foreground">
        {kiosk ? copy.handoffOnPhoneBody : copy.handoffOnKioskBody}
      </p>
      <Button size="touch-xl" disabled={busy} onClick={onTakeBack}>
        {busy ? <Loader2 className="size-6 animate-spin" /> : null}
        {kiosk ? copy.handoffTakeBack : copy.handoffTakePhone}
      </Button>
    </div>
  );
}

function HostCall({ phone }: { phone?: string | null | undefined }) {
  if (!phone) return null;
  return (
    <Button asChild size="touch" variant="outline" className="w-full max-w-md">
      <a href={`tel:${phone.replace(/\s+/g, "")}`}>
        <Phone className="size-5" /> {copy.callHost}
      </a>
    </Button>
  );
}

function Last4Step({
  kinds,
  busy,
  onSubmit,
  onOther,
}: {
  kinds: Last4Kind[];
  busy: boolean;
  onSubmit: (kind: Last4Kind, value: string) => Promise<void>;
  onOther: () => void;
}) {
  const [kind, setKind] = useState<Last4Kind>(kinds[0] ?? "reference");
  const [value, setValue] = useState("");
  const isEmail = kind === "email";
  const choose = kinds.length > 1;
  // The number pad is there from the start whenever the phone digits are a choice, so
  // picking another way never squeezes or stretches the screen: both entries share one space.
  const withPad = kinds.includes("phone");
  const padOn = kind === "phone";
  return (
    <section data-kx="col" className={cn("mx-auto", choose ? "max-w-4xl" : "max-w-xl")}>
      <h1 className="text-2xl sm:text-4xl">{copy.last4Title}</h1>
      <div data-kx="grow" className={cn("grid gap-6", choose && "sm:grid-cols-2 sm:items-start")}>
        {choose ? (
          <div className="mt-6 grid gap-2">
            {kinds.map((k) => (
              <Button
                key={k}
                variant={k === kind ? "default" : "outline"}
                size="touch"
                className="h-auto min-h-16 whitespace-normal py-3"
                onClick={() => {
                  setKind(k);
                  setValue("");
                }}
              >
                {copy.last4Kinds[k]}
              </Button>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-lg">{copy.last4Kinds[kind]}</p>
        )}
        {/* One cell: the pad and the typed box sit on top of each other; the one not in use is hidden but keeps its space. */}
        <div data-kx="grow" className="grid [&>*]:[grid-area:1/1]">
          {withPad ? (
            <div data-kx="col" className={cn("mt-6", !padOn && "invisible")} aria-hidden={!padOn}>
              <PinPad
                value={padOn ? value : ""}
                onChange={setValue}
                length={4}
                busy={busy || !padOn}
                onComplete={(v) => void onSubmit("phone", v)}
              />
              {busy && padOn ? (
                <Loader2 className="mx-auto mt-4 size-6 animate-spin text-muted-foreground" />
              ) : null}
            </div>
          ) : null}
          {!padOn ? (
            <form
              className="mt-6 space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                void onSubmit(kind, value);
              }}
            >
              <Input
                aria-label={copy.last4Kinds[kind]}
                className="h-16 text-center text-2xl tracking-widest"
                value={value}
                inputMode={isEmail ? "email" : "text"}
                autoComplete="off"
                maxLength={isEmail ? 254 : 4}
                onChange={(e) => setValue(e.target.value)}
              />
              <Button
                type="submit"
                size="touch-xl"
                className="w-full"
                disabled={busy || value.trim().length < 4}
              >
                {busy ? <Loader2 className="size-6 animate-spin" /> : null}
                {copy.last4Submit}
              </Button>
            </form>
          ) : null}
        </div>
      </div>
      <Button variant="ghost" size="lg" className="mt-3 w-full" onClick={onOther}>
        {copy.idUseOther}
      </Button>
    </section>
  );
}

/** "Is this your [icon] Airbnb booking?", with the icon sized to the line. */
function ConfirmOnSite({ site }: { site: GuestSite }) {
  return (
    <>
      {copy.confirmOnSite.before}{" "}
      <span className="inline-flex items-baseline gap-[0.3em] whitespace-nowrap font-medium text-foreground">
        <span className="self-center">
          <ChannelIcon channel={site.key} iconUrl={site.iconUrl} label={site.label} size="1.15em" />
        </span>
        {/* The standard "Booked directly" reads badly mid-sentence. */}
        {site.key === "direct" && site.label === copy.platforms["direct"]
          ? copy.confirmDirect
          : site.label}
      </span>{" "}
      {copy.confirmOnSite.after}
    </>
  );
}

function Counter({
  label,
  hint,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-border p-4">
      <div>
        <p className="text-xl font-medium">{label}</p>
        <p className="text-muted-foreground">{hint}</p>
      </div>
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="icon"
          className="size-14 rounded-full"
          aria-label={copy.partyLess(label)}
          disabled={value <= min}
          onClick={() => onChange(value - 1)}
        >
          <Minus className="size-6" />
        </Button>
        <span className="w-10 text-center text-3xl tabular-nums" aria-live="polite">
          {value}
        </span>
        <Button
          variant="outline"
          size="icon"
          className="size-14 rounded-full"
          aria-label={copy.partyMore(label)}
          disabled={value >= max}
          onClick={() => onChange(value + 1)}
        >
          <Plus className="size-6" />
        </Button>
      </div>
    </div>
  );
}

/** How many adults and children, and each child's age. Never blocks the guest. */
function PartyStep({
  plan,
  initialAdults,
  busy,
  onSubmit,
}: {
  plan: PartyPlan;
  initialAdults: number;
  busy: boolean;
  onSubmit: (adults: number, childAges: number[]) => void;
}) {
  const [adults, setAdults] = useState(initialAdults);
  const [ages, setAges] = useState<Array<number | null>>([]);
  const total = adults + ages.length;
  const missingAge = ages.some((a) => a === null);
  const notes = [
    plan.booked !== null && plan.booked !== total ? copy.partyDiffers(plan.booked, total) : null,
    plan.capacity !== null && total > plan.capacity ? copy.partyOver(plan.capacity) : null,
  ].filter((n): n is string => !!n);

  return (
    <section className="mx-auto max-w-xl">
      <h1 className="text-2xl sm:text-4xl">{copy.partyTitle}</h1>
      <p className="mt-2 text-muted-foreground">
        {copy.partyBody}
        {plan.booked !== null ? ` ${copy.partyBooked(plan.booked)}` : ""}
      </p>
      <div className="mt-6 space-y-3">
        <Counter
          label={copy.partyAdults}
          hint={copy.partyAdultsHint}
          value={adults}
          min={1}
          max={30}
          onChange={setAdults}
        />
        {plan.childrenAllowed ? (
          <Counter
            label={copy.partyChildren}
            hint={copy.partyChildrenHint}
            value={ages.length}
            min={0}
            max={29}
            onChange={(n) => setAges((a) => (n > a.length ? [...a, null] : a.slice(0, n)))}
          />
        ) : (
          <p className="rounded-2xl bg-secondary p-4 text-secondary-foreground">
            {copy.partyAdultsOnly}
          </p>
        )}
      </div>

      {ages.length > 0 ? (
        <div className="mt-6">
          <p className="text-muted-foreground">
            {plan.register ? copy.partyChildAgeHintRegister : copy.partyChildAgeHint}
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {ages.map((age, i) => (
              <div key={i} className="space-y-1">
                <label className="text-sm text-muted-foreground" htmlFor={`child-age-${i}`}>
                  {copy.partyChildAge(i + 1)}
                </label>
                <Select
                  value={age === null ? "" : String(age)}
                  onValueChange={(v) => setAges((a) => a.map((x, j) => (j === i ? Number(v) : x)))}
                >
                  <SelectTrigger id={`child-age-${i}`} className="h-14 text-xl">
                    <SelectValue placeholder={copy.partyAgePick} />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 18 }, (_, n) => (
                      <SelectItem key={n} value={String(n)} className="text-lg">
                        {n}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {notes.length ? (
        <div className="mt-6 space-y-2">
          {notes.map((n) => (
            <p key={n} className="rounded-2xl bg-secondary p-4 text-secondary-foreground">
              {n}
            </p>
          ))}
        </div>
      ) : null}

      <Button
        size="touch-xl"
        className="mt-8 w-full"
        data-voice="yes"
        disabled={busy || missingAge}
        onClick={() =>
          onSubmit(
            adults,
            ages.filter((a): a is number => a !== null),
          )
        }
      >
        {busy ? <Loader2 className="size-6 animate-spin" /> : null}
        {missingAge ? copy.partyAgesMissing : copy.partyContinue}
      </Button>
    </section>
  );
}

type RegisterForm = {
  fullName: string;
  nationality: string;
  documentNumber: string | null;
  placeOfIssue: string | null;
  nextDestination: string | null;
  nextAddress: string | null;
};

/**
 * The UK guest register entry for one person: name and nationality, and for
 * guests who aren't British, Irish or Commonwealth citizens, their passport
 * or ID details and where they're going next. Prefilled from their ID.
 */
function RegisterStep({
  title,
  lead,
  prefill,
  busy,
  onSubmit,
  only,
  kiosk = false,
  jumbo = false,
}: {
  title: string;
  lead: string;
  prefill: Prefill | null;
  /** Read from their ID already: only these are shown. */
  only?: RegisterAsk[] | undefined;
  busy: boolean;
  onSubmit: (entry: RegisterForm) => void;
  /** A door tablet: nationality by letter keys instead of a long list. */
  kiosk?: boolean;
  /** Jumbo: one question per page, so nothing needs scrolling. */
  jumbo?: boolean;
}) {
  const [fullName, setFullName] = useState(prefill?.fullName ?? "");
  const [nationality, setNationality] = useState(prefill?.nationality ?? "");
  const [documentNumber, setDocumentNumber] = useState(prefill?.documentNumber ?? "");
  const [placeOfIssue, setPlaceOfIssue] = useState(prefill?.placeOfIssue ?? "");
  const [nextDestination, setNextDestination] = useState("");
  const [nextAddress, setNextAddress] = useState("");
  const [where, setWhere] = useState<"home" | "elsewhere" | null>(null);
  const options = nationalityOptions();
  const alien = !!nationality && isAlien(nationality);
  const entry: RegisterForm = {
    fullName,
    nationality,
    documentNumber: alien ? documentNumber : null,
    placeOfIssue: alien ? placeOfIssue : null,
    nextDestination: alien ? nextDestination : null,
    nextAddress: alien ? nextAddress : null,
  };
  const checked = cleanRegisterEntry(entry);
  const ready = checked.ok;
  // Read from their ID already: only what's missing shows. An alien's passport details read from
  // their ID are never asked again, even when the nationality itself had to be asked.
  const show = (k: RegisterAsk | "name") => !only || (k !== "name" && only.includes(k));
  const showAlien = (k: RegisterAsk) => alien && show(k);
  const usual = ["GB", "IE", prefill?.nationality ?? ""].filter(Boolean);
  const nationalityField = kiosk ? (
    <CountryPicker
      options={options}
      usual={usual}
      value={nationality}
      onChange={setNationality}
      jumbo={jumbo}
    />
  ) : (
    <Select value={nationality} onValueChange={setNationality}>
      <SelectTrigger id="reg-nationality" className="h-14 text-xl">
        <SelectValue placeholder={copy.registerPick} />
      </SelectTrigger>
      <SelectContent className="max-h-80">
        {options.map((o) => (
          <SelectItem key={o.code} value={o.code} className="py-3 text-xl">
            <span aria-hidden className="mr-2">
              {flagEmoji(o.code)}
            </span>
            {o.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
  // Next destination in one tap: home (the address on their licence or ID card when it shows one),
  // or somewhere else, which is the only time anything is typed.
  const homeTown = prefill?.homeTown ?? null;
  const homeAddress = prefill?.homeAddress ?? null;
  const goHome = () => {
    setWhere("home");
    setNextDestination(homeTown ?? homeDestination(nationality));
    setNextAddress(homeAddress ?? "");
  };
  const goElsewhere = () => {
    setWhere("elsewhere");
    setNextDestination("");
    setNextAddress("");
    window.setTimeout(() => document.getElementById("reg-next")?.focus(), 0);
  };
  const destinationChoice = (
    <div data-kx="grid" className="grid gap-2 sm:grid-cols-2">
      <Button
        type="button"
        size="touch"
        className="h-auto min-h-14 flex-col gap-0.5 whitespace-normal py-2"
        variant={where === "home" ? "default" : "outline"}
        data-voice="home"
        onClick={goHome}
      >
        <span>{copy.registerGoingHome}</span>
        {homeTown || homeAddress ? (
          <span className="text-sm font-normal opacity-80">{homeTown ?? homeAddress}</span>
        ) : null}
      </Button>
      <Button
        type="button"
        size="touch"
        variant={where === "elsewhere" ? "default" : "outline"}
        data-voice="elsewhere"
        onClick={goElsewhere}
      >
        {copy.registerGoingElsewhere}
      </Button>
    </div>
  );
  const elsewhereField = (cls?: string) =>
    where === "elsewhere" ? (
      <Input
        id="reg-next"
        className={cls}
        placeholder={copy.registerNextHint}
        value={nextDestination}
        onChange={(e) => setNextDestination(e.target.value)}
      />
    ) : null;

  if (jumbo) {
    const pages = registerPages(
      (k) => (k === "name" || k === "nationality" ? show(k) : showAlien(k)),
      alien,
      where !== "elsewhere",
    );
    return (
      <RegisterPager
        title={title}
        pages={pages}
        missing={checked.ok ? [] : checked.missing}
        busy={busy}
        onSave={() => onSubmit(entry)}
        render={(page) =>
          page === "name" ? (
            <JumboField id="reg-name" label={copy.registerName}>
              <Input
                id="reg-name"
                autoComplete="name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
            </JumboField>
          ) : page === "nationality" ? (
            <JumboField id="reg-nationality" label={copy.registerNationality}>
              {nationalityField}
            </JumboField>
          ) : page === "document" ? (
            <JumboField id="reg-doc" label={copy.registerDocNumber}>
              <Input
                id="reg-doc"
                className="uppercase"
                autoComplete="off"
                value={documentNumber}
                onChange={(e) => setDocumentNumber(e.target.value)}
              />
            </JumboField>
          ) : page === "place" ? (
            <JumboField id="reg-place" label={copy.registerPlace}>
              <Input
                id="reg-place"
                value={placeOfIssue}
                onChange={(e) => setPlaceOfIssue(e.target.value)}
              />
            </JumboField>
          ) : page === "destination" ? (
            <JumboField id="reg-next" label={copy.registerNext}>
              {destinationChoice}
              {elsewhereField()}
            </JumboField>
          ) : (
            <JumboField id="reg-address" label={copy.registerAddress}>
              <Input
                id="reg-address"
                value={nextAddress}
                onChange={(e) => setNextAddress(e.target.value)}
              />
            </JumboField>
          )
        }
      />
    );
  }

  return (
    <section className="mx-auto max-w-xl">
      <h1 className="text-2xl sm:text-4xl">{title}</h1>
      <p className="mt-2 text-lg text-muted-foreground">{lead}</p>
      <WhyAsk>{copy.registerWhy}</WhyAsk>
      {prefill?.fullName && !only ? (
        <p className="mt-3 text-sm text-muted-foreground">
          {prefill.fromLastStay ? copy.registerFromLastStay : copy.registerFromId}
        </p>
      ) : null}
      <form
        className="mt-6 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(entry);
        }}
      >
        <div className={cn("space-y-1", !show("name") && "hidden")}>
          <label htmlFor="reg-name" className="text-lg">
            {copy.registerName}
          </label>
          <Input
            id="reg-name"
            className="h-14 text-xl"
            autoComplete="name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
          <p className="text-sm text-muted-foreground">{copy.registerNameHint}</p>
        </div>
        <div className={cn("space-y-1", !show("nationality") && "hidden")}>
          <label htmlFor="reg-nationality" className="text-lg">
            {copy.registerNationality}
          </label>
          {nationalityField}
          {only?.includes("nationality") && prefill?.nationality ? (
            <p className="text-base text-muted-foreground">{copy.registerNationalityGuess}</p>
          ) : null}
        </div>

        {alien ? (
          <>
            <div>
              <p className="text-lg">{copy.registerAlienLead}</p>
              <WhyAsk>{copy.registerAlienWhy}</WhyAsk>
            </div>
            <div className={cn("space-y-1", !showAlien("document") && "hidden")}>
              <label htmlFor="reg-doc" className="text-lg">
                {copy.registerDocNumber}
              </label>
              <Input
                id="reg-doc"
                className="h-14 text-xl uppercase"
                autoComplete="off"
                value={documentNumber}
                onChange={(e) => setDocumentNumber(e.target.value)}
              />
            </div>
            <div className={cn("space-y-1", !showAlien("place") && "hidden")}>
              <label htmlFor="reg-place" className="text-lg">
                {copy.registerPlace}
              </label>
              <Input
                id="reg-place"
                className="h-14 text-xl"
                value={placeOfIssue}
                onChange={(e) => setPlaceOfIssue(e.target.value)}
              />
              <p className="text-sm text-muted-foreground">{copy.registerPlaceHint}</p>
            </div>
            <div className={cn("space-y-1", !showAlien("destination") && "hidden")}>
              <label htmlFor="reg-next" className="text-lg">
                {copy.registerNext}
              </label>
              {destinationChoice}
              {elsewhereField("h-14 text-xl")}
            </div>
            <div
              className={cn(
                "space-y-1",
                (!showAlien("destination") || where !== "elsewhere") && "hidden",
              )}
            >
              <label htmlFor="reg-address" className="text-lg">
                {copy.registerAddress}
              </label>
              <Input
                id="reg-address"
                className="h-14 text-xl"
                value={nextAddress}
                onChange={(e) => setNextAddress(e.target.value)}
              />
            </div>
          </>
        ) : null}

        <Button
          type="submit"
          size="touch-xl"
          className="w-full"
          data-voice="yes"
          disabled={busy || !ready}
        >
          {busy ? <Loader2 className="size-6 animate-spin" /> : null}
          {copy.registerSave}
        </Button>
      </form>
    </section>
  );
}

/** One register question on a Jumbo card: a big label and its answer. */
function JumboField({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div data-jumbo-field className="flex min-h-0 flex-col gap-[2.5cqmin]">
      <label htmlFor={id} className="font-display font-bold">
        {label}
      </label>
      {children}
    </div>
  );
}

/**
 * Jumbo door tablets: the register one question at a time, with Back and
 * Next and a dot per question, so the card never needs scrolling and the
 * button to carry on is always on screen.
 */
function RegisterPager({
  title,
  pages,
  missing,
  busy,
  onSave,
  render,
}: {
  title: string;
  pages: RegisterPage[];
  missing: readonly RegisterMissing[];
  busy: boolean;
  onSave: () => void;
  render: (page: RegisterPage) => React.ReactNode;
}) {
  const [at, setAt] = useState(0);
  const i = Math.min(at, Math.max(pages.length - 1, 0));
  const page = pages[i];
  const last = i >= pages.length - 1;
  const ok = page ? pageReady(page, missing) : missing.length === 0;
  const forward = () => (last ? onSave() : setAt(i + 1));
  return (
    <section
      data-register-pager
      data-register-page={page ?? ""}
      className="flex h-full min-h-0 flex-col gap-[3cqmin]"
    >
      <h1>{title}</h1>
      <form
        className="flex min-h-0 flex-1 flex-col gap-[3cqmin]"
        onSubmit={(e) => {
          e.preventDefault();
          if (ok && !busy) forward();
        }}
      >
        <div className="min-h-0 flex-1">{page ? render(page) : null}</div>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-[3cqmin]">
          <div>
            {i > 0 ? (
              <Button type="button" variant="outline" onClick={() => setAt(i - 1)}>
                <ArrowLeft className="size-[1em]" /> {copy.registerBack}
              </Button>
            ) : null}
          </div>
          {pages.length > 1 ? (
            <div
              className="flex items-center gap-[1.6cqmin]"
              role="img"
              aria-label={copy.registerPage(i + 1, pages.length)}
            >
              {pages.map((p, n) => (
                <span
                  key={p}
                  data-dot={n === i ? "on" : n < i ? "done" : "next"}
                  className="block size-[2.2cqmin] rounded-full border-[0.35cqmin] border-current"
                />
              ))}
            </div>
          ) : (
            <span />
          )}
          <div className="flex justify-end">
            <Button type="submit" data-voice="yes" disabled={busy || !ok}>
              {busy ? <Loader2 className="size-[1em] animate-spin" /> : null}
              {last ? copy.registerSave : copy.registerNext2}
              {last ? null : <ArrowRight className="size-[1em]" />}
            </Button>
          </div>
        </div>
      </form>
    </section>
  );
}

/**
 * A small "Why do we ask?" that opens the reason in plain words, so each
 * step leads with the question and the legal detail is there for anyone
 * who wants it.
 */
function WhyAsk({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2" data-wordy>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-full text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <CircleHelp className="size-4" /> {copy.whyAsk}
      </button>
      {open ? (
        <div className="mt-1 rounded-2xl bg-secondary p-4 text-secondary-foreground animate-in fade-in slide-in-from-top-1">
          <p>{children}</p>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="mt-2 min-h-11 text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            {copy.whyAskClose}
          </button>
        </div>
      ) : null}
    </div>
  );
}

type JoinStage =
  | { name: "intro" }
  | { name: "full" }
  | { name: "id"; ready: boolean }
  | { name: "person" }
  | { name: "register" }
  | { name: "face" }
  | { name: "done" };

/**
 * A guest's own phone, from the square on the lead guest's screen: picks
 * "me, an adult" or "a child with me", gets the next guest of that kind
 * still to fill in, and fills in just that one (ID, name and age, register
 * entry and face photo, as the host asks). Others can do the same at the
 * same moment on their own phones.
 */
export function JoinCheckIn({ share }: { share: string }) {
  const info = useServerFn(joinInfo);
  const claim = useServerFn(joinCheckIn);
  const companionId = useServerFn(checkCompanionId);
  const skipCompanion = useServerFn(skipCompanionId);
  const register = useServerFn(saveRegister);
  const face = useServerFn(addFacePhoto);
  const person = useServerFn(joinPerson);
  const done = useServerFn(joinDone);
  const [about, setAbout] = useState<Awaited<ReturnType<typeof joinInfo>> | null>(null);
  const [me, setMe] = useState<Extract<
    Awaited<ReturnType<typeof joinCheckIn>>,
    { status: "joined" }
  > | null>(null);
  const [stage, setStage] = useState<JoinStage>({ name: "intro" });
  const [queue, setQueue] = useState<JoinStage[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [prefill, setPrefill] = useState<Prefill | null>(null);
  const [only, setOnly] = useState<RegisterAsk[] | undefined>(undefined);
  const [name, setName] = useState("");
  const [age, setAge] = useState(8);

  const load = () =>
    void info({ data: { share } })
      .then(setAbout)
      .catch(() => setMessage(copy.error));
  useEffect(load, [share]);

  async function run<T>(fn: () => Promise<T>): Promise<T | null> {
    setBusy(true);
    setMessage(null);
    try {
      return await fn();
    } catch (err) {
      setMessage(err instanceof Error && err.message.length < 120 ? err.message : copy.error);
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function next(rest: JoinStage[], token: string) {
    const [n, ...more] = rest;
    setQueue(more);
    if (n) return setStage(n);
    await run(() => done({ data: { token } }));
    setStage({ name: "done" });
  }

  async function pick(kind: "adult" | "child") {
    const res = await run(() => claim({ data: { share, kind } }));
    if (!res) return;
    if (res.status === "full") return setStage({ name: "full" });
    setMe(res);
    setPrefill(null);
    setOnly(undefined);
    setName("");
    if (res.age !== null) setAge(res.age);
    const plan = res.plan;
    const steps: JoinStage[] =
      res.kind === "child"
        ? [{ name: "person" }]
        : [
            plan.everyAdult
              ? { name: "id", ready: false }
              : !plan.register
                ? { name: "person" }
                : null,
            plan.register ? { name: "register" } : null,
            plan.facePhoto ? { name: "face" } : null,
          ].filter((x): x is JoinStage => x !== null);
    await next(steps, res.token);
  }

  const t = me?.token ?? "";
  const pos = me?.position ?? 1;

  return (
    <div className="mx-auto w-full max-w-xl py-6">
      <main className="card-soft p-6 sm:p-10" aria-live="polite">
        {stage.name === "intro" ? (
          about ? (
            <section className="text-center">
              <h1 className="text-2xl leading-tight sm:text-4xl">
                {copy.joinTitle(about.leadFirstName, about.propertyName)}
              </h1>
              <p className="mt-3 text-lg text-muted-foreground">{copy.joinBody}</p>
              <div className="mt-8 grid gap-3">
                <Button
                  size="touch-xl"
                  disabled={busy || about.openAdults === 0}
                  onClick={() => void pick("adult")}
                >
                  {copy.joinAdult}
                </Button>
                {about.openAdults ? (
                  <p className="-mt-1 text-sm text-muted-foreground">
                    {copy.joinLeft(about.openAdults)}
                  </p>
                ) : null}
                <Button
                  size="touch"
                  variant="outline"
                  disabled={busy || about.openChildren === 0}
                  onClick={() => void pick("child")}
                >
                  {copy.joinChild}
                </Button>
                {about.openChildren ? (
                  <p className="-mt-1 text-sm text-muted-foreground">
                    {copy.joinLeft(about.openChildren)}
                  </p>
                ) : null}
              </div>
              {about.openAdults + about.openChildren === 0 ? (
                <p className="mt-6 text-muted-foreground">{copy.joinFull}</p>
              ) : null}
            </section>
          ) : (
            <Loader2 className="mx-auto size-8 animate-spin text-muted-foreground" />
          )
        ) : null}

        {stage.name === "full" ? <p className="text-center text-lg">{copy.joinFull}</p> : null}

        {stage.name === "id" && me ? (
          <section>
            <h1 className="text-2xl sm:text-4xl">{copy.companionTitle(me.number, me.number)}</h1>
            {!stage.ready ? (
              <>
                <p className="mt-4 text-lg">{copy.companionBody}</p>
                <WhyAsk>
                  {me.plan.keepIdPhoto
                    ? copy.idConsentPhoto(me.plan.keepDays)
                    : copy.idConsentDetails(me.plan.keepDays)}
                </WhyAsk>
                <div className="mt-8 grid gap-3">
                  <Button size="touch-xl" onClick={() => setStage({ name: "id", ready: true })}>
                    {copy.companionReady}
                  </Button>
                  <Button
                    size="touch"
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      void run(() => skipCompanion({ data: { token: t, position: pos } })).then(
                        (ok) => {
                          // No ID: at least their name, unless the register asks for it anyway.
                          if (ok)
                            void next(me.plan.register ? queue : [{ name: "person" }, ...queue], t);
                        },
                      )
                    }
                  >
                    {copy.joinNoId}
                  </Button>
                </div>
              </>
            ) : (
              <div className="mt-6">
                <IdCamera
                  busy={busy}
                  upload
                  onCapture={(full, small) =>
                    void run(() =>
                      companionId({
                        data: {
                          token: t,
                          position: pos,
                          image: full,
                          ...(me.plan.keepIdPhoto ? { small } : {}),
                        },
                      }),
                    ).then(async (res) => {
                      if (!res) return;
                      if (res.status === "retry")
                        return setMessage(
                          res.reason === "not_photo_id" ? copy.idNotPhotoId : copy.idRetryPlain,
                        );
                      if (res.status === "skip") {
                        await run(() => skipCompanion({ data: { token: t, position: pos } }));
                        return void next(
                          me.plan.register ? queue : [{ name: "person" }, ...queue],
                          t,
                        );
                      }
                      setPrefill(res.prefill);
                      // The register from their ID: nothing left to ask, or only what's missing.
                      const r = res.register as RegisterOutcome | undefined;
                      if (r?.kind === "ask") setOnly(r.missing);
                      await next(
                        r?.kind === "saved" || r?.kind === "later"
                          ? queue.filter((x) => x.name !== "register")
                          : queue,
                        t,
                      );
                    })
                  }
                  onFail={() => setStage({ name: "id", ready: false })}
                />
              </div>
            )}
          </section>
        ) : null}

        {stage.name === "person" && me ? (
          <form
            className="space-y-5"
            onSubmit={(e) => {
              e.preventDefault();
              void run(() =>
                person({
                  data: {
                    token: t,
                    fullName: name.trim(),
                    ...(me.kind === "child" ? { age } : {}),
                  },
                }),
              ).then((ok) => {
                if (!ok) return;
                // A 16 or 17 year old is in the register too.
                const more: JoinStage[] =
                  me.kind === "child" && me.plan.register && age >= REGISTER_AGE
                    ? [{ name: "register" }, ...queue]
                    : queue;
                if (me.kind === "child")
                  setPrefill({
                    fullName: name.trim(),
                    nationality: null,
                    documentNumber: null,
                    placeOfIssue: null,
                  });
                void next(more, t);
              });
            }}
          >
            <h1 className="text-2xl sm:text-4xl">
              {me.kind === "child" ? copy.joinChildTitle : copy.joinNameTitle(me.number)}
            </h1>
            <div className="space-y-2">
              <label htmlFor="join-name" className="text-base font-medium">
                {me.kind === "child" ? copy.joinChildName : copy.joinName}
              </label>
              <Input
                id="join-name"
                className="h-14 text-lg"
                autoComplete={me.kind === "child" ? "off" : "name"}
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            {me.kind === "child" ? (
              <Counter
                label={copy.joinChildAge}
                hint=""
                value={age}
                min={0}
                max={17}
                onChange={setAge}
              />
            ) : null}
            <Button
              type="submit"
              size="touch-xl"
              className="w-full"
              disabled={busy || !name.trim()}
            >
              {busy ? <Loader2 className="size-6 animate-spin" /> : null} {copy.joinNext}
            </Button>
          </form>
        ) : null}

        {stage.name === "register" && me ? (
          <RegisterStep
            title={
              only
                ? copy.registerAskTitle
                : me.kind === "child"
                  ? copy.registerTitleChild
                  : copy.registerTitleAdult(me.number)
            }
            lead={only ? copy.registerAskLead(prefill?.fullName ?? "") : copy.registerLeadOther}
            only={only}
            prefill={prefill}
            busy={busy}
            onSubmit={(entry) =>
              void run(() => register({ data: { token: t, position: pos, ...entry } })).then(
                (res) => {
                  if (!res) return;
                  if (!res.ok)
                    return setMessage(res.missing.map((m) => copy.registerMissing[m]).join(" "));
                  void next(queue, t);
                },
              )
            }
          />
        ) : null}

        {stage.name === "face" && me ? (
          <section>
            <h1 className="text-2xl sm:text-4xl">{copy.faceTitleOther(me.number)}</h1>
            <div className="mt-6">
              <IdCamera
                facing="user"
                kind="face"
                busy={busy}
                upload
                help={copy.faceBody}
                cta={copy.faceTake}
                busyLabel={copy.faceSaving}
                onCapture={(_full, small) =>
                  void run(() => face({ data: { token: t, position: pos, image: small } })).then(
                    (ok) => ok && void next(queue, t),
                  )
                }
                onFail={() => void next(queue, t)}
              />
              <Button
                variant="ghost"
                size="lg"
                className="mt-3 w-full"
                disabled={busy}
                onClick={() => void next(queue, t)}
              >
                {copy.faceSkip}
              </Button>
            </div>
          </section>
        ) : null}

        {stage.name === "done" ? (
          <section className="py-4 text-center">
            <CheckCircle2 className="mx-auto size-14 text-success" />
            <h1 className="mt-4 text-2xl sm:text-4xl">{copy.joinDoneTitle}</h1>
            <p className="mt-3 text-lg text-muted-foreground">{copy.joinDoneBody}</p>
            <Button
              size="touch"
              variant="outline"
              className="mt-8"
              onClick={() => {
                setMe(null);
                setStage({ name: "intro" });
                load();
              }}
            >
              {copy.joinAnother}
            </Button>
          </section>
        ) : null}

        {message ? (
          <p
            role="alert"
            className="mt-6 rounded-xl bg-accent/10 p-4 text-center text-lg text-foreground"
          >
            {message}
          </p>
        ) : null}
      </main>
    </div>
  );
}
