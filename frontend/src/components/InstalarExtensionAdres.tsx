"use client";

import { useEffect, useRef, useState } from "react";
import {
  URL_EXTENSION_EDGE,
  URL_EXTENSION_ZIP,
  detectarExtension,
  detectarNavegador,
  urlTiendaPara,
  type EstadoExtension,
} from "@/lib/extension-adres";

/**
 * Modal para instalar (o actualizar) la extensión de validación de cédula en
 * ADRES. Si el navegador tiene tienda configurada (Edge: tienda de Microsoft,
 * gratis) la abre y basta con «Obtener»; si no, descarga el .zip desde
 * SIGCOMPRO y explica cómo cargarlo. Mientras está abierto detecta la
 * instalación solo y se cierra.
 */
export default function InstalarExtensionAdres({
  estado,
  versionDisponible,
  onCerrar,
  onInstalada,
}: {
  estado: EstadoExtension;
  versionDisponible: string | null;
  onCerrar: () => void;
  onInstalada: (e: EstadoExtension) => void;
}) {
  const nav = detectarNavegador();
  const tienda = urlTiendaPara(nav);
  const actualizar = estado.instalada;
  const [tiendaAbierta, setTiendaAbierta] = useState(false);
  const listo = useRef(false);
  const alInstalar = useRef(onInstalada);
  useEffect(() => {
    alInstalar.current = onInstalada;
  }, [onInstalada]);

  // Detecta la instalación sola (la extensión se conecta a esta pestaña al
  // instalarse): al aparecer, se cierra el modal sin pulsar nada.
  useEffect(() => {
    if (!nav.compatible) return;
    const t = setInterval(async () => {
      if (listo.current) return;
      const e = await detectarExtension(300);
      if (e.instalada && (!actualizar || e.version !== estado.version) && !listo.current) {
        listo.current = true;
        alInstalar.current(e);
      }
    }, 2000);
    return () => clearInterval(t);
  }, [nav.compatible, actualizar, estado.version]);
  const [descargado, setDescargado] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [verificando, setVerificando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  async function copiarPagina() {
    try {
      await navigator.clipboard.writeText(nav.paginaExtensiones);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      /* el usuario puede escribirla */
    }
  }

  async function verificar() {
    setVerificando(true);
    setAviso(null);
    const e = await detectarExtension(800);
    setVerificando(false);
    if (e.instalada && (!actualizar || e.version !== estado.version)) {
      onInstalada(e);
      return;
    }
    setAviso(
      actualizar
        ? "Todavía se ve la versión anterior. Pulsa ↻ en la extensión (o vuelve a cargarla) y recarga SIGCOMPRO con F5."
        : "Todavía no se detecta. Revisa los pasos y recarga SIGCOMPRO con F5.",
    );
  }

  return (
    <div className="fixed inset-0 z-[85] flex items-center justify-center bg-brand-black/50 p-4">
      <div className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-brand-brown/10 px-5 py-4">
          <div>
            <h2 className="font-serif text-lg font-bold text-brand-wine">
              {actualizar ? "Actualizar extensión de validación" : "Instalar extensión de validación"}
            </h2>
            <p className="text-xs text-brand-black/60">
              SIGCOMPRO · Validar cédula en ADRES
              {versionDisponible && <> · versión {versionDisponible}</>}
              {actualizar && estado.version && <> (instalada: {estado.version})</>}
            </p>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            className="rounded-lg p-1.5 text-brand-black hover:bg-brand-cream-soft"
            aria-label="Cerrar"
            title="Cerrar"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4 text-sm text-brand-black">
          <p className="text-xs text-brand-black/70">
            Con la extensión, el botón <b>Validar</b> consulta la cédula en ADRES en segundo plano y trae nombres y
            apellidos solos. Se instala una sola vez en este navegador.
          </p>

          {!nav.compatible ? (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
              Este navegador no es compatible. Abre SIGCOMPRO en <b>Google Chrome</b>, <b>Brave</b> o <b>Microsoft Edge</b>{" "}
              para instalar la extensión.
            </p>
          ) : tienda ? (
            <div className="space-y-3">
              <a
                href={tienda}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setTiendaAbierta(true)}
                className="flex items-center justify-center gap-2 rounded-xl bg-brand-wine px-4 py-3 text-sm font-semibold text-white hover:bg-brand-wine/90"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                </svg>
                {actualizar ? "Abrir la tienda para actualizar" : "Instalar desde la tienda"}
              </a>
              <p className="text-center text-xs text-brand-black/70">
                {tiendaAbierta ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-brand-amber border-t-transparent" />
                    En la tienda pulsa <b>{nav.nombre === "Edge" ? "Obtener" : "Agregar a Chrome"}</b> y confirma. Esta ventana se cerrará sola.
                  </span>
                ) : (
                  <>
                    Se abre la tienda de {nav.nombre === "Edge" ? "Microsoft Edge" : "Chrome"}: pulsa{" "}
                    <b>{nav.nombre === "Edge" ? "Obtener" : "Agregar a Chrome"}</b> y confirma.
                  </>
                )}
              </p>
            </div>
          ) : (
            <>
            {URL_EXTENSION_EDGE && nav.nombre !== "Edge" && (
              <p className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-2.5 text-xs text-sky-900">
                <b>Más fácil:</b> abre SIGCOMPRO en <b>Microsoft Edge</b>; ahí la extensión se instala con un clic y se
                actualiza sola. O sigue estos pasos en {nav.nombre}:
              </p>
            )}
            <ol className="space-y-3">
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-wine text-xs font-bold text-white">1</span>
                <div className="flex-1">
                  <a
                    href={URL_EXTENSION_ZIP}
                    download="SIGCOMPRO-extension-adres.zip"
                    onClick={() => setDescargado(true)}
                    className="inline-flex items-center gap-2 rounded-xl bg-brand-wine px-4 py-2 text-sm font-semibold text-white hover:bg-brand-wine/90"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                    </svg>
                    {descargado ? "Descargar de nuevo" : "Descargar extensión"}
                  </a>
                  <p className="mt-1 text-xs text-brand-black/70">
                    Descomprime el archivo en <b>Documentos</b> (clic derecho → <b>Extraer todo</b>). Queda la carpeta{" "}
                    <b>SIGCOMPRO-extension-adres</b>: no la borres.
                    {actualizar && " Si ya la tenías, reemplaza la carpeta anterior."}
                  </p>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-wine text-xs font-bold text-white">2</span>
                <div className="flex-1">
                  <p>
                    Abre una pestaña nueva, pega{" "}
                    <button
                      type="button"
                      onClick={copiarPagina}
                      title="Copiar"
                      className="rounded bg-brand-cream-soft px-1.5 py-0.5 font-mono text-xs font-semibold text-brand-wine hover:bg-brand-cream"
                    >
                      {nav.paginaExtensiones}
                    </button>{" "}
                    en la barra de direcciones y pulsa Enter.
                  </p>
                  <p className="text-xs text-brand-black/60">{copiado ? "¡Copiado! Pégalo con Ctrl+V." : "Clic en el texto para copiarlo."}</p>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-wine text-xs font-bold text-white">3</span>
                <p className="flex-1">
                  {actualizar ? (
                    <>
                      En la tarjeta «SIGCOMPRO · Validar cédula en ADRES» pulsa <b>↻</b> (recargar). Si la carpeta cambió de
                      lugar, quítala y vuelve a cargarla como en el paso 4.
                    </>
                  ) : (
                    <>
                      Activa <b>Modo de desarrollador</b> ({nav.nombre === "Edge" ? "a la izquierda" : "arriba a la derecha"}).
                    </>
                  )}
                </p>
              </li>
              {!actualizar && (
                <li className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-wine text-xs font-bold text-white">4</span>
                  <p className="flex-1">
                    Pulsa <b>Cargar extensión sin empaquetar</b> (o <b>Cargar desempaquetada</b>) y elige la carpeta{" "}
                    <b>SIGCOMPRO-extension-adres</b>.
                  </p>
                </li>
              )}
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-wine text-xs font-bold text-white">
                  {actualizar ? 4 : 5}
                </span>
                <p className="flex-1">
                  Vuelve aquí: SIGCOMPRO la detecta solo (o pulsa <b>Ya la instalé</b>).
                </p>
              </li>
            </ol>
            </>
          )}

          {aviso && <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">{aviso}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-brand-brown/10 px-5 py-4">
          <button
            type="button"
            onClick={onCerrar}
            className="rounded-xl border border-brand-brown/15 px-4 py-2 text-sm font-semibold text-brand-brown hover:bg-brand-cream-soft"
          >
            Ahora no
          </button>
          {nav.compatible && (
            <button
              type="button"
              onClick={verificar}
              disabled={verificando}
              className="rounded-xl bg-brand-wine px-4 py-2 text-sm font-semibold text-white hover:bg-brand-wine/90 disabled:opacity-60"
            >
              {verificando ? "Verificando…" : "Ya la instalé"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
