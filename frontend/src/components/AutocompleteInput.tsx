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
  formato,
}: {
  value: string;
  onChange: (valor: string) => void;
  onBuscar: (q: string) => Promise<OpcionAutocomplete[]>;
  placeholder?: string;
  minLen?: number;
  /** Formato opcional aplicado al escribir (p. ej. nombre propio). */
  formato?: (valor: string) => string;
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
    onChange(formato ? formato(opcion.value) : opcion.value);
    setAbierto(false);
    setCargando(false);
    setOpciones([]);
  }

  return (
    <div className="relative">
      <input
        value={value}
        onChange={(e) => {
          if (!formato) {
            onChange(e.target.value);
            return;
          }
          // Aplica el formato (nombre propio) conservando la posición del
          // caret, ya que solo cambia mayúsculas/minúsculas (misma longitud).
          const el = e.currentTarget;
          const bruto = el.value;
          const pos = el.selectionStart;
          const val = formato(bruto);
          onChange(val);
          if (pos !== null && val.length === bruto.length) {
            requestAnimationFrame(() => {
              try {
                el.setSelectionRange(pos, pos);
              } catch {
                /* input ya no está en el DOM */
              }
            });
          }
        }}
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
        style={{ paddingRight: "2.25rem" }}
      />
      {cargando && (
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[0.7rem] text-brand-brown/40">
          …
        </span>
      )}
      {!cargando && value && (
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            if (debounce.current) clearTimeout(debounce.current);
            peticion.current++;
            onChange("");
            setOpciones([]);
            setAbierto(false);
          }}
          title="Limpiar"
          aria-label="Limpiar"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-0.5 text-brand-brown/40 transition hover:bg-brand-cream-soft hover:text-brand-wine"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      )}
      {abierto && opciones.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-brand-brown/15 bg-white py-1 shadow-lg">
          {opciones.map((o, i) => (
            <li key={`${o.value}-${i}`}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => elegir(o)}
                title={`Seleccionar ${o.value}`}
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
