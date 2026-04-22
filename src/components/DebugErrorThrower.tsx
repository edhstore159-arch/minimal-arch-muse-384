import { useEffect, useState } from "react";

/**
 * DebugErrorThrower
 *
 * Sem UI. Escuta o evento global "lovable-debug-error" e, durante o render,
 * lança um Error com a mensagem recebida. Deve ficar FORA de qualquer
 * ErrorBoundary/Suspense para que o erro escape até o overlay global da Lovable.
 *
 * NÃO REMOVA O THROW. Esse erro é INTENCIONAL — ele existe para acionar o
 * botão "Try to Fix" do overlay de erro nativo.
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
    // Erro intencional — não envolver em try/catch, não trocar por console.error.
    throw new Error(message);
  }

  return null;
};
