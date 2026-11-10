"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * Ref para ventanitas flotantes (popovers): llama a `onCerrar` cuando el
 * elemento queda totalmente fuera de la vista al hacer scroll.
 */
export function useCerrarFueraDeVista<T extends Element = HTMLDivElement>(onCerrar: () => void) {
  const cerrar = useRef(onCerrar);
  useEffect(() => {
    cerrar.current = onCerrar;
  }, [onCerrar]);

  return useCallback((el: T | null) => {
    if (!el) return;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) cerrar.current();
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);
}
