"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { marcarNovedadVista } from "@/lib/novedades";
import type { DemoNovedad, Novedad, VersionNovedades } from "@/novedades/catalogo";
import { Escenario, useLineaDeTiempo, type DemoDef } from "./Escenario";
import css from "./novedades.module.css";
import fundacion from "./demos/fundacion";
import validarCedula from "./demos/validar-cedula";
import importarExcel from "./demos/importar-excel";
import replicas from "./demos/replicas";
import reenviarDrivin from "./demos/reenviar-drivin";
import menuPerfil from "./demos/menu-perfil";
import kilosComanda from "./demos/kilos-comanda";
import ordenAlternas from "./demos/orden-alternas";
import noGestionado from "./demos/no-gestionado";
import syncDirecciones from "./demos/sync-direcciones";
import cerrarScroll from "./demos/cerrar-scroll";

const DEMOS: Record<DemoNovedad, DemoDef> = {
  fundacion,
  "validar-cedula": validarCedula,
  "importar-excel": importarExcel,
  replicas,
  "reenviar-drivin": reenviarDrivin,
  "menu-perfil": menuPerfil,
  "kilos-comanda": kilosComanda,
  "orden-alternas": ordenAlternas,
  "no-gestionado": noGestionado,
  "sync-direcciones": syncDirecciones,
  "cerrar-scroll": cerrarScroll,
};

type Item = Novedad & { version: string; fecha: string };

function Diapositiva({ item, onRepetir }: { item: Item; onRepetir: () => void }) {
  const demo = DEMOS[item.demo];
  const paso = useLineaDeTiempo(demo.pasos);
  const resalta = demo.pasos[paso]?.resalta ?? -1;
  const url = typeof demo.url === "function" ? demo.url(paso) : demo.url;
  const Escena = demo.Escena;

  return (
    <div className={`grid min-h-0 flex-1 gap-5 overflow-y-auto p-4 sm:p-6 md:grid-cols-[1.35fr_1fr] ${css.entradaDiapositiva}`}>
      <div className="h-[290px] sm:h-[340px] md:h-[400px]">
        <Escenario url={url} pasos={demo.pasos} paso={paso}>
          <Escena paso={paso} />
        </Escenario>
      </div>

      <div className="flex min-w-0 flex-col">
        <span className="w-fit rounded-full bg-brand-wine/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-brand-wine">
          {item.modulo}
        </span>
        <h2 className="mt-2 font-serif text-xl font-bold leading-tight text-brand-wine sm:text-2xl">{item.titulo}</h2>
        <p className="mt-1.5 text-sm text-brand-black/75">{item.resumen}</p>

        <ol className="mt-4 space-y-2">
          {item.puntos.map((p, i) => {
            const activo = i === resalta;
            return (
              <li
                key={i}
                className={`flex gap-2.5 rounded-xl border px-3 py-2 text-[13px] leading-snug transition-all duration-500 ${
                  activo
                    ? "translate-x-1 border-brand-amber/60 bg-brand-amber/10 text-brand-black shadow-sm"
                    : "border-transparent text-brand-black/55"
                }`}
              >
                <span
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold transition-colors duration-500 ${
                    activo ? "bg-brand-amber text-white" : "bg-brand-brown/10 text-brand-brown"
                  }`}
                >
                  {i + 1}
                </span>
                <span>{p}</span>
              </li>
            );
          })}
        </ol>

        {item.nota && (
          <p className="mt-3 rounded-xl border border-brand-gold/40 bg-brand-cream-soft px-3 py-2 text-xs text-brand-brown">
            💡 {item.nota}
          </p>
        )}

        <button
          type="button"
          onClick={onRepetir}
          className="mt-3 w-fit text-xs font-semibold text-brand-wine hover:underline"
        >
          ↻ Repetir animación
        </button>
      </div>
    </div>
  );
}

export default function NovedadesModal({
  versiones,
  nombre,
  repaso = false,
  onCerrar,
}: {
  versiones: VersionNovedades[];
  nombre?: string;
  /** Abierto a pedido desde el menú de perfil (no es la presentación pendiente). */
  repaso?: boolean;
  onCerrar: () => void;
}) {
  const items: Item[] = versiones.flatMap((v) => v.novedades.map((n) => ({ ...n, version: v.version, fecha: v.fecha })));
  const [i, setI] = useState(0);
  const [reinicio, setReinicio] = useState(0);
  const [cerrando, setCerrando] = useState(false);
  const item = items[i];
  const ultimo = i === items.length - 1;
  const primerNombre = (nombre ?? "").trim().split(/\s+/)[0];

  async function terminar() {
    setCerrando(true);
    await Promise.all(versiones.map((v) => marcarNovedadVista(v.version).catch(() => undefined)));
    onCerrar();
  }

  function siguiente() {
    if (ultimo) void terminar();
    else setI((x) => Math.min(x + 1, items.length - 1));
  }

  useEffect(() => {
    const previo = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previo;
    };
  }, []);

  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" && !ultimo) setI((x) => Math.min(x + 1, items.length - 1));
      if (e.key === "ArrowLeft") setI((x) => Math.max(x - 1, 0));
    };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [ultimo, items.length]);

  if (!item) return null;

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-brand-black/60 p-2 backdrop-blur-sm sm:p-4">
      <div className={`flex max-h-[96vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl ${css.pop}`}>
        <div className={`relative px-5 pb-3 pt-4 text-white sm:px-6 ${css.brillo}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/15 text-xl ${css.chispa}`}>✨</span>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/80">
                  Novedades de SIGCOMPRO · Actualización del {item.fecha}
                </p>
                <p className="font-serif text-lg font-bold leading-tight sm:text-xl">
                  {primerNombre ? `Hola, ${primerNombre}: ` : ""}esto es lo nuevo
                </p>
                <p className="mt-0.5 flex items-center gap-1 text-[11px] font-medium text-white/75">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m17.25 6.75 5.25 5.25-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5" />
                  </svg>
                  Desarrollado por <span className="font-bold text-white">Oscar Hernandez</span>
                </p>
              </div>
            </div>
            <span className="shrink-0 rounded-full bg-white/15 px-3 py-1 text-xs font-bold">
              {i + 1} / {items.length}
            </span>
          </div>
          <div className="mt-3 flex gap-1.5">
            {items.map((it, k) => (
              <button
                key={it.id + it.version}
                type="button"
                onClick={() => setI(k)}
                title={it.titulo}
                className={`h-1.5 flex-1 rounded-full transition-colors duration-500 ${k <= i ? "bg-white" : "bg-white/30 hover:bg-white/50"}`}
              />
            ))}
          </div>
        </div>

        <Diapositiva key={`${item.version}-${item.id}-${reinicio}`} item={item} onRepetir={() => setReinicio((r) => r + 1)} />

        <div className="flex items-center justify-between gap-3 border-t border-brand-brown/10 bg-brand-cream-soft/60 px-4 py-3 sm:px-6">
          <button
            type="button"
            onClick={onCerrar}
            className="text-xs font-semibold text-brand-black/50 hover:text-brand-black"
            title={repaso ? "Cerrar novedades" : "Se volverá a mostrar la próxima vez que entres"}
          >
            {repaso ? "Cerrar" : "Ver más tarde"}
          </button>
          <div className="flex items-center gap-2">
            {i > 0 && (
              <button
                type="button"
                onClick={() => setI((x) => Math.max(x - 1, 0))}
                className="rounded-xl border border-brand-brown/15 bg-white px-4 py-2 text-sm font-semibold text-brand-brown hover:bg-brand-cream-soft"
              >
                ← Anterior
              </button>
            )}
            <button
              type="button"
              onClick={siguiente}
              disabled={cerrando}
              className="rounded-xl bg-brand-wine px-5 py-2 text-sm font-semibold text-white shadow-md shadow-brand-wine/20 transition hover:bg-brand-wine-dark disabled:opacity-60"
            >
              {ultimo ? (cerrando ? "Guardando…" : "¡Entendido, terminar!") : "Entendido →"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
