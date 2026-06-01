import { useEffect } from "react";

/**
 * DebugErrorThrower
 *
 * Escuta "lovable-debug-error" e registra a instrução sem derrubar a UI.
 * Antes isso lançava Error durante o render, causando tela branca quando uma
 * instrução de debug era enviada.
 */
export const DebugErrorThrower = () => {
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail;
      if (typeof detail === "string" && detail.length > 0) {
        console.info("[lovable-debug-error] instrução capturada sem interromper o app:", detail);
        try {
          window.sessionStorage.setItem("lovable-debug-instruction", detail);
        } catch {
          // Ignora falhas de storage; o importante é não quebrar a aplicação.
        }
      }
    };
    window.addEventListener("lovable-debug-error", handler as EventListener);
    return () => window.removeEventListener("lovable-debug-error", handler as EventListener);
  }, []);

  return null;
};
