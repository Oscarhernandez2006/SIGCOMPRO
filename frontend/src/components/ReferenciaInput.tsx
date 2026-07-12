"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Campo de referencia con el formato compositivo del negocio, p. ej.:
 *   `Conjunto Torino - Apto 355 - T9`
 *   `Edificio Coco - Apto 202`
 *   `Casa`  ·  `Local 6`  ·  `Apto 201`
 *
 * Se arma uniendo con " - " las partes presentes:
 *   [TipoConjunto Nombre] - [TipoUnidad Número] - [T<Torre>]
 *
 * Las referencias atípicas que no encajen abren en "formato libre".
 */

const TIPOS_CONJUNTO = [
  "Conjunto",
  "Edificio",
  "Urbanización",
  "Condominio",
] as const;

interface Partes {
  tipoConjunto: string;
  nombre: string;
  unidad: string; // solo el número/identificador del apto, ej. "5B" (se antepone "Apto")
  piso: string;
  bloque: string;
  torre: string;
}

const VACIO: Partes = {
  tipoConjunto: "",
  nombre: "",
  unidad: "",
  piso: "",
  bloque: "",
  torre: "",
};

function norm(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function componer(p: Partes): string {
  const segmentos: string[] = [];
  const conjunto = norm(`${p.tipoConjunto} ${p.nombre}`);
  if (conjunto) segmentos.push(conjunto);
  const unidad = norm(p.unidad);
  if (unidad) segmentos.push(`Apto ${unidad}`);
  if (p.bloque.trim()) segmentos.push(`B${p.bloque.trim()}`);
  if (p.torre.trim()) segmentos.push(`T${p.torre.trim()}`);
  if (p.piso.trim()) segmentos.push(`P${p.piso.trim()}`);
  return segmentos.join(" - ");
}

function parsear(valor: string): Partes | null {
  if (!valor.trim()) return VACIO;
  const partes = valor
    .split(" - ")
    .map((s) => s.trim())
    .filter(Boolean);
  const r: Partes = { ...VACIO };

  for (const p of partes) {
    let m: RegExpMatchArray | null;
    if (!r.torre && (m = p.match(/^T(\d+[A-Za-z]?|[A-Za-z])$/))) {
      r.torre = m[1];
      continue;
    }
    if (!r.bloque && (m = p.match(/^B(\d+[A-Za-z]?|[A-Za-z]\d*)$/))) {
      r.bloque = m[1];
      continue;
    }
    if (!r.piso && (m = p.match(/^P(\d+[A-Za-z]?)$/))) {
      r.piso = m[1].trim();
      continue;
    }
    if (!r.unidad && (m = p.match(/^Apto\s+(.+)$/i))) {
      r.unidad = m[1].trim();
      continue;
    }
    if (
      !r.nombre &&
      (m = p.match(/^(Conjunto|Edificio|Urbanizaci[oó]n|Condominio)\b\s*(.*)$/i))
    ) {
      const mapa: Record<string, string> = {
        conjunto: "Conjunto",
        edificio: "Edificio",
        urbanización: "Urbanización",
        urbanizacion: "Urbanización",
        condominio: "Condominio",
      };
      r.tipoConjunto = mapa[m[1].toLowerCase()] ?? m[1];
      r.nombre = m[2].trim();
      continue;
    }
    if (!r.nombre) {
      r.nombre = p;
      continue;
    }
    return null; // no se pudo clasificar de forma limpia
  }

  // Solo es seguro el modo estructurado si reproduce exactamente el original.
  if (norm(componer(r)) !== norm(valor)) return null;
  return r;
}

export default function ReferenciaInput({
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

  function cambiarParte(campo: keyof Partes, valor: string) {
    const next = { ...partes, [campo]: valor };
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

  if (modoLibre) {
    return (
      <div>
        <input
          value={textoLibre}
          onChange={(e) => cambiarLibre(e.target.value)}
          placeholder="Referencia (formato libre)"
          className="campo"
        />
        <div className="mt-1.5 flex items-center justify-between gap-2">
          <span className="text-xs text-amber-600">
            Formato libre (referencia no estándar).
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
      <div className="grid gap-2 sm:grid-cols-2">
        <select
          value={partes.tipoConjunto}
          onChange={(e) => cambiarParte("tipoConjunto", e.target.value)}
          className="campo"
        >
          <option value="">Sin conjunto/edificio</option>
          {TIPOS_CONJUNTO.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <input
          value={partes.nombre}
          onChange={(e) => cambiarParte("nombre", e.target.value)}
          placeholder="Nombre (ej. Torino)"
          className="campo"
        />
      </div>

      <div className="mt-2 flex flex-wrap items-end gap-2">
        <div className="w-36">
          <span className="mb-1 block text-[0.7rem] font-medium text-brand-brown/50">
            Apartamento
          </span>
          <div className="flex items-center">
            <span className="mr-1 text-sm font-semibold text-brand-brown/50">
              Apto
            </span>
            <input
              value={partes.unidad}
              onChange={(e) =>
                cambiarParte(
                  "unidad",
                  e.target.value.replace(/[^0-9A-Za-z]/g, "").toUpperCase(),
                )
              }
              placeholder="355"
              className="campo text-center"
            />
          </div>
        </div>
        <div className="w-24">
          <span className="mb-1 block text-[0.7rem] font-medium text-brand-brown/50">
            Bloque
          </span>
          <div className="flex items-center">
            <span className="mr-1 text-sm font-semibold text-brand-brown/50">
              B
            </span>
            <input
              value={partes.bloque}
              onChange={(e) =>
                cambiarParte(
                  "bloque",
                  e.target.value.replace(/[^0-9A-Za-z]/g, "").toUpperCase(),
                )
              }
              placeholder="6"
              className="campo text-center"
            />
          </div>
        </div>
        <div className="w-24">
          <span className="mb-1 block text-[0.7rem] font-medium text-brand-brown/50">
            Torre
          </span>
          <div className="flex items-center">
            <span className="mr-1 text-sm font-semibold text-brand-brown/50">
              T
            </span>
            <input
              value={partes.torre}
              onChange={(e) => cambiarParte("torre", e.target.value)}
              placeholder="9"
              className="campo text-center"
            />
          </div>
        </div>
        <div className="w-20">
          <span className="mb-1 block text-[0.7rem] font-medium text-brand-brown/50">
            Piso
          </span>
          <div className="flex items-center">
            <span className="mr-1 text-sm font-semibold text-brand-brown/50">
              P
            </span>
            <input
              value={partes.piso}
              onChange={(e) => cambiarParte("piso", e.target.value.replace(/\D+/g, ""))}
              placeholder="3"
              inputMode="numeric"
              className="campo text-center"
            />
          </div>
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
          ) : (
            "Ej. Conjunto Torino - Apto 355 - B6 - T9 - P3"
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
