import { useEffect, useRef, useState } from "react";

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
type PendingDebugError = {
  id: number;
  message: string;
};

let debugErrorSequence = 0;

export const DebugErrorThrower = () => {
  const [pendingError, setPendingError] = useState<PendingDebugError | null>(null);
  const lastThrownIdRef = useRef<number | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail;
      if (typeof detail === "string" && detail.length > 0) {
        debugErrorSequence += 1;
        setPendingError({
          id: debugErrorSequence,
          message: detail,
        });
      }
    };

    window.addEventListener("lovable-debug-error", handler as EventListener);
    return () => window.removeEventListener("lovable-debug-error", handler as EventListener);
  }, []);

  if (pendingError && lastThrownIdRef.current !== pendingError.id) {
    lastThrownIdRef.current = pendingError.id;
    // Erro intencional — não envolver em try/catch, não trocar por console.error.
    throw new Error(pendingError.message);
  }

  return null;
};