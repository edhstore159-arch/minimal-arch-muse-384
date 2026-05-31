import { useEffect } from "react";

/**
 * DebugErrorThrower
 *
 * Escuta "lovable-debug-error" e reporta o erro sem quebrar a árvore React.
 * Antes isso lançava Error durante o render e deixava a tela branca.
 */
export const DebugErrorThrower = () => {
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail;
      if (typeof detail === "string" && detail.length > 0) {
        const error = new Error(detail);
        console.error(error);
        if (typeof window.reportError === "function") {
          window.reportError(error);
        }
      }
    };
    window.addEventListener("lovable-debug-error", handler as EventListener);
    return () => window.removeEventListener("lovable-debug-error", handler as EventListener);
  }, []);

  return null;
};
