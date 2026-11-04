import { settings as copy } from "@/content/copy";

const ICON_PX = 64;

/** Shrinks any image to a small square PNG so it sits neatly on one line. */
export async function toIcon(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error(copy.channelsIconBad));
      el.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = ICON_PX;
    canvas.height = ICON_PX;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error(copy.channelsIconBad);
    // Some SVGs report no size of their own; draw those to fill the square.
    const iw = img.naturalWidth || ICON_PX;
    const ih = img.naturalHeight || ICON_PX;
    const scale = Math.min(ICON_PX / iw, ICON_PX / ih);
    const w = iw * scale;
    const h = ih * scale;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, (ICON_PX - w) / 2, (ICON_PX - h) / 2, w, h);
    return canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}
