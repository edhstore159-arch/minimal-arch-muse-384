import { useEffect, useState } from "react";

/**
 * DebugErrorThrower
 *
 * Escuta "lovable-debug-error" enviado pelo popup interno de debug.
 * Antes este componente lançava uma exceção durante o render, o que deixava
 * o app com tela branca. Agora ele só registra a instrução no console.
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
    console.error(message);
    setMessage(null);
  }, [message]);

  return null;
};
