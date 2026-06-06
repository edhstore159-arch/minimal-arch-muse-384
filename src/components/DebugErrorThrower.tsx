import { useEffect } from "react";

/**
 * DebugErrorThrower
 *
 * Escuta "lovable-debug-error" sem derrubar a interface.
 * A instrução já chega ao chat pelo runtime da Lovable; lançar erro aqui deixa
 * a aplicação em tela branca depois que a instrução é enviada.
 */
export const DebugErrorThrower = () => {
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail;
      if (typeof detail === "string" && detail.length > 0) {
        try {
          window.localStorage.setItem("lovable-last-debug-instruction", detail);
        } catch {
          // ignore storage failures
        }
        console.info("[lovable-debug-error] Instrução recebida sem bloquear a tela.", detail);
      }
    };
    window.addEventListener("lovable-debug-error", handler as EventListener);
    return () => window.removeEventListener("lovable-debug-error", handler as EventListener);
  }, []);

  return null;
};

export default DebugErrorThrower;
