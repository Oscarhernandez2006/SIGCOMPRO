"use client";

import dynamic from "next/dynamic";
import { useState } from "react";

const MapaLeaflet = dynamic(() => import("./MapaLeaflet"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[170px] items-center justify-center rounded-xl bg-brand-cream-soft text-sm text-brand-brown/50">
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

export default function MapaDireccion({
  direccion,
  barrio,
  ciudad,
  lat,
  lng,
  onUbicacion,
}: {
  direccion: string;
  barrio: string;
  ciudad: string;
  lat: number | null;
  lng: number | null;
  onUbicacion: (lat: number | null, lng: number | null) => void;
}) {
  const [abierto, setAbierto] = useState(lat != null && lng != null);
  const [cargando, setCargando] = useState(false);
  const [estado, setEstado] = useState<Estado | null>(null);
  const [sugerencia, setSugerencia] = useState("");

  async function geocodificar() {
    if (!direccion.trim()) {
      setEstado({ tipo: "error", msg: "Escribe la dirección primero." });
      return;
    }
    const partes = [direccion, barrio, ciudad, "Colombia"].filter((p) =>
      p.trim(),
    );
    setCargando(true);
    setEstado(null);
    try {
      const q = encodeURIComponent(partes.join(", "));
      const r = await fetch(
        `https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=co&limit=1&addressdetails=1&q=${q}`,
        { headers: { "Accept-Language": "es" } },
      );
      const data = await r.json();
      if (Array.isArray(data) && data.length > 0) {
        const it = data[0];
        const la = parseFloat(it.lat);
        const lo = parseFloat(it.lon);
        onUbicacion(la, lo);
        setSugerencia(it.display_name ?? "");
        setAbierto(true);
        setEstado({ tipo: "ok", msg: "Dirección encontrada en el mapa." });
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
              className="text-xs font-medium text-brand-brown/50 hover:text-red-600 hover:underline"
            >
              Quitar
            </button>
          )}
          <button
            type="button"
            onClick={geocodificar}
            disabled={cargando}
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
          className={`mt-2 rounded-lg px-3 py-2 text-xs ${
            estado.tipo === "ok"
              ? "bg-green-50 text-green-700"
              : estado.tipo === "error"
                ? "bg-red-50 text-red-700"
                : "bg-amber-50 text-amber-700"
          }`}
        >
          {estado.msg}
        </div>
      )}

      {abierto && (
        <div className="mt-2 overflow-hidden rounded-xl">
          <MapaLeaflet lat={centroLat} lng={centroLng} />
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
    </div>
  );
}
