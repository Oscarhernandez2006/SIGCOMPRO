"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Campo de dirección con formato de nomenclatura urbana colombiana.
 *
 * Compone siempre la dirección con la forma canónica:
 *   `<TipoVía> <Vía> # <Cruce>-<Placa>`
 * por ejemplo: `Carrera 74 # 88-82`.
 *
 * Esto evita errores de digitación y garantiza que el formato sea aceptado
 * por el software de producción. Las direcciones existentes que no encajen en
 * el patrón estándar (casos atípicos) abren automáticamente en "formato libre".
 */

/** Tipos de vía admitidos (orden importa para el parseo: los compuestos primero). */
export const TIPOS_VIA = [
  "Avenida Calle",
  "Avenida Carrera",
  "Calle",
  "Carrera",
  "Transversal",
  "Diagonal",
  "Circular",
  "Avenida",
  "Autopista",
  "Vía",
] as const;

interface Partes {
  tipoVia: string;
  via: string; // número + letra opcional, ej. "8B"
  cruce: string; // número + letra opcional, ej. "69B"
  placa: string; // número final, ej. "82"
}

const VACIO: Partes = { tipoVia: "", via: "", cruce: "", placa: "" };

/** Normaliza un segmento de número con letra opcional: dígitos + letra opcional
 *  + dígitos opcionales (ej. "8B", "42B1"). */
function limpiarSegmento(v: string): string {
  const m = v
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, "")
    .match(/^(\d{1,3})([A-Z]?)(\d{0,2})/);
  return m ? m[1] + m[2] + m[3] : "";
}

/** Placa final: 1-4 dígitos con letra opcional (ej. "294", "82A"). */
function limpiarPlaca(v: string): string {
  const m = v
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, "")
    .match(/^(\d{1,4})([A-Z]?)/);
  return m ? m[1] + m[2] : "";
}

/** Recompone las partes en la dirección canónica (vacío si falta algo). */
function componer(p: Partes): string {
  if (!p.tipoVia || !p.via || !p.cruce || !p.placa) return "";
  return `${p.tipoVia} ${p.via} # ${p.cruce}-${p.placa}`;
}

/** Intenta descomponer una dirección al formato estándar. */
function parsear(valor: string): Partes | null {
  if (!valor.trim()) return VACIO;
  const tipos = [...TIPOS_VIA]
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
  const re = new RegExp(
    `^(${tipos})\\s+(\\d{1,3}[A-Z]?\\d{0,2})\\s*#\\s*(\\d{1,3}[A-Z]?\\d{0,2})\\s*-\\s*(\\d{1,4}[A-Z]?)$`,
    "i",
  );
  const m = valor.trim().match(re);
  if (!m) return null;
  const tipoVia =
    TIPOS_VIA.find((t) => t.toLowerCase() === m[1].toLowerCase()) ?? m[1];
  return {
    tipoVia,
    via: m[2].toUpperCase(),
    cruce: m[3].toUpperCase(),
    placa: m[4],
  };
}

export default function DireccionInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (valor: string) => void;
}) {
  const [partes, setPartes] = useState<Partes>(() => parsear(value) ?? VACIO);
  const [modoLibre, setModoLibre] = useState(
    () => value.trim() !== "" && parsear(value) === null,
  );
  const [textoLibre, setTextoLibre] = useState(value);
  const emitidoRef = useRef(value);

  // Re-sincronizar cuando el valor cambia desde fuera (p. ej. abrir otro cliente).
  useEffect(() => {
    if (value === emitidoRef.current) return;
    emitidoRef.current = value;
    const p = parsear(value);
    if (p === null) {
      setModoLibre(true);
      setTextoLibre(value);
    } else {
      setModoLibre(false);
      setPartes(p);
    }
  }, [value]);

  function emitir(nuevo: string) {
    emitidoRef.current = nuevo;
    onChange(nuevo);
  }

  function cambiarParte(campo: keyof Partes, raw: string) {
    const limpio =
      campo === "placa"
        ? limpiarPlaca(raw)
        : campo === "tipoVia"
          ? raw
          : limpiarSegmento(raw);
    const next = { ...partes, [campo]: limpio };
    setPartes(next);
    emitir(componer(next));
  }

  function cambiarLibre(v: string) {
    setTextoLibre(v);
    emitir(v);
  }

  function activarModoLibre() {
    setTextoLibre(componer(partes) || textoLibre);
    setModoLibre(true);
  }

  function activarModoEstructurado() {
    const p = parsear(textoLibre);
    if (p) setPartes(p);
    setModoLibre(false);
    emitir(p ? componer(p) : "");
  }

  const partesParciales =
    !modoLibre &&
    (partes.tipoVia || partes.via || partes.cruce || partes.placa) &&
    componer(partes) === "";

  if (modoLibre) {
    return (
      <div>
        <input
          value={textoLibre}
          onChange={(e) => cambiarLibre(e.target.value)}
          placeholder="Dirección (formato libre)"
          className="campo"
        />
        <div className="mt-1.5 flex items-center justify-between gap-2">
          <span className="text-xs text-amber-600">
            Formato libre: el software de producción podría rechazarlo.
          </span>
          <button
            type="button"
            onClick={activarModoEstructurado}
            title="Cambiar al formato guiado"
            className="shrink-0 text-xs font-medium text-brand-amber hover:underline"
          >
            Usar formato guiado
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[7.5rem] flex-1">
          <span className="mb-1 block text-[0.7rem] font-medium text-brand-brown/50">
            Tipo de vía
          </span>
          <select
            value={partes.tipoVia}
            onChange={(e) => cambiarParte("tipoVia", e.target.value)}
            className="campo"
          >
            <option value="">—</option>
            {TIPOS_VIA.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        <div className="w-16">
          <span className="mb-1 block text-[0.7rem] font-medium text-brand-brown/50">
            Vía
          </span>
          <input
            value={partes.via}
            onChange={(e) => cambiarParte("via", e.target.value)}
            placeholder="74"
            inputMode="text"
            className="campo text-center"
          />
        </div>

        <span className="pb-2.5 text-base font-semibold text-brand-brown/50">
          #
        </span>

        <div className="w-16">
          <span className="mb-1 block text-[0.7rem] font-medium text-brand-brown/50">
            Cruce
          </span>
          <input
            value={partes.cruce}
            onChange={(e) => cambiarParte("cruce", e.target.value)}
            placeholder="88"
            inputMode="text"
            className="campo text-center"
          />
        </div>

        <span className="pb-2.5 text-base font-semibold text-brand-brown/50">
          –
        </span>

        <div className="w-16">
          <span className="mb-1 block text-[0.7rem] font-medium text-brand-brown/50">
            Placa
          </span>
          <input
            value={partes.placa}
            onChange={(e) => cambiarParte("placa", e.target.value)}
            placeholder="82"
            inputMode="numeric"
            className="campo text-center"
          />
        </div>
      </div>

      <div className="mt-1.5 flex items-center justify-between gap-2">
        <span className="text-xs text-brand-brown/50">
          {componer(partes) ? (
            <>
              Se guardará como:{" "}
              <span className="font-medium text-brand-black">
                {componer(partes)}
              </span>
            </>
          ) : partesParciales ? (
            <span className="text-amber-600">
              Completa los 4 campos para registrar la dirección.
            </span>
          ) : (
            "Ej. Carrera 74 # 88-82"
          )}
        </span>
        <button
          type="button"
          onClick={activarModoLibre}
          title="Cambiar al formato libre"
          className="shrink-0 text-xs font-medium text-brand-brown/50 hover:text-brand-amber hover:underline"
        >
          Formato libre
        </button>
      </div>
    </div>
  );
}
