"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { getUsuario, tieneAccesoAdministrativo, type Usuario } from "@/lib/auth";
import {
  normalizarDireccionesExcel,
  descargarBlob,
  descargarPlantillaExcel,
} from "@/lib/machine-learning";

type Estado = "idle" | "procesando" | "ok" | "error";

export default function MachineLearningPage() {
  const router = useRouter();
  const [, setUsuario] = useState<Usuario | null>(null);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [estado, setEstado] = useState<Estado>("idle");
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const u = getUsuario();
    if (!tieneAccesoAdministrativo(u?.rol)) {
      router.replace("/admin");
      return;
    }
    setUsuario(u);
  }, [router]);

  const esExcel = (f: File) => /\.(xlsx|xls|xlsm|csv)$/i.test(f.name);

  const elegir = (f: File | null | undefined) => {
    if (!f) return;
    if (!esExcel(f)) {
      setEstado("error");
      setMensaje("El archivo debe ser Excel (.xlsx, .xls, .xlsm) o .csv.");
      return;
    }
    setArchivo(f);
    setEstado("idle");
    setMensaje(null);
  };

  const procesar = async () => {
    if (!archivo || estado === "procesando") return;
    setEstado("procesando");
    setMensaje(null);
    try {
      const { blob, filename, filas } = await normalizarDireccionesExcel(archivo);
      descargarBlob(blob, filename);
      setEstado("ok");
      setMensaje(
        `Se procesaron ${filas} fila${filas === 1 ? "" : "s"}. Se descargó "${filename}".`,
      );
    } catch (e) {
      setEstado("error");
      setMensaje(e instanceof Error ? e.message : "No se pudo procesar el archivo.");
    }
  };

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-bold text-brand-wine">
            Machine Learning
          </h1>
          <p className="mt-1 text-sm text-brand-brown/70">
            Importa un Excel de clientes, lo procesamos (normalizamos direcciones y
            capitalizamos los datos) y lo exportamos corregido en el mismo formato.
          </p>
        </div>
        <button
          type="button"
          onClick={descargarPlantillaExcel}
          className="inline-flex items-center gap-2 rounded-xl border border-brand-wine/30 bg-white px-4 py-2.5 text-sm font-semibold text-brand-wine transition hover:bg-brand-wine/5"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            className="h-4 w-4"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 3v13.5m0 0 4.5-4.5M12 16.5 7.5 12M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5"
            />
          </svg>
          Descargar plantilla
        </button>
      </div>

      {/* Zona de carga */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          elegir(e.dataTransfer.files?.[0]);
        }}
        onClick={() => inputRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-12 text-center transition ${
          dragOver
            ? "border-brand-wine bg-brand-wine/5"
            : "border-brand-brown/25 bg-white hover:border-brand-wine/50 hover:bg-brand-cream-soft/40"
        }`}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          className="mb-3 h-10 w-10 text-brand-wine"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5"
          />
        </svg>
        <p className="text-sm font-semibold text-brand-black">
          {archivo ? archivo.name : "Arrastra el Excel aquí o haz clic para elegirlo"}
        </p>
        <p className="mt-1 text-xs text-brand-brown/50">
          Formatos: .xlsx, .xls, .xlsm, .csv (máx. 30 MB)
        </p>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls,.xlsm,.csv"
          className="hidden"
          onChange={(e) => elegir(e.target.files?.[0])}
        />
      </div>

      {/* Acciones */}
      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={procesar}
          disabled={!archivo || estado === "procesando"}
          className="inline-flex items-center gap-2 rounded-xl bg-brand-wine px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-wine/90 disabled:opacity-50"
        >
          {estado === "procesando" ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/60 border-t-transparent" />
              Procesando…
            </>
          ) : (
            "Procesar y descargar"
          )}
        </button>
        {archivo && estado !== "procesando" && (
          <button
            type="button"
            onClick={() => {
              setArchivo(null);
              setEstado("idle");
              setMensaje(null);
              if (inputRef.current) inputRef.current.value = "";
            }}
            className="rounded-xl border border-brand-brown/20 px-4 py-2.5 text-sm font-semibold text-brand-brown transition hover:bg-brand-cream-soft"
          >
            Quitar
          </button>
        )}
      </div>

      {mensaje && (
        <div
          className={`mt-4 rounded-xl border px-4 py-3 text-sm ${
            estado === "ok"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {mensaje}
        </div>
      )}

      {/* Ayuda: columnas esperadas */}
      <div className="mt-8 rounded-2xl border border-brand-brown/10 bg-brand-cream-soft/30 p-5 text-sm">
        <h2 className="mb-2 font-serif text-lg font-bold text-brand-wine">
          Formato esperado del Excel
        </h2>
        <p className="mb-3 text-brand-brown/70">
          La primera fila es el encabezado. Las columnas se leen por posición:
        </p>
        <ul className="grid gap-1.5 sm:grid-cols-2">
          <li><b>A</b> · Código <span className="text-brand-brown/50">(no se toca)</span></li>
          <li><b>B</b> · Razón social <span className="text-brand-brown/50">(se capitaliza)</span></li>
          <li><b>C</b> · Ciudad <span className="text-brand-brown/50">(no se toca)</span></li>
          <li><b>D</b> · Celular <span className="text-brand-brown/50">(no se toca)</span></li>
          <li><b>E</b> · Contacto <span className="text-brand-brown/50">(se capitaliza)</span></li>
          <li><b>F</b> · Barrio <span className="text-brand-brown/50">(se capitaliza)</span></li>
          <li><b>G</b> · Dirección 1 <span className="text-brand-brown/50">(se normaliza)</span></li>
          <li><b>H</b> · Dirección 2 <span className="text-brand-brown/50">(no se toca)</span></li>
          <li><b>I</b> · Dirección 3 <span className="text-brand-brown/50">(no se toca)</span></li>
        </ul>
        <p className="mt-3 text-brand-brown/70">
          Se agrega una columna <b>Información adicional</b> (J) con todo lo que no
          es parte de la dirección (piso, apto, torre, barrio, referencias, etc.).
          No se pierde ni se inventa información.
        </p>
      </div>
    </div>
  );
}
