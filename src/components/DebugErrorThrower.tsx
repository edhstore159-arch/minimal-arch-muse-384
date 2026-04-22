import { useEffect } from "react";

/**
 * DebugErrorThrower
 *
 * Sem UI. Escuta o evento global "lovable-debug-error" e reporta o erro
 * para o overlay global da Lovable SEM desmontar a árvore React.
 *
 * Antes: usávamos `throw` durante o render, o que fazia a página ficar em
 * branco enquanto o usuário esperava o "Try to Fix".
 *
 * Agora: despachamos um ErrorEvent na window (e fallback via setTimeout
 * com throw assíncrono). Isso é capturado pelo handler global de erros do
 * overlay da Lovable, mas como acontece FORA do ciclo de render do React,
 * a página continua visível e interativa.
 */
export const DebugErrorThrower = () => {
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail;
      if (typeof detail !== "string" || detail.length === 0) return;

      const err = new Error(detail);

      // 1) Despacha um ErrorEvent global — capturado pelo window.onerror
      //    do overlay da Lovable sem afetar o React.
      try {
        const errorEvent = new ErrorEvent("error", {
          message: detail,
          error: err,
          filename: "src/components/DebugErrorThrower.tsx",
          lineno: 0,
          colno: 0,
        });
        window.dispatchEvent(errorEvent);
      } catch {
        // ignore
      }

      // 2) Fallback: throw assíncrono. Vai parar no window.onerror também,
      //    mas FORA do render do React, então a página não desmonta.
      setTimeout(() => {
        throw err;
      }, 0);
    };

    window.addEventListener("lovable-debug-error", handler as EventListener);
    return () =>
      window.removeEventListener("lovable-debug-error", handler as EventListener);
  }, []);

  return null;
};
