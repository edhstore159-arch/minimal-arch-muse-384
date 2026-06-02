import { useEffect } from "react";

/**
 * DebugErrorThrower
 *
 * Apenas armazena instruções de debug em localStorage — NÃO lança erros fatais
 * para evitar tela branca.
 */
export const DebugErrorThrower = () => {
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail;
      if (typeof detail === "string" && detail.length > 0) {
        try {
          localStorage.setItem("last_lovable_debug_instruction", detail);
        } catch {
          // ignore
        }
        console.info("[lovable-debug-instruction]", detail);
      }
    };
    window.addEventListener("lovable-debug-error", handler as EventListener);
    return () => window.removeEventListener("lovable-debug-error", handler as EventListener);
  }, []);

  return null;
};

export default DebugErrorThrower;
