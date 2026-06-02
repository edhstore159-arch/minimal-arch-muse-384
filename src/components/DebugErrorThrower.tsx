import { useEffect } from "react";

/**
 * DebugErrorThrower (neutralizado)
 *
 * Antes lançava as instruções como Error fatal e causava tela branca.
 * Agora apenas armazena a instrução no localStorage e dispara um evento
 * informativo. NUNCA lança erro em render.
 */
export const DebugErrorThrower = () => {
  useEffect(() => {
    // Limpa qualquer instrução antiga que poderia voltar a derrubar a tela.
    try {
      localStorage.removeItem("last_lovable_debug_instruction");
    } catch {
      // ignore
    }

    const handler = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail;
      if (typeof detail === "string" && detail.length > 0) {
        try {
          localStorage.setItem("last_lovable_debug_instruction", detail);
        } catch {
          // ignore
        }
        // Apenas log — não derruba a aplicação.
        console.info("[DebugErrorThrower] instrução recebida:", detail);
      }
    };
    window.addEventListener("lovable-debug-error", handler as EventListener);
    return () => window.removeEventListener("lovable-debug-error", handler as EventListener);
  }, []);

  return null;
};

export default DebugErrorThrower;
