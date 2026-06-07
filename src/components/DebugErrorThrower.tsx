import { useEffect } from "react";

/**
 * DebugErrorThrower
 *
 * Escuta "lovable-debug-error" e reporta o erro intencionalmente para acionar
 * o overlay global da Lovable com botão "Try to Fix", sem derrubar a árvore React.
 *
 * NÃO envolver em ErrorBoundary/Suspense. O erro é proposital e parte da feature,
 * mas não pode acontecer dentro do render para não causar tela branca.
 */
export const DebugErrorThrower = () => {
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail;
      if (typeof detail === "string" && detail.length > 0) {
        const error = new Error(detail);
        if (typeof window.reportError === "function") {
          window.reportError(error);
          return;
        }
        window.setTimeout(() => {
          throw error;
        }, 0);
      }
    };
    window.addEventListener("lovable-debug-error", handler as EventListener);
    return () => window.removeEventListener("lovable-debug-error", handler as EventListener);
  }, []);

  return null;
};

export default DebugErrorThrower;
