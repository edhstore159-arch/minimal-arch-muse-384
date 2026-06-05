import { useEffect, useState } from "react";
import { isLovableNativeDebugRuntime, shouldSuppressLovableDebugInstruction } from "./debugInstruction";

/**
 * DebugErrorThrower
 *
 * Escuta "lovable-debug-error" e só lança o erro no runtime de preview/editor
 * da Lovable, onde existe o overlay nativo "Try to Fix".
 *
 * NÃO envolver em ErrorBoundary/Suspense. NÃO substituir por console/toast.
 */
export const DebugErrorThrower = () => {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      if (!isLovableNativeDebugRuntime()) return;
      const detail = (e as CustomEvent<string>).detail;
      if (shouldSuppressLovableDebugInstruction(String(detail || ""))) return;
      if (typeof detail === "string" && detail.length > 0) {
        setMessage(detail);
      }
    };
    window.addEventListener("lovable-debug-error", handler as EventListener);
    return () => window.removeEventListener("lovable-debug-error", handler as EventListener);
  }, []);

  if (message) {
    if (shouldSuppressLovableDebugInstruction(message)) {
      return null;
    }

    throw new Error(message);
  }

  return null;
};

export default DebugErrorThrower;
