"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import {
  puntosUbicaciones,
  puntoMasCercano,
  type PuntoUbicacion,
} from "@/lib/puntos-venta";

const MapaLeaflet = dynamic(() => import("./MapaLeaflet"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[260px] items-center justify-center rounded-xl bg-brand-cream-soft text-sm text-brand-brown/50">
      Cargando mapa…
    </div>
  ),
});

/** Centro por defecto (Medellín) cuando aún no hay coordenadas. */
const CENTRO_POR_DEFECTO = { lat: 6.2442, lng: -75.5812 };

interface Estado {
  tipo: "ok" | "error" | "info";
  msg: string;
}

/** Resultado de geocodificación de Nominatim (con detalles de dirección). */
interface SugerenciaGeo {
  display_name: string;
  lat: string;
  lon: string;
  address?: Record<string, string>;
}

/** Quita la placa (después de "#") para quedarnos con la vía principal. */
function soloVia(direccion: string): string {
  return direccion.split("#")[0].replace(/\s+/g, " ").trim();
}

/**
 * Extrae el nombre del conjunto/edificio de la referencia para buscarlo como
 * punto de interés en el mapa (ej. "Edificio Torino - Apto 5B" -> "Edificio
 * Torino"). Si la referencia empieza por Apto/Bloque/Torre/Piso (sin conjunto),
 * devuelve "".
 */
function extraerConjunto(referencia?: string): string {
  const ref = (referencia ?? "").trim();
  if (!ref) return "";
  const primero = ref.split(" - ")[0].trim();
  if (/^(apto|apartamento|b\d|bloque|t\d|torre|p\d|piso)\b/i.test(primero)) {
    return "";
  }
  return primero;
}

/** Normaliza para comparar (minúsculas, sin tildes ni espacios extra). */
function normaliza(s: string): string {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Arma varias consultas, de la más específica a la más general, para mejorar
 * los aciertos en Colombia (OSM rara vez tiene la placa exacta). Si hay nombre
 * de conjunto/edificio, se busca primero como punto de interés.
 */
function construirConsultas(
  direccion: string,
  barrio: string,
  ciudad: string,
  conjunto = "",
): string[] {
  const dir = direccion.trim();
  const via = soloVia(dir);
  const b = barrio.trim();
  const ci = ciudad.trim();
  const co = conjunto.trim();
  const arma = (partes: string[]) => partes.filter(Boolean).join(", ");
  const consultas = [
    ...(co
      ? [
          arma([co, b, ci, "Colombia"]), // conjunto + barrio + ciudad (punto de interés)
          arma([co, ci, "Colombia"]), // conjunto + ciudad
        ]
      : []),
    arma([dir, ci, "Colombia"]), // dirección + ciudad (SIN barrio -> ubica la calle REAL)
    arma([via, ci, "Colombia"]), // vía sin placa + ciudad (SIN barrio)
    arma([dir, b, ci, "Colombia"]), // dirección + barrio + ciudad
    arma([via, b, ci, "Colombia"]), // vía + barrio + ciudad
    arma([b, ci, "Colombia"]), // barrio + ciudad (último recurso: solo el sector)
    arma([ci, "Colombia"]), // solo ciudad
  ];
  return [...new Set(consultas)].filter((q) => q && q !== "Colombia");
}

/** Consulta Nominatim (OSM) y devuelve la lista de coincidencias. */
async function consultarNominatim(
  q: string,
  limit: number,
): Promise<SugerenciaGeo[]> {
  const r = await fetch(
    `https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=co&limit=${limit}&addressdetails=1&q=${encodeURIComponent(
      q,
    )}`,
    { headers: { "Accept-Language": "es" } },
  );
  const data = await r.json();
  return Array.isArray(data) ? data : [];
}

export default function MapaDireccion({
  direccion,
  barrio,
  ciudad,
  referencia,
  puntoVenta,
  horeca,
  lat,
  lng,
  onUbicacion,
  onBarrio,
  onCiudad,
  onPuntoVenta,
  ocultarPuntos,
}: {
  direccion: string;
  barrio: string;
  ciudad: string;
  /** Referencia del cliente (para buscar el conjunto/edificio en el mapa). */
  referencia?: string;
  /** Punto de venta asignado al cliente (viene del Excel de importación). */
  puntoVenta?: string;
  /** ¿El cliente es HORECA? En ese caso se mantiene siempre el asignado. */
  horeca?: boolean;
  lat: number | null;
  lng: number | null;
  onUbicacion: (lat: number | null, lng: number | null) => void;
  onBarrio?: (barrio: string) => void;
  onCiudad?: (ciudad: string) => void;
  /** Fija el punto de venta del cliente (al elegir asignado/recomendado). */
  onPuntoVenta?: (nombre: string) => void;
  /** Oculta la recomendación de puntos (p. ej. al ubicar un punto de venta). */
  ocultarPuntos?: boolean;
}) {
  const [abierto, setAbierto] = useState(lat != null && lng != null);
  const [cargando, setCargando] = useState(false);
  const [estado, setEstado] = useState<Estado | null>(null);
  const [sugerencia, setSugerencia] = useState("");
  // Sugerencias de dirección (variantes) en modal emergente.
  const [sugerencias, setSugerencias] = useState<SugerenciaGeo[]>([]);
  const [modalSug, setModalSug] = useState(false);
  const [cargandoSug, setCargandoSug] = useState(false);

  // Ubicaciones de todos los puntos (para recomendar el más cercano al cliente).
  const [puntos, setPuntos] = useState<PuntoUbicacion[]>([]);
  useEffect(() => {
    if (ocultarPuntos) return;
    puntosUbicaciones()
      .then(setPuntos)
      .catch(() => setPuntos([]));
  }, [ocultarPuntos]);

  // Punto recomendado: el más cercano a la ubicación del cliente.
  const recomendado =
    lat != null && lng != null ? puntoMasCercano(puntos, lat, lng) : null;
  const norm = (s?: string | null) =>
    (s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
  // ¿El asignado ES el más cercano?
  const asignadoEsCercano =
    !!recomendado && !!puntoVenta && norm(recomendado.punto.nombre) === norm(puntoVenta);

  // Hay información previa suficiente para pedir sugerencias.
  const hayInfo = Boolean(
    direccion.trim() || barrio.trim() || ciudad.trim(),
  );

  // El mensaje (toast) se cierra solo a los 5 segundos.
  useEffect(() => {
    if (!estado) return;
    const t = setTimeout(() => setEstado(null), 5000);
    return () => clearTimeout(t);
  }, [estado]);

  async function geocodificar() {
    if (!direccion.trim() && !barrio.trim() && !ciudad.trim()) {
      setEstado({ tipo: "error", msg: "Escribe la dirección primero." });
      return;
    }
    const consultas = construirConsultas(direccion, barrio, ciudad, extraerConjunto(referencia));
    setCargando(true);
    setEstado(null);
    try {
      const conjunto = extraerConjunto(referencia);
      // 1) Si hay nombre de conjunto/edificio, se busca primero como punto de
      // interés: suele ubicar con más precisión que la calle + placa.
      if (conjunto) {
        const qsCo = [
          [conjunto, barrio, ciudad, "Colombia"],
          [conjunto, ciudad, "Colombia"],
        ].map((a) => a.filter(Boolean).join(", "));
        for (const q of qsCo) {
          const data = await consultarNominatim(q, 5);
          if (data.length > 0) {
            const s = data[0];
            const la = parseFloat(s.lat);
            const lo = parseFloat(s.lon);
            if (!Number.isNaN(la) && !Number.isNaN(lo)) {
              onUbicacion(la, lo);
              setSugerencia(s.display_name ?? "");
              setAbierto(true);
              setEstado({
                tipo: "ok",
                msg: "Ubicado por el nombre del conjunto/edificio. Ajusta el pin si hace falta.",
              });
              setCargando(false);
              return;
            }
          }
        }
      }
      // 2) Se prioriza un resultado a nivel de CALLE (con `road`); solo si ninguna
      // consulta ubica la vía se cae al sector/barrio como respaldo.
      let conCalle: SugerenciaGeo | null = null;
      let respaldo: SugerenciaGeo | null = null;
      for (const q of consultas) {
        const data = await consultarNominatim(q, 5);
        const calle = data.find((s) => s.address?.road);
        if (calle) {
          conCalle = calle;
          break;
        }
        if (!respaldo && data.length > 0) respaldo = data[0];
      }
      const encontrado = conCalle ?? respaldo;
      if (encontrado) {
        const la = parseFloat(encontrado.lat);
        const lo = parseFloat(encontrado.lon);
        onUbicacion(la, lo);
        setSugerencia(encontrado.display_name ?? "");
        setAbierto(true);
        const a = encontrado.address ?? {};
        const barrioReal =
          a.neighbourhood ||
          a.suburb ||
          a.quarter ||
          a.residential ||
          a.city_district ||
          "";
        if (!conCalle) {
          // Solo se pudo ubicar el sector/barrio, no la vía exacta.
          setEstado({
            tipo: "info",
            msg: "Solo se ubicó el sector (la vía exacta no está en el mapa). Verifícala en el mapa o usa 'Ver sugerencias'.",
          });
        } else if (
          barrio.trim() &&
          barrioReal &&
          normaliza(barrioReal) !== normaliza(barrio)
        ) {
          // La vía existe, pero en un barrio distinto al que se escribió.
          setEstado({
            tipo: "info",
            msg: `Ojo: esa vía figura en el barrio "${barrioReal}", no en "${barrio}". Revisa "Ver sugerencias".`,
          });
        } else {
          setEstado({ tipo: "ok", msg: "Dirección encontrada en el mapa." });
        }
      } else {
        setAbierto(true);
        setEstado({
          tipo: "error",
          msg: "No se encontró la dirección. Ubícala manualmente en el mapa.",
        });
      }
    } catch {
      setEstado({ tipo: "error", msg: "No se pudo consultar el mapa." });
    } finally {
      setCargando(false);
    }
  }

  function quitarUbicacion() {
    onUbicacion(null, null);
    setSugerencia("");
    setEstado(null);
    setAbierto(false);
  }

  // Busca varias coincidencias (variantes) para que la persona elija la correcta.
  async function verSugerencias() {
    if (!hayInfo) {
      setEstado({
        tipo: "error",
        msg: "Escribe algo de la dirección, barrio o ciudad para poder sugerir.",
      });
      return;
    }
    const consultas = construirConsultas(direccion, barrio, ciudad, extraerConjunto(referencia));
    setCargandoSug(true);
    setEstado(null);
    try {
      // Se combinan varias consultas (empezando por la vía SIN barrio) para
      // descubrir en qué barrio existe realmente la dirección. Se prioriza
      // mostrar las que ubican una VÍA (road) sobre las de solo sector.
      const vistos = new Set<string>();
      const acumulado: SugerenciaGeo[] = [];
      for (const q of consultas) {
        const data = await consultarNominatim(q, 8);
        for (const s of data) {
          const clave = `${s.lat},${s.lon}`;
          if (vistos.has(clave)) continue;
          vistos.add(clave);
          acumulado.push(s);
        }
        // Con suficientes resultados a nivel de calle, no seguimos consultando.
        if (acumulado.filter((s) => s.address?.road).length >= 6) break;
      }
      // Primero las que ubican una VÍA real; luego las de solo sector/barrio.
      acumulado.sort(
        (a, b) => (a.address?.road ? 0 : 1) - (b.address?.road ? 0 : 1),
      );
      const lista = acumulado.slice(0, 8);
      setSugerencias(lista);
      setModalSug(true);
      if (lista.length === 0) {
        setEstado({
          tipo: "error",
          msg: "No se encontraron sugerencias. Ubica la dirección manualmente en el mapa.",
        });
      }
    } catch {
      setEstado({ tipo: "error", msg: "No se pudo consultar las sugerencias." });
    } finally {
      setCargandoSug(false);
    }
  }

  // Aplica una sugerencia: marca la ubicación y sobrescribe barrio y ciudad.
  function elegirSugerencia(s: SugerenciaGeo) {
    const la = parseFloat(s.lat);
    const lo = parseFloat(s.lon);
    if (!Number.isNaN(la) && !Number.isNaN(lo)) onUbicacion(la, lo);
    const a = s.address ?? {};
    const nuevoBarrio =
      a.neighbourhood ||
      a.suburb ||
      a.quarter ||
      a.residential ||
      a.city_district ||
      "";
    const nuevaCiudad =
      a.city || a.town || a.municipality || a.village || a.county || "";
    if (nuevoBarrio && onBarrio) onBarrio(nuevoBarrio);
    if (nuevaCiudad && onCiudad) onCiudad(nuevaCiudad);
    setSugerencia(s.display_name ?? "");
    setAbierto(true);
    setModalSug(false);
    setEstado({
      tipo: "ok",
      msg: "Sugerencia aplicada. Revisa y presiona Guardar.",
    });
  }

  const centroLat = lat ?? CENTRO_POR_DEFECTO.lat;
  const centroLng = lng ?? CENTRO_POR_DEFECTO.lng;
  const tieneUbicacion = lat != null && lng != null;

  return (
    <div className="rounded-xl border border-brand-brown/10 bg-brand-cream-soft/40 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-medium text-brand-brown/70">
          Ubicación en el mapa
        </span>
        <div className="flex items-center gap-2">
          {(tieneUbicacion || abierto) && (
            <button
              type="button"
              onClick={quitarUbicacion}
              title="Quitar la ubicación del mapa"
              className="text-xs font-medium text-brand-brown/50 hover:text-red-600 hover:underline"
            >
              Quitar
            </button>
          )}
          <button
            type="button"
            onClick={verSugerencias}
            disabled={cargandoSug || !hayInfo}
            title={
              hayInfo
                ? "Ver sugerencias de dirección para corregirla"
                : "Escribe algo de la dirección, barrio o ciudad primero"
            }
            className="inline-flex items-center gap-1.5 rounded-lg border border-brand-amber/50 bg-white px-3 py-1.5 text-xs font-semibold text-brand-amber shadow-sm transition hover:bg-brand-amber/10 disabled:opacity-40"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-3.5 w-3.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
            </svg>
            {cargandoSug ? "Buscando…" : "Ver sugerencias"}
          </button>
          <button
            type="button"
            onClick={geocodificar}
            disabled={cargando}
            title="Ubicar la dirección en el mapa"
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-amber px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-brand-amber/90 disabled:opacity-50"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-3.5 w-3.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
            </svg>
            {cargando ? "Buscando…" : "Ubicar dirección"}
          </button>
        </div>
      </div>

      {estado && (
        <div
          className={`fixed right-4 top-4 z-[1300] max-w-xs rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-lg ${
            estado.tipo === "ok"
              ? "bg-green-600"
              : estado.tipo === "error"
                ? "bg-red-600"
                : "bg-amber-500"
          }`}
          role="status"
        >
          {estado.msg}
        </div>
      )}

      {abierto && (
        <div className="mt-2 overflow-hidden rounded-xl">
          <MapaLeaflet
            lat={centroLat}
            lng={centroLng}
            onMover={(la, lo) => {
              onUbicacion(la, lo);
              setEstado({ tipo: "ok", msg: "Ubicación ajustada manualmente. Presiona Guardar." });
            }}
          />
          <p className="mt-1 text-[0.7rem] text-brand-brown/50">
            Arrastra el pin o haz clic en el mapa para ajustar la ubicación exacta.
          </p>
          {sugerencia && (
            <p className="mt-1 line-clamp-1 text-[0.7rem] text-brand-brown/60">
              <span className="font-medium">Mapa:</span> {sugerencia}
            </p>
          )}
          {tieneUbicacion && (
            <p className="mt-0.5 text-[0.7rem] text-brand-brown/40">
              Lat {lat!.toFixed(6)}, Lng {lng!.toFixed(6)}
            </p>
          )}
        </div>
      )}

      {/* Punto de venta: asignado (del Excel) y recomendado (más cercano). */}
      {(puntoVenta?.trim() || recomendado) && (
        <div className="mt-2 space-y-2 rounded-lg border border-brand-brown/15 bg-brand-cream-soft/50 p-2.5 text-xs">
          {/* Fila: asignado + recomendado, lado a lado */}
          <div className="flex flex-wrap items-stretch gap-2">
            {puntoVenta?.trim() && (
              <div className="flex-1 rounded-md border border-brand-brown/15 bg-white px-2.5 py-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-brand-brown/50">
                  Punto asignado
                </p>
                <p className="font-semibold text-brand-wine">{puntoVenta}</p>
              </div>
            )}
            {recomendado && (
              <div
                className={`flex-1 rounded-md border px-2.5 py-1.5 ${
                  asignadoEsCercano
                    ? "border-emerald-300 bg-emerald-50"
                    : "border-brand-amber/40 bg-brand-amber/10"
                }`}
              >
                <p className="text-[10px] font-semibold uppercase tracking-wide text-brand-brown/50">
                  Recomendado (más cercano)
                </p>
                <p className="font-semibold text-brand-black">
                  {recomendado.punto.nombre}
                  <span className="ml-1 font-normal text-brand-brown/50">
                    · {recomendado.km.toFixed(1)} km
                  </span>
                </p>
              </div>
            )}
          </div>

          {/* Mensaje/acciones según el caso */}
          {recomendado && horeca ? (
            <p className="text-[11px] text-brand-brown/60">
              Cliente <b>HORECA</b>: se mantiene el punto <b>asignado</b>.
            </p>
          ) : recomendado && asignadoEsCercano ? (
            <p className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-3.5 w-3.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
              </svg>
              El punto asignado también es el más cercano.
            </p>
          ) : recomendado && onPuntoVenta ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] text-brand-brown/60">Usar:</span>
              {puntoVenta?.trim() && (
                <button
                  type="button"
                  onClick={() => onPuntoVenta(puntoVenta)}
                  className="rounded-md border border-brand-wine/30 bg-white px-2.5 py-1 text-[11px] font-semibold text-brand-wine transition hover:bg-brand-wine/5"
                >
                  Asignado ({puntoVenta})
                </button>
              )}
              <button
                type="button"
                onClick={() => onPuntoVenta(recomendado.punto.nombre)}
                className="rounded-md border border-brand-amber/50 bg-brand-amber/10 px-2.5 py-1 text-[11px] font-semibold text-brand-amber transition hover:bg-brand-amber/20"
              >
                Recomendado ({recomendado.punto.nombre})
              </button>
            </div>
          ) : null}
        </div>
      )}

      {modalSug && (
        <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-brand-black/50 p-4">
          <div className="flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-brand-brown/10 px-5 py-4">
              <div>
                <h3 className="font-serif text-lg font-bold text-brand-wine">
                  Sugerencias de dirección
                </h3>
                <p className="text-xs text-brand-brown/50">
                  Elige la que más se parezca; se corregirá barrio, ciudad y ubicación.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModalSug(false)}
                className="rounded-lg p-1.5 text-brand-brown/50 hover:bg-brand-cream-soft"
                aria-label="Cerrar"
                title="Cerrar"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Lo que escribió la persona, para comparar con las sugerencias. */}
            <div className="border-b border-brand-brown/10 bg-brand-cream-soft/40 px-5 py-3">
              <p className="text-[11px] font-bold uppercase tracking-wide text-brand-brown/50">
                Lo que escribiste
              </p>
              <p className="mt-0.5 text-sm font-semibold text-brand-black">
                {direccion.trim() || "—"}
              </p>
              <p className="text-xs text-brand-brown/60">
                {[barrio, ciudad].filter((x) => x.trim()).join(" · ") ||
                  "Sin barrio ni ciudad"}
              </p>
              <p className="mt-1 text-[11px] text-brand-brown/45">
                Compara con cada sugerencia para ver qué cambió (número, barrio o ciudad).
              </p>
            </div>

            <div className="flex-1 overflow-y-auto px-3 py-2">
              {sugerencias.length === 0 ? (
                <p className="px-2 py-8 text-center text-sm text-brand-brown/50">
                  No se encontraron sugerencias para esa dirección.
                </p>
              ) : (
                sugerencias.map((s, i) => {
                  const a = s.address ?? {};
                  const viaSug = [a.road, a.house_number]
                    .filter(Boolean)
                    .join(" # ");
                  const bSug =
                    a.neighbourhood || a.suburb || a.quarter || a.residential || a.city_district || "";
                  const ciSug =
                    a.city || a.town || a.municipality || a.village || a.county || "";
                  // ¿Coincide con lo que escribió? (para señalar la diferencia)
                  const barrioIgual = bSug && normaliza(bSug) === normaliza(barrio);
                  const ciudadIgual = ciSug && normaliza(ciSug) === normaliza(ciudad);
                  return (
                    <button
                      key={`${s.lat}-${s.lon}-${i}`}
                      type="button"
                      onClick={() => elegirSugerencia(s)}
                      title="Usar esta sugerencia"
                      className="mb-1.5 flex w-full items-start gap-2 rounded-xl border border-brand-brown/10 bg-white px-3 py-2 text-left transition hover:border-brand-amber/50 hover:bg-brand-amber/5"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="mt-0.5 h-4 w-4 shrink-0 text-brand-amber">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
                      </svg>
                      <span className="min-w-0 flex-1 space-y-0.5">
                        <CampoSugerencia
                          etiqueta="Vía"
                          valor={viaSug || "No la ubicó (solo el sector)"}
                          resaltar={!viaSug}
                        />
                        <CampoSugerencia
                          etiqueta="Barrio"
                          valor={bSug || "—"}
                          igual={Boolean(barrioIgual)}
                          distinto={Boolean(bSug) && !barrioIgual && Boolean(barrio.trim())}
                        />
                        <CampoSugerencia
                          etiqueta="Ciudad"
                          valor={ciSug || "—"}
                          igual={Boolean(ciudadIgual)}
                          distinto={Boolean(ciSug) && !ciudadIgual && Boolean(ciudad.trim())}
                        />
                        <span className="mt-0.5 block text-[10px] leading-snug text-brand-brown/40">
                          {s.display_name}
                        </span>
                      </span>
                    </button>
                  );
                })
              )}
            </div>

            <div className="flex justify-end border-t border-brand-brown/10 px-5 py-3">
              <button
                type="button"
                onClick={() => setModalSug(false)}
                className="rounded-xl border border-brand-brown/15 px-4 py-2 text-sm font-semibold text-brand-brown hover:bg-brand-cream-soft"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Fila etiqueta: valor de una sugerencia, con marca de coincide / cambia. */
function CampoSugerencia({
  etiqueta,
  valor,
  igual,
  distinto,
  resaltar,
}: {
  etiqueta: string;
  valor: string;
  igual?: boolean;
  distinto?: boolean;
  resaltar?: boolean;
}) {
  return (
    <span className="flex items-center gap-1.5 text-[12px] leading-tight">
      <span className="w-11 shrink-0 text-[10px] font-bold uppercase tracking-wide text-brand-brown/40">
        {etiqueta}
      </span>
      <span
        className={`min-w-0 flex-1 truncate font-medium ${
          distinto || resaltar ? "text-amber-700" : "text-brand-black"
        }`}
      >
        {valor}
      </span>
      {igual && (
        <span className="shrink-0 rounded bg-green-100 px-1.5 py-0.5 text-[9px] font-bold uppercase text-green-700">
          Coincide
        </span>
      )}
      {distinto && (
        <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold uppercase text-amber-700">
          Cambia
        </span>
      )}
    </span>
  );
}
