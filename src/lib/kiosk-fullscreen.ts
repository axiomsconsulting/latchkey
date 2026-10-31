/** The door tablet's full screen: whether it should stay full screen, and going into it. Browser only. */
const FS_KEY = "latchkey.kioskFullscreen";
/** Whether this tablet should stay full screen (on unless the host switched it off with the corner button). */
export function fullscreenWanted(): boolean {
  try {
    return window.localStorage.getItem(FS_KEY) !== "off";
  } catch {
    return true;
  }
}
export function setFullscreenWanted(on: boolean) {
  try {
    window.localStorage.setItem(FS_KEY, on ? "on" : "off");
  } catch {
    // Not remembered: it goes back to full screen next time.
  }
}
/** Full screen, hiding Android's bottom bar where the browser allows it. */
export function enterFullscreen() {
  if (!document.fullscreenElement)
    void document.documentElement.requestFullscreen?.({ navigationUI: "hide" }).catch(() => {});
}
