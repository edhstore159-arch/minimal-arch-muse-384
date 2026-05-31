import { useEffect, useState } from "react";

/**
 * Escuta instruções do popup de debug sem derrubar a aplicação.
 * Antes este componente lançava um erro intencional, mas isso causava tela branca
 * para o usuário final ao tentar relatar problemas de backend/WhatsApp.
 */
export const DebugErrorThrower = () => {
  const [, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail;
      if (typeof detail === "string" && detail.length > 0) {
        setMessage(detail);
        console.info("[lovable-debug-instruction]", detail);
      }
    };
    window.addEventListener("lovable-debug-error", handler as EventListener);
    return () => window.removeEventListener("lovable-debug-error", handler as EventListener);
  }, []);

  return null;
};
