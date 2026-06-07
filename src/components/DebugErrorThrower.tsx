import { useEffect } from "react";

/**
 * DebugErrorThrower
 *
 * Escuta "lovable-debug-error" e lança o erro intencionalmente para acionar
 * o overlay global da Lovable com botão "Try to Fix".
 *
 * NÃO envolver em ErrorBoundary/Suspense. NÃO substituir por console/toast.
 * O throw é proposital e parte da feature.
 */
export const DebugErrorThrower = () => {
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail;
      if (typeof detail === "string" && detail.length > 0) {
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
