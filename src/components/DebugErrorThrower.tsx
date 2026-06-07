import { useEffect } from "react";

/**
 * DebugErrorThrower
 *
 * Escuta "lovable-debug-error" sem quebrar a aplicação.
 * Mensagens desse canal são instruções/debug e não devem causar tela branca.
 */
export const DebugErrorThrower = () => {
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail;
      if (typeof detail === "string" && detail.length > 0) {
        console.warn("lovable-debug-error ignored:", detail);
      }
    };
    window.addEventListener("lovable-debug-error", handler as EventListener);
    return () => window.removeEventListener("lovable-debug-error", handler as EventListener);
  }, []);

  return null;
};

export default DebugErrorThrower;
