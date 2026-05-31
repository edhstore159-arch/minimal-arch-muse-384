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
    // Limpa o state para que o erro só dispare uma vez por instrução.
    setMessage(null);

    // Fora das rotas próprias de debug, não derruba a aplicação: o popup de
    // instruções estava sendo usado dentro do site e causava tela branca.
    const isDebugRoute = window.location.pathname.includes("/debug");
    if (isDebugRoute) {
      throw new Error(toThrow);
    }

    console.warn("Instrução de debug recebida sem interromper o app:", toThrow);
  }

  return null;
};
