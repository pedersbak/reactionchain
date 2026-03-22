import { useState } from "react";

/**
 * Detects whether the user is on a touch/mobile device.
 * Evaluated once on mount — intentionally does NOT react to resize or
 * orientation changes so the layout never swaps mid-session.
 */
export function useIsMobile(): boolean {
  const [isMobile] = useState(
    () => "ontouchstart" in window || navigator.maxTouchPoints > 0
  );
  return isMobile;
}
