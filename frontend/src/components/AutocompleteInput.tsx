"use client";

import { useEffect, useRef, useState } from "react";

export interface OpcionAutocomplete {
  value: string;
  hint?: string;
}

/**
 * Combobox editable: el usuario puede escribir libremente y, al mismo tiempo,
 * se ofrecen sugerencias buscadas con `onBuscar` (con un pequeño retraso).
 */
export default function AutocompleteInput({
  value,
  onChange,
  onBuscar,
  placeholder,
  minLen = 2,
}: {
  value: string;
  onChange: (valor: string) => void;
  onBuscar: (q: string) => Promise<OpcionAutocomplete[]>;
  placeholder?: string;
  minLen?: number;
}) {
  const [abierto, setAbierto] = useState(false);
  const [opciones, setOpciones] = useState<OpcionAutocomplete[]>([]);
  const [cargando, setCargando] = useState(false);
  const [focado, setFocado] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const peticion = useRef(0);
  const ignorarProxima = useRef(false);

  useEffect(() => {
    if (!focado || ignorarProxima.current) {
      ignorarProxima.current = false;
      return;
    }
    if (debounce.current) clearTimeout(debounce.current);
    const texto = value.trim();
    if (texto.length < minLen) {
      setOpciones([]);
      setCargando(false);
      return;
    }
    setCargando(true);
    const id = ++peticion.current;
    debounce.current = setTimeout(async () => {
      try {
        const res = await onBuscar(texto);
        if (id === peticion.current) {
          setOpciones(res);
          setAbierto(true);
        }
      } catch {
        if (id === peticion.current) setOpciones([]);
      } finally {
        if (id === peticion.current) setCargando(false);
      }
    }, 300);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [value, minLen, onBuscar, focado]);

  function elegir(opcion: OpcionAutocomplete) {
    ignorarProxima.current = true;
    if (debounce.current) clearTimeout(debounce.current);
    peticion.current++; // invalida cualquier búsqueda en curso
    onChange(opcion.value);
    setAbierto(false);
    setCargando(false);
    setOpciones([]);
  }

  return (
    <div className="relative">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => {
          setFocado(true);
          if (opciones.length > 0) setAbierto(true);
        }}
        onBlur={() => {
          setFocado(false);
          setTimeout(() => setAbierto(false), 150);
        }}
        placeholder={placeholder}
        autoComplete="off"
        className="campo"
      />
      {cargando && (
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[0.7rem] text-brand-brown/40">
          …
        </span>
      )}
      {abierto && opciones.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-brand-brown/15 bg-white py-1 shadow-lg">
          {opciones.map((o, i) => (
            <li key={`${o.value}-${i}`}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => elegir(o)}
                className="flex w-full items-baseline justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-brand-cream-soft"
              >
                <span className="text-brand-black">{o.value}</span>
                {o.hint && (
                  <span className="shrink-0 text-xs text-brand-brown/50">
                    {o.hint}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
