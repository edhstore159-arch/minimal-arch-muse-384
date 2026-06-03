import { useEffect } from "react";

/**
 * DebugErrorThrower
 *
 * Escuta o evento "lovable-debug-error" usado pela ferramenta interna de admin.
 * Não lança erro fatal: isso derrubava a tela inteira do app em produção.
 */
export const DebugErrorThrower = () => {
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail;
      if (typeof detail === "string" && detail.length > 0) {
        console.warn("[Debug instruction captured]", detail);
      }
    };
    window.addEventListener("lovable-debug-error", handler as EventListener);
    return () => window.removeEventListener("lovable-debug-error", handler as EventListener);
  }, []);

  return null;
};

export default DebugErrorThrower;
