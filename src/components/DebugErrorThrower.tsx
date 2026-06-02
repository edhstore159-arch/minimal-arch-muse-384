import { useEffect, useState } from "react";

/**
 * DebugErrorThrower
 *
 * Escuta "lovable-debug-error" e RELANÇA a mensagem como Error fatal em render,
 * para que o overlay global "Try to Fix" da Lovable apareça.
 *
 * IMPORTANTE: deve ficar FORA de qualquer ErrorBoundary/Suspense.
 */
export const DebugErrorThrower = () => {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail;
      if (typeof detail === "string" && detail.length > 0) {
        try {
          localStorage.setItem("last_lovable_debug_instruction", detail);
        } catch {
          // ignore
        }
        setMessage(detail);
      }
    };
    window.addEventListener("lovable-debug-error", handler as EventListener);
    return () => window.removeEventListener("lovable-debug-error", handler as EventListener);
  }, []);

  if (message) {
    // Log instead of throwing so the app doesn't blank-screen on dev instructions
    console.warn("[lovable-debug-instruction]", message);
  }

  return null;
};

export default DebugErrorThrower;
