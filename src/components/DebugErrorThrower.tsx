import { useEffect, useState } from "react";

/**
 * DebugErrorThrower
 *
 * Mantém compatibilidade com o fluxo antigo de debug, mas não derruba mais a
 * aplicação em produção/preview. As instruções são registradas no console para
 * diagnóstico sem causar tela branca.
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
    const toThrow = message;
    setMessage(null);
    console.info("Lovable debug instruction:", toThrow);
  }

  return null;
};
