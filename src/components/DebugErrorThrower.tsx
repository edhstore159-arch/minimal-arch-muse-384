import { useEffect, useState } from "react";

let pendingDebugError: string | null = null;

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
  const [, forceRender] = useState(0);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail;
      if (typeof detail === "string" && detail.length > 0) {
        pendingDebugError = detail;
        forceRender((value) => value + 1);
      }
    };
    window.addEventListener("lovable-debug-error", handler as EventListener);
    return () => window.removeEventListener("lovable-debug-error", handler as EventListener);
  }, []);

  if (pendingDebugError) {
    const toThrow = pendingDebugError;
    // Limpa antes do throw para evitar re-render infinito depois do overlay.
    pendingDebugError = null;
    throw new Error(toThrow);
  }

  return null;
};
