/**
 * Room photos on the booking page, grouped by space the way guests look
 * through a place: bedroom, bathroom, living area and so on. Each photo
 * belongs to a room, or to the property (shared spaces: kitchen, garden,
 * outside). Sorting by space can be done by hand or by AI (the ai_photos
 * plan feature, or a free trial on AI_PHOTO_TRIAL_ROOMS rooms). Pure; tested
 * in tests/room-photos.test.ts.
 */

export const SPACES = [
  "bedroom",
  "bathroom",
  "living",
  "kitchen",
  "dining",
  "workspace",
  "entrance",
  "outside",
  "garden",
  "view",
  "other",
] as const;
export type Space = (typeof SPACES)[number];

export const SPACE_LABELS: Record<Space, string> = {
  bedroom: "Bedroom",
  bathroom: "Bathroom",
  living: "Living area",
  kitchen: "Kitchen",
  dining: "Dining",
  workspace: "Workspace",
  entrance: "Entrance and hallway",
  outside: "Outside",
  garden: "Garden and terrace",
  view: "The view",
  other: "Other",
};

export const MAX_PHOTOS_PER_ROOM = 30;
/** Rooms a business without the AI feature can have sorted by AI, to try it. */
export const AI_PHOTO_TRIAL_ROOMS = 2;

export const normaliseSpace = (s: unknown): Space =>
  SPACES.includes(s as Space) ? (s as Space) : "other";

export type RoomPhoto = {
  id: string;
  roomId: string | null;
  space: Space;
  caption: string | null;
  url: string;
  position: number;
};

export type SpaceGroup = { space: Space; label: string; photos: RoomPhoto[] };

/** Photos in the spaces' order, each space's photos in the host's order. */
export function groupBySpace(photos: RoomPhoto[]): SpaceGroup[] {
  return SPACES.map((space) => ({
    space,
    label: SPACE_LABELS[space],
    photos: photos
      .filter((p) => p.space === space)
      .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id)),
  })).filter((g) => g.photos.length > 0);
}

/**
 * What a guest sees for one room: its own photos first, then the property's
 * shared spaces, grouped; the cover photo leads when there's no photo of the
 * room itself.
 */
export function roomGallery(
  roomId: string,
  photos: RoomPhoto[],
  cover: string | null,
): { groups: SpaceGroup[]; all: RoomPhoto[] } {
  const own = photos.filter((p) => p.roomId === roomId);
  const shared = photos.filter((p) => p.roomId === null);
  const groups = groupBySpace([
    ...own,
    ...shared.map((p) => ({ ...p, position: p.position + 1000 })),
  ]);
  const all = groups.flatMap((g) => g.photos);
  if (cover && !all.some((p) => p.url === cover)) {
    const lead: RoomPhoto = {
      id: `cover-${roomId}`,
      roomId,
      space: "bedroom",
      caption: null,
      url: cover,
      position: -1,
    };
    const bed = groups.find((g) => g.space === "bedroom");
    if (bed) bed.photos.unshift(lead);
    else groups.unshift({ space: "bedroom", label: SPACE_LABELS.bedroom, photos: [lead] });
    all.unshift(lead);
  }
  return { groups, all };
}

/**
 * Whether AI may sort this room's photos: always with the plan feature;
 * otherwise once each on up to AI_PHOTO_TRIAL_ROOMS rooms (the property's
 * shared spaces count as a room), so the trial's credits stay small.
 */
export function aiPhotoAccess(o: { hasFeature: boolean; triedRooms: string[]; roomKey: string }): {
  allowed: boolean;
  trial: boolean;
  trialLeft: number;
} {
  if (o.hasFeature) return { allowed: true, trial: false, trialLeft: 0 };
  const left = Math.max(0, AI_PHOTO_TRIAL_ROOMS - o.triedRooms.length);
  const again = o.triedRooms.includes(o.roomKey);
  return { allowed: !again && left > 0, trial: true, trialLeft: left };
}
