import { useEffect, useState } from "react";

/**
 * DebugErrorThrower
 *
 * Mantém compatibilidade com o popup interno de debug sem derrubar a aplicação.
 * Antes este componente lançava um erro proposital no render; isso deixava a
 * tela em branco quando uma instrução era enviada pelo popup.
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

  useEffect(() => {
    if (!message) return;
    console.warn("lovable-debug-error capturado sem quebrar a UI:", message);
    setMessage(null);
  }, [message]);

  return null;
};
