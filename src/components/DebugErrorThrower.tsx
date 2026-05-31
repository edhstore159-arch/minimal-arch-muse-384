import { useEffect, useState } from "react";

/**
 * DebugErrorThrower
 *
 * Escuta instruções vindas do popup de debug sem quebrar a aplicação.
 * Antes este componente lançava um erro proposital durante o render, causando
 * tela branca no preview quando o admin enviava uma instrução pelo popup.
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
    console.info("Instrução de debug recebida:", message);
    setMessage(null);
  }

  return null;
};
