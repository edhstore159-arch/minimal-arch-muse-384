import { useEffect, useState } from "react";
import { isLovableNativeDebugRuntime } from "./debugInstruction";

/**
 * DebugErrorThrower
 *
 * Escuta "lovable-debug-error" e só lança o erro quando o modo nativo foi
 * habilitado manualmente em um preview/editor da Lovable.
 *
 * Mantido isolado para impedir que o Debug Tool cause tela branca em uso normal.
 */
export const DebugErrorThrower = () => {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      if (!isLovableNativeDebugRuntime()) return;
      const detail = (e as CustomEvent<string>).detail;
      if (typeof detail === "string" && detail.length > 0) {
        setMessage(detail);
      }
    };
    window.addEventListener("lovable-debug-error", handler as EventListener);
    return () => window.removeEventListener("lovable-debug-error", handler as EventListener);
  }, []);

  if (message) {
    throw new Error(message);
  }

  return null;
};

export default DebugErrorThrower;
