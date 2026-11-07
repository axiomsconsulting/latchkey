import { useEffect, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { HkIcon } from "@/components/host/HousekeepingTimeline";
import { SaveButton, changed } from "@/components/host/SaveButton";
import { Input } from "@/components/ui/input";
import { common, hkWordsAdminCopy as copy } from "@/content/copy";
import { useUi } from "@/hooks/use-site";
import { HK_STATES, HK_WORD_DEFAULTS, HK_WORD_MAX, type HkWords } from "@/lib/housekeeping";
import { forgetSite } from "@/lib/site-client";
import { saveHkWords } from "@/lib/site.functions";

/**
 * Latchkey admin → Defaults for hosts: the words every host sees for housekeeping's three states
 * (Bookings → Housekeeping and the room icons in the list). A blank box keeps the usual word.
 */
export function HkWordsAdmin() {
  const ui = useUi();
  const save = useServerFn(saveHkWords);
  const router = useRouter();
  const saved: HkWords = {
    dirty: ui.hkWords.dirty ?? "",
    ready: ui.hkWords.ready ?? "",
    unavailable: ui.hkWords.unavailable ?? "",
  };
  const [words, setWords] = useState<HkWords>(saved);
  const [busy, setBusy] = useState(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setWords(saved), [ui.hkWords]);

  async function submit() {
    setBusy(true);
    try {
      await save({ data: words });
      forgetSite();
      await router.invalidate();
      toast.success(copy.saved);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : common.errorBody);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card-soft space-y-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 text-sm text-muted-foreground">{copy.help}</p>
        <SaveButton
          dirty={changed(words, saved)}
          busy={busy}
          label={common.save}
          onClick={() => void submit()}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {HK_STATES.map((k) => (
          <label key={k} className="space-y-1.5">
            <span className="flex items-center gap-1.5 text-sm font-medium">
              <HkIcon state={k} /> {copy.label(HK_WORD_DEFAULTS[k])}
            </span>
            <Input
              className="h-11"
              maxLength={HK_WORD_MAX}
              placeholder={HK_WORD_DEFAULTS[k]}
              value={words[k]}
              onChange={(e) => setWords((w) => ({ ...w, [k]: e.target.value }))}
            />
          </label>
        ))}
      </div>
    </section>
  );
}
