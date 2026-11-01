/**
 * A saved photo of an ID (a guest's own phone only): the same two sizes as
 * a camera still from IdCamera (1400px to read, 1024px to keep).
 */
export async function fromFile(file: File): Promise<{ full: string; small: string }> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = url;
    });
    const draw = (max: number, quality: number) => {
      const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
      const out = canvas.toDataURL("image/jpeg", quality);
      canvas.width = 0;
      return out;
    };
    return { full: draw(1400, 0.8), small: draw(1024, 0.62) };
  } finally {
    URL.revokeObjectURL(url);
  }
}
