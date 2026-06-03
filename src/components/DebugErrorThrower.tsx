import { useEffect } from "react";
import { isLovableNativeDebugRuntime } from "./debugInstruction";

/**
 * DebugErrorThrower
 *
 * Lança o erro de instrução de desenvolvimento via window.onerror (assíncrono)
 * para que o overlay nativo "Try to Fix" da Lovable capture, sem derrubar
 * a árvore React em tela branca.
 */
export const DebugErrorThrower = () => {
  useEffect(() => {
    const handler = (e: Event) => {
      if (!isLovableNativeDebugRuntime()) return;
      const detail = (e as CustomEvent<string>).detail;
      if (typeof detail !== "string" || !detail) return;
      // Dispara fora do ciclo de render para não causar blank screen.
      setTimeout(() => {
        const err = new Error(detail);
        window.dispatchEvent(new ErrorEvent("error", { error: err, message: err.message }));
      }, 0);
    };
    window.addEventListener("lovable-debug-error", handler as EventListener);
    return () => window.removeEventListener("lovable-debug-error", handler as EventListener);
  }, []);

  return null;
};

export default DebugErrorThrower;
