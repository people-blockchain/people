import { useLayoutEffect, useRef } from "react";

const MOBILE_MAX_WIDTH = 1023;
const MIN_FONT_PX = 5.5;

/** Shrink slogan font on narrow viewports until the full line fits its column. */
export function useHeaderSloganFit(copyKey: string) {
  const ref = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const fit = () => {
      if (window.innerWidth > MOBILE_MAX_WIDTH) {
        el.style.fontSize = "";
        return;
      }

      el.style.fontSize = "";
      const computed = parseFloat(getComputedStyle(el).fontSize);
      let size = Number.isFinite(computed) ? computed : 11;
      const floor = MIN_FONT_PX;

      while (el.scrollWidth > el.clientWidth + 1 && size > floor) {
        size -= 0.25;
        el.style.fontSize = `${size}px`;
      }
    };

    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [copyKey]);

  return ref;
}
