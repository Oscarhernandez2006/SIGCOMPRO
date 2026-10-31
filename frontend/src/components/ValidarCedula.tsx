"use client";

import { useEffect, useState } from "react";
import { aNombrePropio, soloTexto } from "@/lib/format";
import { VALIDACION_ADRES_ACTIVA, detectarExtension } from "@/lib/extension-adres";

const URL_ADRES = "https://www.adres.gov.co/consulte-su-eps";

/** Limpia y formatea un nombre: solo texto, espacios simples y mayúscula inicial por palabra. */
function formatear(v: string): string {
  return aNombrePropio(soloTexto(v).replace(/\s+/g, " ").trim());
}

/**
 * Extrae número, nombres y apellidos del texto copiado de la tabla de
 * resultado de ADRES ("NÚMERO DE IDENTIFICACION 1044616409 / NOMBRES OSCAR
 * DAVID / APELLIDOS HERNANDEZ GUZMAN"), con o sin tabuladores/saltos de línea.
 */
function leerResultadoAdres(texto: string): { numero: string; nombres: string; apellidos: string } {
  const t = texto.replace(/\r/g, "").replace(/\u00a0/g, " ");
  const tomar = (etiqueta: RegExp) => {
    const m = t.match(etiqueta);
    return m ? m[1].replace(/[\t ]+/g, " ").trim() : "";
  };
  const numero = tomar(/N[ÚU]MERO\s+DE\s+IDENTIFICACI[ÓO]N\s*[:\t ]*\s*([0-9.\- ]+)/i).replace(/\D+/g, "");
  const nombres = tomar(/(?:^|\n|\t|\s)NOMBRES\s*[:\t ]*\s*([^\n\t]+?)(?=\s*(?:\n|\t|APELLIDOS|$))/i);
  const apellidos = tomar(/(?:^|\n|\t|\s)APELLIDOS\s*[:\t ]*\s*([^\n\t]+?)(?=\s*(?:\n|\t|FECHA|DEPARTAMENTO|MUNICIPIO|$))/i);
  return { numero, nombres, apellidos };
}

/**
 * Botón "Validar" junto al NIT / Cédula. Con la extensión instalada, ADRES se
 * abre con la cédula ya llena; la televenta solo pulsa «Consultar» y los
 * nombres/apellidos llegan solos al modal. Sin la extensión: se copia la
 * cédula, se abre ADRES y se pega el resultado. Al final se confirma con el
 * cliente y se llenan Nombres y Apellidos con mayúscula inicial.
 */
export default function ValidarCedula(props: {
  cedula: string;
  onConfirmar: (nombres: string, apellidos: string) => void;
}) {
  // Desactivada: no se muestra nada (ni se precarga ADRES).
  if (!VALIDACION_ADRES_ACTIVA) return null;
  return <ValidarCedulaActiva {...props} />;
}

function ValidarCedulaActiva({
  cedula,
  onConfirmar,
}: {
  cedula: string;
  onConfirmar: (nombres: string, apellidos: string) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [copiada, setCopiada] = useState(false);
  const [pegado, setPegado] = useState("");
  const [nombres, setNombres] = useState("");
  const [apellidos, setApellidos] = useState("");
  // Mostrar los campos para corregir nombres/apellidos (en automático van ocultos).
  const [editando, setEditando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  // Modo automático (extensión): esperando el resultado de ADRES.
  const [esperando, setEsperando] = useState(false);
  const [conExtension, setConExtension] = useState(false);
  const [manual, setManual] = useState(false);
  // Último paso que reporta la extensión (ej. "Cédula llenada", "Consultando…").
  const [paso, setPaso] = useState<string | null>(null);

  // Se consulta la cédula base: "1044616409-1" (dirección alterna del mismo
  // cliente) -> "1044616409". El campo del formulario se deja tal cual.
  const numero = cedula.split("-")[0].replace(/\D+/g, "");
  const conSufijo = cedula.trim() !== numero && /-\s*\d+\s*$/.test(cedula.trim());

  // Precarga: al abrir el formulario de cliente, la extensión deja ADRES listo
  // y minimizado para que «Validar» sea casi inmediato. Se libera al cerrarlo.
  useEffect(() => {
    let activo = true;
    let pedida = false;
    detectarExtension().then((ext) => {
      if (!activo || !ext.instalada) return;
      pedida = true;
      window.postMessage({ tipo: "SIGCOMPRO_ADRES_PRECARGAR" }, window.location.origin);
    });
    return () => {
      activo = false;
      if (pedida) window.postMessage({ tipo: "SIGCOMPRO_ADRES_CERRAR_PRECARGA" }, window.location.origin);
    };
  }, []);

  // Resultado que envía la extensión desde ADRES.
  useEffect(() => {
    if (!abierto) return;
    const alMensaje = (e: MessageEvent) => {
      if (e.source !== window || !e.data || typeof e.data !== "object") return;
      const d = e.data as { tipo?: string; numero?: string; nombres?: string; apellidos?: string; mensaje?: string };
      if (d.tipo === "SIGCOMPRO_ADRES_RESULTADO") {
        setEsperando(false);
        setNombres(formatear(d.nombres ?? ""));
        setApellidos(formatear(d.apellidos ?? ""));
        if (d.numero && numero && d.numero !== numero) {
          setAviso(`Ojo: ADRES devolvió la cédula ${d.numero}, no ${numero}.`);
        } else if (!d.nombres && !d.apellidos) {
          setAviso("ADRES no devolvió nombres. Escríbelos abajo.");
        } else {
          setAviso(null);
        }
      } else if (d.tipo === "SIGCOMPRO_ADRES_PROGRESO") {
        setPaso((d as { texto?: string }).texto ?? null);
      } else if (d.tipo === "SIGCOMPRO_ADRES_ERROR") {
        setAviso(`ADRES: ${d.mensaje ?? "no se pudo consultar"}`);
      }
    };
    window.addEventListener("message", alMensaje);
    return () => window.removeEventListener("message", alMensaje);
  }, [abierto, numero]);

  function abrirAdres() {
    window.open(URL_ADRES, "adres_consulta", "width=1100,height=800");
  }

  async function validar() {
    if (numero.length < 5) {
      setAviso("Escribe primero la cédula del cliente.");
      setAbierto(true);
      return;
    }
    setAviso(null);
    setPegado("");
    setNombres("");
    setApellidos("");
    setEditando(false);
    setManual(false);
    const ext = (await detectarExtension()).instalada;
    setConExtension(ext);
    setAbierto(true);
    if (ext) {
      // La extensión abre ADRES, llena la cédula y devuelve el resultado.
      setPaso("Abriendo ADRES…");
      setEsperando(true);
      window.postMessage({ tipo: "SIGCOMPRO_ADRES_CONSULTAR", cedula: numero }, window.location.origin);
      return;
    }
    try {
      await navigator.clipboard.writeText(numero);
      setCopiada(true);
    } catch {
      setCopiada(false);
    }
    abrirAdres();
  }

  function cerrar() {
    if (esperando) window.postMessage({ tipo: "SIGCOMPRO_ADRES_CANCELAR" }, window.location.origin);
    setEsperando(false);
    setAbierto(false);
  }

  function alPegar(texto: string) {
    setPegado(texto);
    const r = leerResultadoAdres(texto);
    if (r.nombres) setNombres(formatear(r.nombres));
    if (r.apellidos) setApellidos(formatear(r.apellidos));
    if (r.numero && numero && r.numero !== numero) {
      setAviso(`Ojo: el resultado pegado es de la cédula ${r.numero}, no de ${numero}.`);
    } else if (texto.trim() && !r.nombres && !r.apellidos) {
      setAviso("No se encontraron NOMBRES / APELLIDOS en el texto pegado. Escríbelos abajo.");
    } else {
      setAviso(null);
    }
  }

  const nombresF = formatear(nombres);
  const apellidosF = formatear(apellidos);
  const puedeConfirmar = !!nombresF && !!apellidosF;
  // Campos visibles: modo manual, al corregir o si ADRES no trajo los datos.
  const verCampos = !conExtension || manual || editando || !nombresF || !apellidosF;

  return (
    <>
      <button
        type="button"
        onClick={validar}
        title="Validar la cédula en ADRES y traer el nombre completo"
        className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-brand-wine/30 px-2.5 text-xs font-semibold text-brand-wine transition hover:bg-brand-wine/10"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
        </svg>
        Validar
      </button>

      {abierto && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-brand-black/50 p-4">
          <div className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-brand-brown/10 px-5 py-4">
              <div>
                <h2 className="font-serif text-lg font-bold text-brand-wine">Validar cédula</h2>
                <p className="text-xs text-brand-black/60">
                  Consulta en ADRES · Cédula {numero || "—"}
                  {conSufijo && <> (cliente {cedula.trim()}, dirección alterna)</>}
                </p>
              </div>
              <button
                type="button"
                onClick={cerrar}
                className="rounded-lg p-1.5 text-brand-black hover:bg-brand-cream-soft"
                aria-label="Cerrar"
                title="Cerrar"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
              {numero.length >= 5 && conExtension && esperando && (
                <div className="flex flex-col items-center gap-3 rounded-xl bg-brand-cream-soft/50 px-4 py-6 text-center">
                  <span className="h-9 w-9 animate-spin rounded-full border-4 border-brand-amber border-t-transparent" />
                  <p className="text-sm font-semibold text-brand-black">Consultando la cédula {numero} en ADRES…</p>
                  {paso && <p className="text-xs font-medium text-sky-700">{paso}</p>}
                  <p className="text-xs text-brand-black/70">
                    La consulta corre en segundo plano y los datos llegarán aquí solos en unos segundos. Si ADRES pide un reto del captcha, su ventana se mostrará para resolverlo.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setEsperando(false);
                      setManual(true);
                    }}
                    className="text-xs font-semibold text-brand-wine hover:underline"
                  >
                    Escribir los datos a mano
                  </button>
                </div>
              )}

              {numero.length >= 5 && !conExtension && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
                  <p className="font-semibold">
                    La extensión «SIGCOMPRO · Validar cédula en ADRES» no está instalada en este navegador, por eso la consulta es manual.
                  </p>
                  <p className="mt-1">
                    Para que sea automática: abre <b>chrome://extensions</b> (o brave://extensions / edge://extensions), activa <b>Modo de desarrollador</b>,
                    pulsa <b>Cargar extensión sin empaquetar</b> y elige la carpeta <b>extension-adres</b>. Luego recarga SIGCOMPRO (F5).
                  </p>
                </div>
              )}

              {numero.length >= 5 && !conExtension && (
                <ol className="space-y-1.5 rounded-xl bg-brand-cream-soft/50 px-4 py-3 text-xs text-brand-black">
                  <li>
                    <b>1.</b> Se abrió ADRES en otra ventana
                    {copiada ? (
                      <>
                        {" "}y la cédula <b>{numero}</b> quedó copiada: pégala en <b>Número</b> con <b>Ctrl+V</b>.
                      </>
                    ) : (
                      <> : escribe la cédula <b>{numero}</b> en <b>Número</b>.</>
                    )}{" "}
                    <button type="button" onClick={abrirAdres} className="font-semibold text-brand-wine hover:underline">
                      Abrir ADRES de nuevo
                    </button>
                  </li>
                  <li>
                    <b>2.</b> Marca «No soy un robot» y pulsa <b>Consultar</b>.
                  </li>
                  <li>
                    <b>3.</b> Copia el resultado (de «Número de identificación» a «Apellidos») y pégalo abajo, o escribe los datos.
                  </li>
                </ol>
              )}

              {aviso && (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">{aviso}</p>
              )}

              {numero.length >= 5 && !esperando && (
                <>
                  {(!conExtension || manual) && (
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-brand-black">Pegar resultado de ADRES</label>
                    <textarea
                      value={pegado}
                      onChange={(e) => alPegar(e.target.value)}
                      rows={3}
                      placeholder={"NÚMERO DE IDENTIFICACION  1044616409\nNOMBRES  OSCAR DAVID\nAPELLIDOS  HERNANDEZ GUZMAN"}
                      className="w-full rounded-xl border border-brand-brown/20 bg-white px-3 py-2 text-xs text-brand-black outline-none placeholder:text-brand-black/30 focus:border-brand-amber"
                    />
                  </div>
                  )}
                  {verCampos && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-brand-black">Nombres</label>
                      <input
                        value={nombres}
                        onChange={(e) => setNombres(e.target.value)}
                        onBlur={() => setNombres(nombresF)}
                        className="campo"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-brand-black">Apellidos</label>
                      <input
                        value={apellidos}
                        onChange={(e) => setApellidos(e.target.value)}
                        onBlur={() => setApellidos(apellidosF)}
                        className="campo"
                      />
                    </div>
                  </div>
                  )}
                  {(nombresF || apellidosF) && (
                    <div className="rounded-xl border border-brand-brown/10 px-4 py-4 text-center">
                      <p className="text-[11px] uppercase tracking-wide text-brand-black/50">Nombre completo</p>
                      <p className="mt-1 text-xl font-semibold text-brand-wine">
                        {[nombresF, apellidosF].filter(Boolean).join(" ")}
                      </p>
                      <p className="mt-1 text-xs text-brand-black/60">
                        Nombres: <b>{nombresF || "—"}</b> · Apellidos: <b>{apellidosF || "—"}</b>
                      </p>
                      {!verCampos && (
                        <button
                          type="button"
                          onClick={() => setEditando(true)}
                          className="mt-2 text-xs font-semibold text-brand-wine hover:underline"
                        >
                          Corregir
                        </button>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="flex justify-end gap-2 border-t border-brand-brown/10 px-5 py-4">
              <button
                type="button"
                onClick={cerrar}
                className="rounded-xl border border-brand-brown/15 px-4 py-2 text-sm font-semibold text-brand-brown hover:bg-brand-cream-soft"
              >
                Cancelar
              </button>
              {numero.length >= 5 && !esperando && (
                <button
                  type="button"
                  disabled={!puedeConfirmar}
                  onClick={() => {
                    onConfirmar(nombresF, apellidosF);
                    setAbierto(false);
                  }}
                  title={puedeConfirmar ? "Llenar Nombres y Apellidos del cliente" : "Completa nombres y apellidos"}
                  className="rounded-xl bg-brand-wine px-5 py-2 text-sm font-semibold text-white hover:bg-brand-wine/90 disabled:opacity-50"
                >
                  Confirmar
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
