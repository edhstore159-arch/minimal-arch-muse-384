import { useEffect } from "react";

/**
 * DebugErrorThrower
 *
 * Escuta "lovable-debug-error" sem derrubar a aplicação. Antes este componente
 * lançava um erro proposital durante o render; isso deixava a tela branca quando
 * o debug era usado para pedir correções em produção/preview.
 */
export const DebugErrorThrower = () => {
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail;
      if (typeof detail === "string" && detail.length > 0) {
        console.warn("[lovable-debug-error]", detail);
        try {
          sessionStorage.setItem("lovable-debug-error:last", detail);
        } catch {
          // Ignora ambientes onde sessionStorage não está disponível.
        }
      }
    };
    window.addEventListener("lovable-debug-error", handler as EventListener);
    return () => window.removeEventListener("lovable-debug-error", handler as EventListener);
  }, []);

  return null;
};
