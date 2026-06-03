import { useEffect, useRef } from "react";
import { isLovableNativeDebugRuntime } from "./debugInstruction";

/**
 * DebugErrorThrower
 *
 * Escuta "lovable-debug-error" e só lança o erro no runtime de preview/editor
 * da Lovable, onde existe o overlay nativo "Try to Fix".
 *
 * NÃO envolver em ErrorBoundary/Suspense. NÃO substituir por console/toast.
 */
export const DebugErrorThrower = () => {
  const lastMessageRef = useRef<string | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      if (!isLovableNativeDebugRuntime()) return;
      const detail = (e as CustomEvent<string>).detail;
      if (typeof detail === "string" && detail.length > 0) {
        if (lastMessageRef.current === detail) return;
        lastMessageRef.current = detail;

        window.setTimeout(() => {
          throw new Error(detail);
        }, 0);
      }
    };
    window.addEventListener("lovable-debug-error", handler as EventListener);
    return () => window.removeEventListener("lovable-debug-error", handler as EventListener);
  }, []);

  return null;
};

export default DebugErrorThrower;
