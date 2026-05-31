import { useEffect } from "react";

/**
 * DebugErrorThrower
 *
 * Escuta "lovable-debug-error" sem derrubar a aplicação.
 * O fluxo antigo lançava um Error proposital durante o render, causando tela branca.
 */
export const DebugErrorThrower = () => {
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail;
      if (typeof detail === "string" && detail.length > 0) {
        console.info("[lovable-debug-error]", detail);
        try {
          window.sessionStorage.setItem("lovable-debug-error:last", detail);
        } catch {
          // Ignora ambientes sem sessionStorage disponível.
        }
      }
    };
    window.addEventListener("lovable-debug-error", handler as EventListener);
    return () => window.removeEventListener("lovable-debug-error", handler as EventListener);
  }, []);

  return null;
};
