import { useEffect } from "react";

/**
 * DebugErrorThrower
 *
 * Escuta o evento "lovable-debug-error" sem derrubar a aplicação.
 * Antes ele lançava um erro fatal e causava tela branca no preview.
 */
export const DebugErrorThrower = () => {
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail;
      if (typeof detail === "string" && detail.length > 0) {
        console.warn("lovable-debug-error capturado sem interromper o app:", detail);
      }
    };
    window.addEventListener("lovable-debug-error", handler as EventListener);
    return () => window.removeEventListener("lovable-debug-error", handler as EventListener);
  }, []);

  return null;
};

export default DebugErrorThrower;
