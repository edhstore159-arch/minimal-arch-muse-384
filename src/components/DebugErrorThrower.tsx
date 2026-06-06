import { useEffect, useState } from "react";

/**
 * DebugErrorThrower
 *
 * Escuta "lovable-debug-error" e lança o erro intencionalmente fora do render
 * do React para acionar o overlay global sem desmontar a tela do app.
 *
 * NÃO envolver em ErrorBoundary/Suspense. NÃO substituir por console/toast.
 * O throw é proposital e parte da feature.
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

  useEffect(() => {
    if (!message) return;
    const id = window.setTimeout(() => {
      setMessage(null);
      throw new Error(message);
    }, 0);
    return () => window.clearTimeout(id);
  }, [message]);

  return null;
};

export default DebugErrorThrower;
