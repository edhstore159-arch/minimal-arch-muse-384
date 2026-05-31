import { useEffect, useState } from "react";

/**
 * DebugErrorThrower
 *
 * Escuta "lovable-debug-error" e lança Error durante o render para escapar
 * até o overlay global da Lovable (fluxo "Try to Fix"). Deve ficar FORA de
 * qualquer ErrorBoundary/Suspense.
 *
 * NÃO REMOVA O THROW — é intencional.
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
    const toThrow = message;
    if (toThrow.includes("INSTRUÇÃO DE DESENVOLVIMENTO")) {
      console.warn("Diagnóstico recebido sem derrubar a aplicação:", toThrow);
      setMessage(null);
      return null;
    }

    // Limpa o state para que o erro só dispare uma vez por instrução
    // e o app possa recuperar após reload sem re-throw infinito.
    setMessage(null);
    throw new Error(toThrow);
  }

  return null;
};
