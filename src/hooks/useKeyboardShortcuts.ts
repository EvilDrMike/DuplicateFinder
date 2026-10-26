import { useEffect, useLayoutEffect, useRef } from "react";

/** Calls the latest handler registered for a pressed key. */
export function useKeyboardShortcuts(handlers: Record<string, () => void>) {
  const handlersRef = useRef(handlers);
  useLayoutEffect(() => {
    handlersRef.current = handlers;
  });

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      handlersRef.current[event.key]?.();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);
}
