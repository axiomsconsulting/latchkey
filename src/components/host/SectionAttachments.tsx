import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Paperclip, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { GuideAttachments, type Attachment } from "@/components/guest/GuideAttachments";
import { Button } from "@/components/ui/button";
import { common, guideAttachCopy as copy } from "@/content/copy";
import { MAX_ATTACHMENT_BYTES, MAX_PER_SECTION, kindFor } from "@/lib/attachments";
import { deleteGuideAttachment, uploadGuideAttachment } from "@/lib/attachments.functions";

const ACCEPT = "image/jpeg,image/png,image/webp,image/gif,application/pdf,.doc,.docx,.odt,.rtf,.txt,.xls,.xlsx,.ppt,.pptx";

/** Big photos are scaled to 2000px (they still look sharp on any phone) to save space. */
async function shrinkPhoto(file: File): Promise<Blob> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size < 1_500_000) return file;
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;
  const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b ?? file), "image/jpeg", 0.85));
}

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/**
 * A guide section's photos and documents, for the host: add, see as guests
 * will, remove. Kept in the host's own private folder, named after the
 * section; shared by every room.
 */
export function SectionAttachments({ propertyId, sectionKey, items, ready }: { propertyId: string; sectionKey: string; items: Attachment[]; ready: boolean }) {
  const qc = useQueryClient();
  const upload = useServerFn(uploadGuideAttachment);
  const remove = useServerFn(deleteGuideAttachment);
  const input = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ["guide-attachments", propertyId] }), qc.invalidateQueries({ queryKey: ["guide", propertyId] })]);

  async function add(files: FileList | null) {
    if (!files?.length) return;
    setBusy("add");
    try {
      for (const file of [...files].slice(0, MAX_PER_SECTION - items.length)) {
        const mime = file.type || (file.name.endsWith(".docx") ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" : "");
        if (!kindFor(mime)) {
          toast.error(copy.wrongType(file.name));
          continue;
        }
        const blob = await shrinkPhoto(file);
        if (blob.size > MAX_ATTACHMENT_BYTES) {
          toast.error(copy.tooBig(file.name));
          continue;
        }
        await upload({ data: { propertyId, sectionKey, name: file.name, mime: blob === file ? mime : "image/jpeg", data: await toBase64(blob) } });
      }
      await refresh();
      toast.success(copy.added);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : common.errorBody);
    } finally {
      setBusy(null);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="space-y-2 rounded-xl border border-dashed border-border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="flex flex-1 items-center gap-2 text-sm font-medium">
          <Paperclip className="size-4 text-primary" /> {copy.title}
        </p>
        {ready ? (
          <>
            <input ref={input} type="file" multiple accept={ACCEPT} className="hidden" onChange={(e) => void add(e.target.files)} />
            <Button size="sm" variant="outline" disabled={busy !== null || items.length >= MAX_PER_SECTION} onClick={() => input.current?.click()}>
              {busy === "add" ? <Loader2 className="size-4 animate-spin" /> : <Paperclip className="size-4" />} {copy.add}
            </Button>
          </>
        ) : null}
      </div>
      {!ready ? (
        <p className="text-xs text-muted-foreground">{copy.notReady}</p>
      ) : items.length ? (
        <>
          <GuideAttachments items={items} />
          <ul className="flex flex-wrap gap-1">
            {items.map((a) => (
              <li key={a.id}>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 text-xs text-muted-foreground hover:text-destructive"
                  disabled={busy !== null}
                  onClick={async () => {
                    setBusy(a.id);
                    try {
                      await remove({ data: { id: a.id } });
                      await refresh();
                      toast.success(copy.removed);
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : common.errorBody);
                    } finally {
                      setBusy(null);
                    }
                  }}
                >
                  {busy === a.id ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />} {copy.remove(a.name)}
                </Button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="text-xs text-muted-foreground">{copy.empty}</p>
      )}
    </div>
  );
}
