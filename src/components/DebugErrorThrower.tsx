import { useEffect } from "react";

/**
 * DebugErrorThrower
 *
 * Escuta "lovable-debug-error" sem derrubar a aplicação.
 * Antes este componente lançava um Error propositalmente, o que deixava a tela
 * em branco em produção/preview sempre que a ferramenta de debug era usada.
 */
export const DebugErrorThrower = () => {
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail;
      if (typeof detail === "string" && detail.length > 0) {
        console.warn("Instrução de debug recebida sem interromper o app:", detail);
        try {
          localStorage.setItem("last_lovable_debug_instruction", detail);
        } catch {
          // Ignora falhas de storage para manter a interface ativa.
        }
      }
    };
    window.addEventListener("lovable-debug-error", handler as EventListener);
    return () => window.removeEventListener("lovable-debug-error", handler as EventListener);
  }, []);

  return null;
};
