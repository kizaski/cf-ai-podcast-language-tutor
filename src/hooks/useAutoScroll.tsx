import { useCallback, useEffect, useRef } from "react";

export function useAutoScroll<T extends HTMLElement>(deps: unknown[]) {
  const ref = useRef<T>(null);

  const scrollToBottom = useCallback(() => {
    ref.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(scrollToBottom, deps);

  return ref;
}
