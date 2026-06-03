import { useEffect, useState } from "react";

/**
 * DebugErrorThrower
 *
 * Escuta "lovable-debug-error" e lança o erro durante o render para que
 * ele escape ao overlay global da Lovable e habilite o "Try to Fix".
 *
 * NÃO envolver em ErrorBoundary/Suspense. NÃO substituir por console/toast.
 */
export const DebugErrorThrower = () => {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
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
