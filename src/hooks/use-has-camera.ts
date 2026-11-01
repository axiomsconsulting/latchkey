import { useEffect, useState } from "react";

/** Whether this screen has any camera at all (unknown counts as yes until it's checked). */
export function useHasCamera(): boolean {
  const [has, setHas] = useState(true);
  useEffect(() => {
    const md = typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;
    if (!md?.getUserMedia) return setHas(false);
    void md
      .enumerateDevices?.()
      .then((d) => setHas(d.some((x) => x.kind === "videoinput")))
      .catch(() => undefined);
  }, []);
  return has;
}
