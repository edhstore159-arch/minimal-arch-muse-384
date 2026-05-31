import { useEffect, useState } from "react";

/**
 * DebugErrorThrower
 *
 * Mantém compatibilidade com o popup interno de debug, mas não derruba mais a
 * aplicação. Antes ele lançava um erro proposital durante o render e causava
 * tela branca para qualquer instrução enviada pelo popup.
 */
export const DebugErrorThrower = () => {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail;
      if (typeof detail === "string" && detail.length > 0) {
        setMessage(detail);
      }
    };
    window.addEventListener("lovable-debug-error", handler as EventListener);
    return () => window.removeEventListener("lovable-debug-error", handler as EventListener);
  }, []);

  if (message) {
    console.warn("lovable-debug-error:", message);
    setMessage(null);
  }

  return null;
};
