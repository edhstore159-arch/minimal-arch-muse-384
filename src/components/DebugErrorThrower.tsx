import { useEffect, useState } from "react";

/**
 * DebugErrorThrower
 *
 * Escuta "lovable-debug-error" e LANÇA um erro fatal de runtime com a
 * instrução recebida. Esse erro é INTENCIONAL — ele existe para escapar
 * para o overlay global da Lovable, permitindo que o usuário use o botão
 * "Try to Fix" como fluxo de correção.
 *
 * NÃO envolver em ErrorBoundary. NÃO trocar o throw por log/toast.
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
    throw new Error(message);
  }

  return null;
};

export default DebugErrorThrower;
