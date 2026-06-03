import { useEffect, useState } from "react";
import { isLovableNativeDebugRuntime } from "./debugInstruction";

/**
 * DebugErrorThrower
 *
 * Escuta "lovable-debug-error" sem derrubar a tela do aplicativo.
 * A instrução continua visível no console, mas não causa tela branca.
 */
export const DebugErrorThrower = () => {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      if (!isLovableNativeDebugRuntime()) return;
      const detail = (e as CustomEvent<string>).detail;
      if (typeof detail === "string" && detail.length > 0) {
        console.error(new Error(detail));
        setMessage(detail);
      }
    };
    window.addEventListener("lovable-debug-error", handler as EventListener);
    return () => window.removeEventListener("lovable-debug-error", handler as EventListener);
  }, []);

  useEffect(() => {
    if (!message) return;
    const timeout = window.setTimeout(() => setMessage(null), 0);
    return () => window.clearTimeout(timeout);
  }, [message]);

  return null;
};

export default DebugErrorThrower;
