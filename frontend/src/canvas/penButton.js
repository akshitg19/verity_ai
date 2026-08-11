// Erasing by holding the button on the stylus, the way Samsung Notes does.
//
// This is how people already erase on these devices, so a student who has
// used the tablet's own notes app will try it here before they look for a
// toolbar. It does not replace the eraser tool; it is a shortcut that works
// while the pen tool is selected, and the tool never changes underneath the
// student.
//
// Which bit a barrel button sets is genuinely inconsistent across devices,
// so this accepts both spellings rather than picking one and being wrong on
// half the hardware:
//
//   * `buttons` bit 5 (32) is the eraser signal in the Pointer Events spec,
//     and `button === 5` is the matching transition code. Wacom and several
//     Windows pens report this.
//   * `buttons` bit 1 (2) is the barrel button, `button === 2`. Chrome on
//     Android commonly reports the S Pen's side button this way, since it is
//     the same signal a right click uses.
//
// Accepting both costs nothing: neither is reachable from a finger or from a
// pen tip pressed on its own, which is the only thing we must not break.

export const ERASER_BUTTONS_MASK = 0b100010; // barrel (2) or eraser (32)

export function isPenEraserGesture(event) {
  if (!event || event.pointerType !== "pen") return false;
  // `buttons` is the reliable one mid-stroke, because it describes the state
  // rather than the transition, and pointermove reports `button` as -1.
  if (typeof event.buttons === "number" && (event.buttons & ERASER_BUTTONS_MASK) !== 0) {
    return true;
  }
  return event.button === 2 || event.button === 5;
}
