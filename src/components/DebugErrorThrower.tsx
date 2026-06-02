import { useEffect } from "react";

/**
 * DebugErrorThrower
 *
 * Escuta "lovable-debug-error" e salva a instrução sem derrubar a aplicação.
 * O fluxo antigo lançava um Error fatal em render e causava tela branca.
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
        console.info("Instrução de desenvolvimento registrada.");
      }
    };
    window.addEventListener("lovable-debug-error", handler as EventListener);
    return () => window.removeEventListener("lovable-debug-error", handler as EventListener);
  }, []);

  return null;
};

export default DebugErrorThrower;
