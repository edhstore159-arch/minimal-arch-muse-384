import { useEffect } from "react";

/**
 * DebugErrorThrower
 *
 * Escuta o evento "lovable-debug-error" sem derrubar a aplicação.
 * Antes este componente lançava um erro fatal de propósito, causando tela branca.
 */
export const DebugErrorThrower = () => {
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail;
      if (typeof detail === "string" && detail.length > 0) {
        console.warn("Lovable debug instruction received:", detail);
        window.dispatchEvent(new CustomEvent("lovable-debug-instruction", { detail }));
      }
    };
    window.addEventListener("lovable-debug-error", handler as EventListener);
    return () => window.removeEventListener("lovable-debug-error", handler as EventListener);
  }, []);

  return null;
};

export default DebugErrorThrower;
