import { describe, expect, it } from "vitest";

import { isPenEraserGesture } from "./penButton";

const pen = (extra) => ({ pointerType: "pen", button: 0, buttons: 1, ...extra });

describe("erasing with the button on the stylus", () => {
  it("recognises the eraser bit, which is what the spec defines", () => {
    expect(isPenEraserGesture(pen({ buttons: 32, button: 5 }))).toBe(true);
  });

  it("recognises the barrel bit, which is what Android usually reports", () => {
    // Chrome on Android commonly maps the S Pen side button to the same
    // signal a right click uses. Devices differ, so both are accepted.
    expect(isPenEraserGesture(pen({ buttons: 2, button: 2 }))).toBe(true);
  });

  it("recognises the button held mid-stroke, where button is -1", () => {
    // pointermove reports button as -1 because nothing changed, so `buttons`
    // is the only usable signal once the stroke is under way.
    expect(isPenEraserGesture(pen({ buttons: 34, button: -1 }))).toBe(true);
  });

  it("leaves an ordinary pen stroke alone", () => {
    expect(isPenEraserGesture(pen())).toBe(false);
    expect(isPenEraserGesture(pen({ buttons: 1, button: 0 }))).toBe(false);
  });

  it("never fires for a finger, which is the thing that must not break", () => {
    // A touch point can carry buttons: 1, and a stray bit here would turn
    // handwriting into erasing for anyone without a stylus.
    expect(isPenEraserGesture({ pointerType: "touch", buttons: 2, button: 2 })).toBe(false);
    expect(isPenEraserGesture({ pointerType: "mouse", buttons: 2, button: 2 })).toBe(false);
  });

  it("does not throw on a missing or malformed event", () => {
    expect(isPenEraserGesture(null)).toBe(false);
    expect(isPenEraserGesture(undefined)).toBe(false);
    expect(isPenEraserGesture({ pointerType: "pen" })).toBe(false);
  });
});
