import { useEffect, useState } from "react";

/**
 * DebugErrorThrower
 *
 * Escuta o evento "lovable-debug-error" e lança um Error fatal em render
 * para escapar para o overlay global da Lovable (Try to Fix).
 *
 * IMPORTANTE: este componente deve ficar FORA de qualquer ErrorBoundary.
 * O throw é intencional — não remover.
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
