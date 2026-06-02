import { useEffect, useState } from "react";

/**
 * DebugErrorThrower
 *
 * Escuta "lovable-debug-error" sem derrubar o app. As instruções ficam salvas
 * em localStorage para depuração, mas não são relançadas como erro fatal.
 */
export const DebugErrorThrower = () => {
  const [, setLastMessage] = useState<string | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail;
      if (typeof detail === "string" && detail.length > 0) {
        try {
          localStorage.setItem("last_lovable_debug_instruction", detail);
        } catch {
          // ignore
        }
        setLastMessage(detail);
        console.info("Instrução de desenvolvimento registrada sem interromper a aplicação.", detail);
      }
    };
    window.addEventListener("lovable-debug-error", handler as EventListener);
    return () => window.removeEventListener("lovable-debug-error", handler as EventListener);
  }, []);

  return null;
};

export default DebugErrorThrower;
