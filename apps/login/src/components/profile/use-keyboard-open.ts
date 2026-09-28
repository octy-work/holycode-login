"use client";

import { useEffect, useState } from "react";

/**
 * When the visible area counts as covered by the on-screen keyboard: shorter
 * than the window by at least max(KEYBOARD_MIN_SHRINK px, KEYBOARD_SHRINK_RATIO
 * of the window) — the same numbers as the chat's switcher/mobile-nav.js, so
 * the bar hides at the same moment in every service.
 */
export const KEYBOARD_MIN_SHRINK = 150;
export const KEYBOARD_SHRINK_RATIO = 0.18;

const NON_TEXT_INPUTS = new Set([
  "button",
  "checkbox",
  "color",
  "file",
  "hidden",
  "image",
  "radio",
  "range",
  "reset",
  "submit",
]);

/** Does this element bring up the on-screen keyboard when focused? */
export function isTextEntry(element: Element | null): boolean {
  if (!element) return false;
  if (element instanceof HTMLTextAreaElement) return !element.readOnly && !element.disabled;
  if (element instanceof HTMLInputElement) {
    return !element.readOnly && !element.disabled && !NON_TEXT_INPUTS.has((element.type || "text").toLowerCase());
  }
  if (!(element instanceof HTMLElement)) return false;
  // isContentEditable also covers children of an editable block; the attribute is for engines without it
  return (
    element.isContentEditable === true ||
    ["", "true", "plaintext-only"].includes(element.getAttribute("contenteditable") ?? "-")
  );
}

/**
 * Is the keyboard open? `visible` — the visual viewport's height × scale (so
 * pinch-zoom does not count), `layout` — the window's height now, `baseline` —
 * the tallest window seen at this width. Shrunk against the window itself (iOS,
 * Android Chrome) — open; shrunk only against the baseline (Android with
 * `interactive-widget=resizes-content` shrinks the window too) — open only while
 * a text field has the focus.
 */
export function keyboardOpenFrom({
  visible,
  layout,
  baseline,
  editing,
}: {
  visible: number;
  layout: number;
  baseline: number;
  editing: boolean;
}): boolean {
  const reference = Math.max(layout, baseline);
  if (!(visible > 0) || !(reference > 0)) return false;
  const threshold = Math.max(KEYBOARD_MIN_SHRINK, reference * KEYBOARD_SHRINK_RATIO);
  if (reference - visible < threshold) return false;
  return layout - visible >= threshold || editing;
}

/**
 * True while the phone's on-screen keyboard is open (`visualViewport`); never
 * because of scrolling. Without `visualViewport` (old browsers, tests) it is
 * always false.
 */
export function useKeyboardOpen(): boolean {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.visualViewport) return undefined;
    const viewport = window.visualViewport;
    let width = window.innerWidth;
    let baseline = window.innerHeight;
    let timer = 0;

    const update = () => {
      timer = 0;
      if (window.innerWidth !== width) {
        // rotated: start over
        width = window.innerWidth;
        baseline = window.innerHeight;
      }
      baseline = Math.max(baseline, window.innerHeight);
      setOpen(
        keyboardOpenFrom({
          visible: viewport.height * (viewport.scale > 0 ? viewport.scale : 1),
          layout: window.innerHeight,
          baseline,
          editing: isTextEntry(document.activeElement),
        }),
      );
    };
    // focusout fires before the focus moves on: read the new active element a tick later
    const later = () => {
      if (!timer) timer = window.setTimeout(update, 0);
    };

    viewport.addEventListener("resize", update);
    window.addEventListener("focusin", later);
    window.addEventListener("focusout", later);
    update();
    return () => {
      viewport.removeEventListener("resize", update);
      window.removeEventListener("focusin", later);
      window.removeEventListener("focusout", later);
      if (timer) window.clearTimeout(timer);
    };
  }, []);

  return open;
}
