import { useEffect, useState } from "react";
import { isLovableNativeDebugRuntime, readLovableDebugBridgeMessage } from "@/components/debugInstruction";

/**
 * DebugErrorThrower
 *
 * Escuta "lovable-debug-error" e lança o erro durante o render para que
 * ele escape ao overlay global da Lovable e habilite o "Try to Fix".
 *
 * NÃO envolver em ErrorBoundary/Suspense. NÃO substituir por console/toast.
 */
export const DebugErrorThrower = () => {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isLovableNativeDebugRuntime()) return;
    const bridgeMessage = readLovableDebugBridgeMessage();
    if (bridgeMessage) {
      setTimeout(() => setMessage(bridgeMessage), 250);
    }
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail;
      if (typeof detail === "string" && detail.length > 0) {
        setMessage(detail);
      }
    };
    window.addEventListener("lovable-debug-error", handler as EventListener);
    return () => window.removeEventListener("lovable-debug-error", handler as EventListener);
  }, []);

  if (message && isLovableNativeDebugRuntime()) {
    throw new Error(message);
  }

  return null;
};

export default DebugErrorThrower;
