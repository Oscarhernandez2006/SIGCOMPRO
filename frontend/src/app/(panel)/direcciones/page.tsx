"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { Fill } from "exceljs";
import { ApiError } from "@/lib/api";
import { getUsuario, type Usuario } from "@/lib/auth";
import { puedeAccion } from "@/lib/permisos";
import { ModalSinPermiso, useSinPermiso } from "@/components/SinPermisoModal";
import {
  TIPO_VACIO,
  actualizarCeldaDireccion,
  agregarDireccion,
  eliminarDirecciones,
  exportarDirecciones,
  importarDirecciones,
  obtenerCodigosDirecciones,
  listarDirecciones,
  marcarDirecciones,
  obtenerColumnasDirecciones,
  obtenerTiposDireccion,
  type ColumnaDireccion,
  type EstadoDireccion,
  type FilaDireccion,
  type PaginaDirecciones,
  type ValorCelda,
} from "@/lib/direcciones";

const POR_PAGINA = 100;
const ANCHO_NUMERO_FILA = 56;
const ANCHO_POR_DEFECTO = 120;
const ANCHOS: Record<string, number> = {
  A: 110, B: 190, C: 190, D: 130, E: 200, F: 330, H: 160, I: 130, J: 95,
  K: 85, L: 95, M: 105, N: 110, O: 140, U: 110, AA: 110, AB: 190,
};
// Columnas que en el Excel original son números (se exportan como número).
const COLUMNAS_NUMERICAS = new Set(["A", "L", "M", "N", "U", "AA"]);
// Amarillo tipo resaltador: suave para que el texto se lea bien.
const FONDO_CORREGIDA = "bg-yellow-200/50";
const MAX_CELDAS_PEGAR = 500;

type Celda = { r: number; c: number };
type Edicion = Celda & { valor: string };
type Importacion = {
  fase: "leyendo" | "comparando" | "subiendo" | "listo" | "error";
  archivo: string;
  enArchivo?: number;
  nuevas?: number;
  subidas?: number;
  agregadas?: number;
  sinCodigo?: number;
  msg?: string;
};

const LOTE_IMPORTAR = 500;

/** Nombre de columna comparable: sin tildes, espacios repetidos ni mayúsculas. */
function claveColumna(s: unknown): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function texto(v: ValorCelda | undefined): string {
  return v === null || v === undefined ? "" : String(v);
}

function mensajeError(e: unknown, porDefecto: string): string {
  return e instanceof ApiError || e instanceof Error ? e.message || porDefecto : porDefecto;
}

function fechaCorta(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" }) : "";
}

/** Convierte a número los textos numéricos de las columnas numéricas del Excel. */
function valorExcel(letra: string, v: ValorCelda): ValorCelda {
  if (
    typeof v === "string" &&
    COLUMNAS_NUMERICAS.has(letra) &&
    /^-?\d+(\.\d+)?$/.test(v) &&
    !/^-?0\d/.test(v) &&
    v.length < 16
  ) {
    return Number(v);
  }
  return v;
}

const sinSuscripcion = () => () => {};

export default function DireccionesPage() {
  // La sesión vive en cookies: se lee en el cliente (en el servidor no hay usuario).
  const usuarioJson = useSyncExternalStore(
    sinSuscripcion,
    () => JSON.stringify(getUsuario()),
    () => "null",
  );
  const usuario = useMemo(() => JSON.parse(usuarioJson) as Usuario | null, [usuarioJson]);
  const sinPermiso = useSinPermiso();
  const permite = useMemo(
    () => ({
      editar: puedeAccion(usuario, "direcciones.editar"),
      marcar: puedeAccion(usuario, "direcciones.marcar"),
      eliminar: puedeAccion(usuario, "direcciones.eliminar"),
      exportar: puedeAccion(usuario, "direcciones.exportar"),
      importar: puedeAccion(usuario, "direcciones.importar"),
    }),
    [usuario],
  );

  const [columnas, setColumnas] = useState<ColumnaDireccion[]>([]);
  const [tipos, setTipos] = useState<string[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [q, setQ] = useState("");
  const [estado, setEstado] = useState<EstadoDireccion>("todas");
  const [tipo, setTipo] = useState("");
  const [offset, setOffset] = useState(0);
  const [recarga, setRecarga] = useState(0);
  const [pagina, setPagina] = useState<PaginaDirecciones | null>(null);
  const [filas, setFilas] = useState<FilaDireccion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [ancla, setAncla] = useState<number | null>(null);
  const [activa, setActiva] = useState<Celda | null>(null);
  const [edicion, setEdicionEstado] = useState<Edicion | null>(null);
  const edicionRef = useRef<Edicion | null>(null);
  const [guardando, setGuardando] = useState(0);
  const [procesando, setProcesando] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [importacion, setImportacion] = useState<Importacion | null>(null);
  const archivoRef = useRef<HTMLInputElement>(null);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "error"; msg: string } | null>(null);
  const [irPagina, setIrPagina] = useState("");
  const gridRef = useRef<HTMLDivElement>(null);
  // Fila recién agregada: al cargar su página se enfoca y se abre su edición.
  const focoPendiente = useRef<string | null>(null);

  const visibles = useMemo(() => columnas.filter((c) => c.visible), [columnas]);
  const anchoTabla = useMemo(
    () => ANCHO_NUMERO_FILA + visibles.reduce((s, c) => s + (ANCHOS[c.letra] ?? ANCHO_POR_DEFECTO), 0),
    [visibles],
  );

  function setEdicion(e: Edicion | null) {
    edicionRef.current = e;
    setEdicionEstado(e);
  }

  useEffect(() => {
    obtenerColumnasDirecciones()
      .then(setColumnas)
      .catch((e) => setError(mensajeError(e, "No se pudieron cargar las columnas")));
    obtenerTiposDireccion().then(setTipos).catch(() => { /* filtro opcional */ });
  }, []);

  // Búsqueda con espera corta para no consultar en cada tecla.
  useEffect(() => {
    const v = busqueda.trim();
    if (v === q) return;
    const t = setTimeout(() => {
      setQ(v);
      setOffset(0);
      setSeleccion(new Set());
      setCargando(true);
    }, 350);
    return () => clearTimeout(t);
  }, [busqueda, q]);

  useEffect(() => {
    let vivo = true;
    listarDirecciones({ q, estado, tipo, offset, limit: POR_PAGINA })
      .then((p) => {
        if (!vivo) return;
        setPagina(p);
        setFilas(p.filas);
        setError(null);
        const id = focoPendiente.current;
        const r = id ? p.filas.findIndex((f) => f.id === id) : -1;
        if (r >= 0) {
          focoPendiente.current = null;
          setActiva({ r, c: 0 });
          setEdicion({ r, c: 0, valor: "" });
        } else {
          setActiva((a) => (a && a.r < p.filas.length ? a : null));
        }
      })
      .catch((e) => vivo && setError(mensajeError(e, "No se pudieron cargar las direcciones")))
      .finally(() => vivo && setCargando(false));
    return () => {
      vivo = false;
    };
  }, [q, estado, tipo, offset, recarga]);

  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 4000);
    return () => clearTimeout(t);
  }, [aviso]);

  useEffect(() => {
    if (!activa) return;
    document
      .getElementById(`dir-c-${activa.r}-${activa.c}`)
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activa]);

  const total = pagina?.total ?? 0;
  const totales = pagina?.totales ?? { todas: 0, corregidas: 0, pendientes: 0 };
  const paginaActual = Math.floor(offset / POR_PAGINA) + 1;
  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA));

  function recargar() {
    setCargando(true);
    setRecarga((n) => n + 1);
  }

  function irA(nuevoOffset: number) {
    const max = Math.max(0, (totalPaginas - 1) * POR_PAGINA);
    const o = Math.min(max, Math.max(0, nuevoOffset));
    if (o === offset) return;
    setEdicion(null);
    setSeleccion(new Set());
    setActiva(null);
    setCargando(true);
    setOffset(o);
  }

  function cambiarEstado(e: EstadoDireccion) {
    if (e === estado) return;
    setEstado(e);
    setOffset(0);
    setSeleccion(new Set());
    setActiva(null);
    setCargando(true);
  }

  function cambiarTipo(t: string) {
    setTipo(t);
    setOffset(0);
    setSeleccion(new Set());
    setActiva(null);
    setCargando(true);
  }

  async function guardarCelda(r: number, letra: string, valorCrudo: string) {
    const fila = filas[r];
    if (!fila) return;
    const valor = valorCrudo.replace(/\s+/g, " ").trim();
    const anterior = fila.datos[letra] ?? null;
    if (texto(anterior) === valor) return;
    const id = fila.id;
    const aplicar = (v: ValorCelda) =>
      setFilas((prev) =>
        prev.map((f) => (f.id === id ? { ...f, datos: { ...f.datos, [letra]: v } } : f)),
      );
    aplicar(valor === "" ? null : valor);
    setGuardando((n) => n + 1);
    try {
      const act = await actualizarCeldaDireccion(id, letra, valor);
      setFilas((prev) =>
        prev.map((f) =>
          f.id === id
            ? {
                ...f,
                datos: { ...f.datos, [letra]: act.datos[letra] ?? null },
                actualizadoPor: act.actualizadoPor,
                actualizadoEn: act.actualizadoEn,
              }
            : f,
        ),
      );
    } catch (e) {
      aplicar(anterior);
      setAviso({ tipo: "error", msg: mensajeError(e, "No se pudo guardar la celda") });
    } finally {
      setGuardando((n) => n - 1);
    }
  }

  function iniciarEdicion(r: number, c: number, inicial?: string) {
    if (!permite.editar) {
      sinPermiso.mostrar();
      return;
    }
    const fila = filas[r];
    const col = visibles[c];
    if (!fila || !col) return;
    setActiva({ r, c });
    setEdicion({ r, c, valor: inicial ?? texto(fila.datos[col.letra]) });
  }

  /** Guarda la edición abierta y mueve la celda activa (Enter = abajo, Tab = derecha). */
  function confirmarEdicion(dr: number, dc: number, enfocar = true) {
    const ed = edicionRef.current;
    if (!ed) return;
    setEdicion(null);
    const col = visibles[ed.c];
    if (col) void guardarCelda(ed.r, col.letra, ed.valor);
    if (dr || dc) {
      setActiva({
        r: Math.min(filas.length - 1, Math.max(0, ed.r + dr)),
        c: Math.min(visibles.length - 1, Math.max(0, ed.c + dc)),
      });
    }
    if (enfocar) gridRef.current?.focus();
  }

  function onKeyDownGrid(e: React.KeyboardEvent<HTMLDivElement>) {
    if (edicion || !activa || filas.length === 0) return;
    const mover = (dr: number, dc: number) => {
      e.preventDefault();
      setActiva({
        r: Math.min(filas.length - 1, Math.max(0, activa.r + dr)),
        c: Math.min(visibles.length - 1, Math.max(0, activa.c + dc)),
      });
    };
    switch (e.key) {
      case "ArrowUp":
        return mover(-1, 0);
      case "ArrowDown":
        return mover(1, 0);
      case "ArrowLeft":
        return mover(0, -1);
      case "ArrowRight":
        return mover(0, 1);
      case "Tab":
        return mover(0, e.shiftKey ? -1 : 1);
      case "Enter":
      case "F2":
        e.preventDefault();
        return iniciarEdicion(activa.r, activa.c);
      case "Delete":
      case "Backspace":
        e.preventDefault();
        if (!permite.editar) return sinPermiso.mostrar();
        void guardarCelda(activa.r, visibles[activa.c].letra, "");
        return;
      case "Escape":
        setSeleccion(new Set());
        return;
    }
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      iniciarEdicion(activa.r, activa.c, e.key);
    }
  }

  function onCopy(e: React.ClipboardEvent<HTMLDivElement>) {
    if (edicion || !activa) return;
    const fila = filas[activa.r];
    const col = visibles[activa.c];
    if (!fila || !col) return;
    e.preventDefault();
    e.clipboardData.setData("text/plain", texto(fila.datos[col.letra]));
  }

  /** Pega texto (también bloques copiados de Excel) desde la celda activa. */
  function onPaste(e: React.ClipboardEvent<HTMLDivElement>) {
    if (edicion || !activa) return;
    const contenido = e.clipboardData.getData("text/plain");
    if (!contenido) return;
    e.preventDefault();
    if (!permite.editar) return sinPermiso.mostrar();
    const bloque = contenido
      .replace(/\r/g, "")
      .replace(/\n$/, "")
      .split("\n")
      .map((l) => l.split("\t"));
    let n = 0;
    for (let i = 0; i < bloque.length; i++) {
      for (let j = 0; j < bloque[i].length; j++) {
        const r = activa.r + i;
        const c = activa.c + j;
        if (r < filas.length && c < visibles.length && n < MAX_CELDAS_PEGAR) {
          void guardarCelda(r, visibles[c].letra, bloque[i][j]);
          n++;
        }
      }
    }
  }

  function clicNumeroFila(e: React.MouseEvent, r: number) {
    e.preventDefault();
    const id = filas[r]?.id;
    if (!id) return;
    if (e.shiftKey && ancla !== null) {
      const [a, b] = ancla < r ? [ancla, r] : [r, ancla];
      setSeleccion(new Set(filas.slice(a, b + 1).map((f) => f.id)));
    } else if (e.ctrlKey || e.metaKey) {
      setSeleccion((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
      setAncla(r);
    } else {
      setSeleccion((prev) => (prev.size === 1 && prev.has(id) ? new Set() : new Set([id])));
      setAncla(r);
    }
    setActiva({ r, c: activa?.c ?? 0 });
    gridRef.current?.focus();
  }

  const todasSeleccionadas = filas.length > 0 && filas.every((f) => seleccion.has(f.id));
  function alternarSeleccionPagina() {
    setSeleccion(todasSeleccionadas ? new Set() : new Set(filas.map((f) => f.id)));
  }

  /** Filas a las que aplica una acción: las seleccionadas o, si no hay, la de la celda activa. */
  function objetivo(): string[] {
    if (seleccion.size) return [...seleccion];
    const fila = activa ? filas[activa.r] : undefined;
    return fila ? [fila.id] : [];
  }

  async function marcar(corregida: boolean) {
    if (!permite.marcar) return sinPermiso.mostrar();
    const ids = objetivo();
    if (ids.length === 0) {
      setAviso({ tipo: "error", msg: "Selecciona una o más filas (clic en el número de la fila)." });
      return;
    }
    setProcesando(true);
    try {
      const r = await marcarDirecciones(ids, corregida);
      const set = new Set(ids);
      setFilas((prev) =>
        prev.map((f) =>
          set.has(f.id)
            ? { ...f, corregida, corregidaPor: r.corregidaPor, corregidaEn: r.corregidaEn }
            : f,
        ),
      );
      setPagina((p) =>
        p
          ? {
              ...p,
              totales: {
                ...p.totales,
                corregidas: p.totales.corregidas + (corregida ? r.actualizadas : -r.actualizadas),
                pendientes: p.totales.pendientes + (corregida ? -r.actualizadas : r.actualizadas),
              },
            }
          : p,
      );
      setSeleccion(new Set());
      setAviso({
        tipo: "ok",
        msg: corregida
          ? `${ids.length} fila${ids.length === 1 ? "" : "s"} marcada${ids.length === 1 ? "" : "s"} en amarillo.`
          : `Se quitó el amarillo de ${ids.length} fila${ids.length === 1 ? "" : "s"}.`,
      });
      // Con filtro por estado, las filas marcadas ya no pertenecen a la vista.
      if (estado !== "todas") recargar();
    } catch (e) {
      setAviso({ tipo: "error", msg: mensajeError(e, "No se pudo marcar") });
    } finally {
      setProcesando(false);
    }
  }

  async function eliminar() {
    if (!permite.eliminar) return sinPermiso.mostrar();
    const ids = objetivo();
    if (ids.length === 0) {
      setAviso({ tipo: "error", msg: "Selecciona una o más filas (clic en el número de la fila)." });
      return;
    }
    if (!confirm(`¿Eliminar ${ids.length} fila${ids.length === 1 ? "" : "s"}? Esta acción no se puede deshacer.`)) {
      return;
    }
    setProcesando(true);
    try {
      const r = await eliminarDirecciones(ids);
      setSeleccion(new Set());
      setActiva(null);
      setAviso({ tipo: "ok", msg: `${r.eliminadas} fila${r.eliminadas === 1 ? "" : "s"} eliminada${r.eliminadas === 1 ? "" : "s"}.` });
      recargar();
    } catch (e) {
      setAviso({ tipo: "error", msg: mensajeError(e, "No se pudo eliminar") });
    } finally {
      setProcesando(false);
    }
  }

  async function agregarFila() {
    if (!permite.editar) return sinPermiso.mostrar();
    setProcesando(true);
    try {
      const nueva = await agregarDireccion();
      // Se muestra al final de la hoja completa (sin filtros) y queda en edición.
      focoPendiente.current = nueva.id;
      setBusqueda("");
      setQ("");
      setEstado("todas");
      setTipo("");
      setSeleccion(new Set());
      setEdicion(null);
      setOffset(Math.floor(Math.max(0, nueva.numero - 2) / POR_PAGINA) * POR_PAGINA);
      recargar();
    } catch (e) {
      setAviso({ tipo: "error", msg: mensajeError(e, "No se pudo agregar la fila") });
    } finally {
      setProcesando(false);
    }
  }

  /**
   * Importa el Excel de direcciones: agrega SOLO las filas cuyo código (columna
   * A) no exista todavía. Entran al final y sin amarillo para corregirlas.
   */
  async function importar(archivo: File) {
    if (!permite.importar) return sinPermiso.mostrar();
    const base: Importacion = { fase: "leyendo", archivo: archivo.name };
    setImportacion(base);
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await archivo.arrayBuffer(), {
        type: "array",
        cellStyles: false,
        cellHTML: false,
        cellFormula: false,
      });
      // Hoja "Direcciones" o, si no existe, la primera con el encabezado esperado.
      const letraPorNombre = new Map(columnas.map((c) => [claveColumna(c.nombre), c.letra]));
      const claveCodigo = claveColumna("Código de Dirección");
      const nombresHojas = [
        ...wb.SheetNames.filter((n) => claveColumna(n) === "direcciones"),
        ...wb.SheetNames.filter((n) => claveColumna(n) !== "direcciones"),
      ];
      let filasHoja: unknown[][] | null = null;
      for (const n of nombresHojas) {
        const ws = wb.Sheets[n];
        if (!ws) continue;
        const filas = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null, blankrows: false, raw: true });
        if ((filas[0] ?? []).some((h) => claveColumna(h) === claveCodigo)) {
          filasHoja = filas;
          break;
        }
      }
      if (!filasHoja || filasHoja.length === 0) {
        throw new Error('El archivo no tiene una hoja con la columna "Código de Dirección".');
      }
      const encabezado = filasHoja[0].map((h) => letraPorNombre.get(claveColumna(h)) ?? null);
      const filasArchivo: Record<string, ValorCelda>[] = [];
      for (const fila of filasHoja.slice(1)) {
        const datos: Record<string, ValorCelda> = {};
        fila.forEach((v, i) => {
          const letra = encabezado[i];
          if (!letra || v === null || v === undefined) return;
          if (typeof v === "number" || typeof v === "string") {
            if (typeof v === "string" && !v.trim()) return;
            datos[letra] = v;
          } else if (typeof v === "boolean") {
            datos[letra] = String(v);
          } else if (v instanceof Date) {
            datos[letra] = v.toISOString().slice(0, 10);
          }
        });
        if (Object.keys(datos).length) filasArchivo.push(datos);
      }

      setImportacion({ ...base, fase: "comparando", enArchivo: filasArchivo.length });
      const existentes = new Set(await obtenerCodigosDirecciones());
      const vistos = new Set<string>();
      let sinCodigo = 0;
      const nuevas = filasArchivo.filter((d) => {
        const codigo = texto(d.A).trim().toLowerCase();
        if (!codigo) {
          sinCodigo++;
          return false;
        }
        if (existentes.has(codigo) || vistos.has(codigo)) return false;
        vistos.add(codigo);
        return true;
      });

      let agregadas = 0;
      const progreso = { ...base, enArchivo: filasArchivo.length, nuevas: nuevas.length, sinCodigo };
      setImportacion({ ...progreso, fase: "subiendo", subidas: 0 });
      for (let i = 0; i < nuevas.length; i += LOTE_IMPORTAR) {
        const r = await importarDirecciones(nuevas.slice(i, i + LOTE_IMPORTAR));
        agregadas += r.agregadas;
        setImportacion({ ...progreso, fase: "subiendo", subidas: Math.min(nuevas.length, i + LOTE_IMPORTAR) });
      }
      setImportacion({ ...progreso, fase: "listo", subidas: nuevas.length, agregadas });
      if (agregadas > 0) {
        // Muestra las filas nuevas (sin corregir) para empezar a corregirlas.
        setBusqueda("");
        setQ("");
        setTipo("");
        setEstado("pendientes");
        setOffset(0);
        setSeleccion(new Set());
        setActiva(null);
        obtenerTiposDireccion().then(setTipos).catch(() => { /* filtro opcional */ });
      }
      recargar();
    } catch (e) {
      setImportacion({ ...base, fase: "error", msg: mensajeError(e, "No se pudo importar el archivo") });
    }
  }

  async function exportar() {
    if (!permite.exportar) return sinPermiso.mostrar();
    if (exportando) return;
    setExportando(true);
    try {
      const [{ columnas: nombres, filas: datos }, ExcelJS] = await Promise.all([
        exportarDirecciones(),
        import("exceljs").then((m) => m.default),
      ]);
      const letras = columnas.map((c) => c.letra);
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("Direcciones");
      ws.addRow(nombres).font = { bold: true };
      const amarillo: Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFF00" } };
      for (const f of datos) {
        const [marca, ...valores] = f;
        const row = ws.addRow(valores.map((v, i) => valorExcel(letras[i] ?? "", v)));
        if (marca) {
          for (let c = 1; c <= nombres.length; c++) row.getCell(c).fill = amarillo;
        }
      }
      ws.views = [{ state: "frozen", ySplit: 1 }];
      const buf = await wb.xlsx.writeBuffer();
      const url = URL.createObjectURL(
        new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = `Direcciones CO - Santacruz Domicilios ${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setAviso({ tipo: "error", msg: mensajeError(e, "No se pudo exportar") });
    } finally {
      setExportando(false);
    }
  }

  const filaActiva = activa ? filas[activa.r] : undefined;
  const colActiva = activa ? visibles[activa.c] : undefined;
  const referenciaActiva = filaActiva && colActiva ? `${colActiva.letra}${filaActiva.numero}` : "";
  const valorActivo = edicion
    ? edicion.valor
    : filaActiva && colActiva
      ? texto(filaActiva.datos[colActiva.letra])
      : "";
  const cantidadObjetivo = seleccion.size || (filaActiva ? 1 : 0);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl font-bold text-brand-wine">Direcciones</h1>
          <p className="mt-1 text-sm text-brand-black">
            Hoja de direcciones de Drivin. Lo{" "}
            <span className="rounded bg-yellow-200/70 px-1">resaltado en amarillo</span> ya está corregido.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={archivoRef}
            type="file"
            accept=".xlsx,.xlsm,.xls"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void importar(f);
            }}
          />
          <button
            onClick={() => (permite.importar ? archivoRef.current?.click() : sinPermiso.mostrar())}
            disabled={!!importacion && importacion.fase !== "listo" && importacion.fase !== "error"}
            title="Cargar el Excel de direcciones: agrega solo las filas cuyo código aún no existe (llegan sin amarillo)"
            className={`inline-flex items-center gap-2 rounded-xl border border-brand-brown/20 bg-white px-4 py-2.5 text-sm font-semibold text-brand-brown transition hover:bg-brand-cream-soft disabled:opacity-60 ${permite.importar ? "" : "opacity-50"}`}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
            </svg>
            Importar Excel
          </button>
          <button
            onClick={exportar}
            disabled={exportando}
            title="Descargar la hoja completa en Excel (66 columnas, con el amarillo)"
            className={`inline-flex items-center gap-2 rounded-xl border border-brand-brown/20 bg-white px-4 py-2.5 text-sm font-semibold text-brand-brown transition hover:bg-brand-cream-soft disabled:opacity-60 ${permite.exportar ? "" : "opacity-50"}`}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            {exportando ? "Generando Excel…" : "Exportar Excel"}
          </button>
          <button
            onClick={agregarFila}
            disabled={procesando}
            title="Agregar una dirección nueva al final de la hoja"
            className={`inline-flex items-center gap-2 rounded-xl bg-brand-amber px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-amber/90 disabled:opacity-60 ${permite.editar ? "" : "opacity-50"}`}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
            </svg>
            Agregar fila
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[240px] flex-1">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-black">
            <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.34-4.34M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z" />
          </svg>
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar código, nombre, dirección, referencia, barrio, teléfono…"
            className="w-full rounded-xl border border-brand-brown/15 bg-white py-2.5 pl-9 pr-9 text-sm text-brand-black outline-none focus:border-brand-amber"
          />
          {busqueda && (
            <button
              type="button"
              onClick={() => setBusqueda("")}
              title="Limpiar búsqueda"
              aria-label="Limpiar búsqueda"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-0.5 text-brand-black transition hover:bg-brand-cream-soft hover:text-brand-wine"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
        <div className="flex items-center gap-1 rounded-xl border border-brand-brown/15 bg-white p-1">
          {([
            ["todas", `Todas (${totales.todas.toLocaleString("es-CO")})`],
            ["corregidas", `Corregidas (${totales.corregidas.toLocaleString("es-CO")})`],
            ["pendientes", `Sin corregir (${totales.pendientes.toLocaleString("es-CO")})`],
          ] as const).map(([valor, etiqueta]) => (
            <button
              key={valor}
              onClick={() => cambiarEstado(valor)}
              title={`Ver: ${etiqueta}`}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                estado === valor ? "bg-brand-wine text-white" : "text-brand-brown hover:bg-brand-cream-soft"
              }`}
            >
              {valor === "corregidas" && (
                <span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm border border-yellow-400 bg-yellow-200 align-middle" />
              )}
              {etiqueta}
            </button>
          ))}
        </div>
        <select
          value={tipo}
          onChange={(e) => cambiarTipo(e.target.value)}
          title="Filtrar por Tipo de Dirección (punto de venta)"
          className="rounded-xl border border-brand-brown/15 bg-white px-3 py-2.5 text-sm text-brand-black outline-none focus:border-brand-amber"
        >
          <option value="">Todos los tipos</option>
          <option value={TIPO_VACIO}>Sin tipo</option>
          {tipos.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <button
          onClick={recargar}
          title="Recargar (ver cambios de otras personas)"
          aria-label="Recargar"
          className="rounded-xl border border-brand-brown/15 bg-white p-2.5 text-brand-brown transition hover:bg-brand-cream-soft"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={`h-4 w-4 ${cargando ? "animate-spin" : ""}`}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
          </svg>
        </button>
      </div>

      {/* Acciones sobre filas */}
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <button
          onClick={() => marcar(true)}
          disabled={procesando}
          title="Marcar en amarillo (corregida) las filas seleccionadas o la de la celda activa"
          className={`inline-flex items-center gap-1.5 rounded-lg border border-yellow-300 bg-yellow-100 px-3 py-1.5 text-xs font-semibold text-yellow-900 transition hover:bg-yellow-200 disabled:opacity-60 ${permite.marcar ? "" : "opacity-50"}`}
        >
          <span className="inline-block h-3 w-3 rounded-sm bg-yellow-300" />
          Marcar amarillo
        </button>
        <button
          onClick={() => marcar(false)}
          disabled={procesando}
          title="Quitar el amarillo de las filas seleccionadas o la de la celda activa"
          className={`inline-flex items-center gap-1.5 rounded-lg border border-brand-brown/20 bg-white px-3 py-1.5 text-xs font-semibold text-brand-brown transition hover:bg-brand-cream-soft disabled:opacity-60 ${permite.marcar ? "" : "opacity-50"}`}
        >
          <span className="inline-block h-3 w-3 rounded-sm border border-brand-brown/30 bg-white" />
          Quitar amarillo
        </button>
        <button
          onClick={eliminar}
          disabled={procesando}
          title="Eliminar las filas seleccionadas o la de la celda activa"
          className={`rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-60 ${permite.eliminar ? "" : "opacity-50"}`}
        >
          Eliminar fila{cantidadObjetivo === 1 ? "" : "s"}
        </button>
        <span className="text-xs text-brand-black/60">
          {seleccion.size > 0
            ? `${seleccion.size} fila${seleccion.size === 1 ? "" : "s"} seleccionada${seleccion.size === 1 ? "" : "s"}`
            : "Clic en el número de fila para seleccionarla (Shift o Ctrl para varias)"}
        </span>
        <span className="ml-auto text-xs font-medium text-brand-black/60">
          {guardando > 0 ? "Guardando…" : pagina ? "Cambios guardados" : ""}
        </span>
      </div>

      {error && (
        <div className="mb-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {/* Barra de fórmulas: referencia y contenido completo de la celda activa */}
      <div className="flex items-stretch overflow-hidden rounded-t-xl border border-b-0 border-gray-300 bg-white text-[13px]">
        <div className="flex w-20 shrink-0 items-center justify-center border-r border-gray-300 bg-[#f7f7f7] font-mono font-semibold text-gray-700">
          {referenciaActiva}
        </div>
        <div className="flex items-center border-r border-gray-300 px-2 font-serif italic text-gray-400">fx</div>
        <input
          readOnly
          value={valorActivo}
          title={valorActivo}
          placeholder={colActiva ? colActiva.nombre : "Selecciona una celda"}
          className="min-w-0 flex-1 px-2 py-1.5 text-brand-black outline-none placeholder:text-gray-300"
        />
      </div>

      <div
        ref={gridRef}
        tabIndex={0}
        onKeyDown={onKeyDownGrid}
        onCopy={onCopy}
        onPaste={onPaste}
        className="relative max-h-[calc(100vh-360px)] min-h-[320px] overflow-auto border border-gray-300 bg-white outline-none"
      >
        <table className="table-fixed border-separate border-spacing-0 text-[13px] text-brand-black" style={{ width: "100%", minWidth: anchoTabla }}>
          <colgroup>
            <col style={{ width: ANCHO_NUMERO_FILA }} />
            {visibles.map((c) => (
              <col key={c.letra} style={{ width: ANCHOS[c.letra] ?? ANCHO_POR_DEFECTO }} />
            ))}
          </colgroup>
          <thead className="sticky top-0 z-20">
            <tr>
              <th
                onClick={alternarSeleccionPagina}
                title={todasSeleccionadas ? "Quitar selección" : "Seleccionar todas las filas de esta página"}
                className="sticky left-0 z-30 h-5 cursor-pointer border-b border-r border-gray-300 bg-[#e6e6e6] hover:bg-[#d9d9d9]"
              >
                <svg viewBox="0 0 10 10" className="ml-auto mr-1 mt-1 h-2.5 w-2.5 fill-gray-400">
                  <path d="M10 0V10H0Z" />
                </svg>
              </th>
              {visibles.map((c, i) => (
                <th
                  key={c.letra}
                  className={`h-5 border-b border-r border-gray-300 text-center text-[10px] font-normal ${
                    activa?.c === i ? "bg-[#d3e5d8] font-semibold text-emerald-800" : "bg-[#efefef] text-gray-500"
                  }`}
                >
                  {c.letra}
                </th>
              ))}
            </tr>
            <tr>
              <th className="sticky left-0 z-30 border-b border-r border-gray-300 bg-[#efefef] text-center text-[11px] font-normal text-gray-500">
                1
              </th>
              {visibles.map((c) => (
                <th
                  key={c.letra}
                  title={c.nombre}
                  className="truncate border-b border-r border-gray-300 bg-[#f7f7f7] px-2 py-1.5 text-left font-semibold text-gray-800"
                >
                  {c.nombre}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cargando && filas.length === 0 ? (
              <tr>
                <td colSpan={visibles.length + 1} className="px-4 py-10 text-center text-sm text-brand-black/60">
                  Cargando…
                </td>
              </tr>
            ) : filas.length === 0 ? (
              <tr>
                <td colSpan={visibles.length + 1} className="px-4 py-10 text-center text-sm text-brand-black/60">
                  No se encontraron direcciones.
                </td>
              </tr>
            ) : (
              filas.map((f, r) => {
                const sel = seleccion.has(f.id);
                const titulo = f.corregida
                  ? `Corregida (amarillo)${f.corregidaPor ? ` por ${f.corregidaPor}` : ""}${f.corregidaEn ? ` · ${fechaCorta(f.corregidaEn)}` : ""}`
                  : `Sin corregir${f.creadoPor ? ` · agregada por ${f.creadoPor} · ${fechaCorta(f.creadoEn)}` : ""}`;
                return (
                  <tr key={f.id} className={f.corregida ? FONDO_CORREGIDA : ""}>
                    <td
                      onMouseDown={(e) => clicNumeroFila(e, r)}
                      title={titulo}
                      className={`sticky left-0 z-10 cursor-pointer select-none border-b border-r border-gray-300 text-center text-[11px] ${
                        sel
                          ? "bg-emerald-700 font-semibold text-white"
                          : activa?.r === r
                            ? "bg-[#d3e5d8] font-semibold text-emerald-900"
                            : "bg-[#efefef] text-gray-500 hover:bg-[#e2e2e2]"
                      }`}
                    >
                      {f.numero}
                    </td>
                    {visibles.map((c, ci) => {
                      const esActiva = activa?.r === r && activa?.c === ci;
                      const enEdicion = edicion?.r === r && edicion?.c === ci;
                      const valor = texto(f.datos[c.letra]);
                      return (
                        <td
                          key={c.letra}
                          id={`dir-c-${r}-${ci}`}
                          onMouseDown={() => {
                            if (!enEdicion) setActiva({ r, c: ci });
                          }}
                          onDoubleClick={() => iniciarEdicion(r, ci)}
                          title={valor.length > 18 ? valor : undefined}
                          className={`relative h-7 scroll-ml-14 scroll-mt-12 overflow-hidden text-ellipsis whitespace-nowrap border-b border-r border-gray-200 px-2 ${
                            sel ? "bg-emerald-600/10" : ""
                          } ${esActiva ? "outline outline-2 -outline-offset-2 outline-emerald-700" : ""}`}
                        >
                          {enEdicion && edicion ? (
                            <input
                              ref={(el) => {
                                if (el && !el.dataset.listo) {
                                  el.dataset.listo = "1";
                                  el.focus();
                                  el.setSelectionRange(el.value.length, el.value.length);
                                }
                              }}
                              value={edicion.valor}
                              onChange={(e) => setEdicion({ ...edicion, valor: e.target.value })}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  confirmarEdicion(1, 0);
                                } else if (e.key === "Tab") {
                                  e.preventDefault();
                                  confirmarEdicion(0, e.shiftKey ? -1 : 1);
                                } else if (e.key === "Escape") {
                                  e.preventDefault();
                                  setEdicion(null);
                                  gridRef.current?.focus();
                                }
                              }}
                              onBlur={() => confirmarEdicion(0, 0, false)}
                              className="absolute inset-0 h-full w-full bg-white px-2 text-[13px] text-brand-black outline outline-2 -outline-offset-2 outline-emerald-700"
                            />
                          ) : (
                            valor
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Barra de estado + paginación */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-b-xl border border-t-0 border-gray-300 bg-[#f7f7f7] px-3 py-2 text-xs text-brand-black">
        <span>
          {total > 0
            ? `Filas ${(offset + 1).toLocaleString("es-CO")}–${Math.min(offset + POR_PAGINA, total).toLocaleString("es-CO")} de ${total.toLocaleString("es-CO")}`
            : "Sin filas"}
          {filaActiva && (
            <span className="ml-3 text-brand-black/60">
              {filaActiva.corregida ? "● Corregida" : "○ Sin corregir"}
              {filaActiva.actualizadoPor ? ` · último cambio: ${filaActiva.actualizadoPor} ${fechaCorta(filaActiva.actualizadoEn)}` : ""}
            </span>
          )}
        </span>
        <div className="flex items-center gap-1">
          <BotonPagina onClick={() => irA(0)} disabled={paginaActual <= 1} title="Primera página">«</BotonPagina>
          <BotonPagina onClick={() => irA(offset - POR_PAGINA)} disabled={paginaActual <= 1} title="Página anterior">‹</BotonPagina>
          <span className="px-2">
            Página{" "}
            <input
              value={irPagina}
              onChange={(e) => setIrPagina(e.target.value.replace(/\D+/g, ""))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && irPagina) {
                  irA((Number(irPagina) - 1) * POR_PAGINA);
                  setIrPagina("");
                }
              }}
              placeholder={String(paginaActual)}
              title="Escribe un número de página y presiona Enter"
              className="w-12 rounded border border-gray-300 bg-white px-1 py-0.5 text-center outline-none focus:border-brand-amber"
            />{" "}
            de {totalPaginas.toLocaleString("es-CO")}
          </span>
          <BotonPagina onClick={() => irA(offset + POR_PAGINA)} disabled={paginaActual >= totalPaginas} title="Página siguiente">›</BotonPagina>
          <BotonPagina onClick={() => irA((totalPaginas - 1) * POR_PAGINA)} disabled={paginaActual >= totalPaginas} title="Última página">»</BotonPagina>
        </div>
      </div>
      <p className="mt-2 text-[11px] text-brand-black/50">
        Doble clic, Enter o empezar a escribir para editar · Enter guarda y baja · Tab guarda y pasa a la derecha · Esc cancela · Supr borra la celda · Ctrl+C / Ctrl+V copian y pegan (también bloques desde Excel).
      </p>

      {aviso && (
        <div
          role="status"
          className={`fixed bottom-6 left-1/2 z-[70] -translate-x-1/2 rounded-xl px-4 py-2.5 text-sm font-semibold shadow-lg ${
            aviso.tipo === "ok" ? "bg-emerald-600 text-white" : "bg-red-600 text-white"
          }`}
        >
          {aviso.msg}
        </div>
      )}

      {importacion && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-brand-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h2 className="font-serif text-lg font-bold text-brand-wine">Importar Excel</h2>
            <p className="mt-0.5 truncate text-xs text-brand-black/60" title={importacion.archivo}>
              {importacion.archivo}
            </p>
            {importacion.fase === "error" ? (
              <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{importacion.msg}</p>
            ) : importacion.fase === "listo" ? (
              <div className="mt-4 space-y-1.5 text-sm text-brand-black">
                <p className="text-base font-semibold text-emerald-700">
                  {importacion.agregadas
                    ? `Se agregaron ${importacion.agregadas.toLocaleString("es-CO")} fila${importacion.agregadas === 1 ? "" : "s"} nueva${importacion.agregadas === 1 ? "" : "s"} sin amarillo.`
                    : "No había filas nuevas: todos los códigos ya existen."}
                </p>
                <p>Filas en el archivo: {(importacion.enArchivo ?? 0).toLocaleString("es-CO")}</p>
                <p>
                  Ya existían (no se tocaron):{" "}
                  {Math.max(0, (importacion.enArchivo ?? 0) - (importacion.agregadas ?? 0) - (importacion.sinCodigo ?? 0)).toLocaleString("es-CO")}
                </p>
                {!!importacion.sinCodigo && (
                  <p className="text-amber-700">
                    Sin código de dirección (omitidas): {importacion.sinCodigo.toLocaleString("es-CO")}
                  </p>
                )}
                {!!importacion.agregadas && (
                  <p className="pt-1 text-xs text-brand-black/60">Se muestran en el filtro «Sin corregir».</p>
                )}
              </div>
            ) : (
              <div className="mt-5">
                <p className="text-sm font-medium text-brand-black">
                  {importacion.fase === "leyendo"
                    ? "Leyendo el archivo…"
                    : importacion.fase === "comparando"
                      ? `Comparando ${(importacion.enArchivo ?? 0).toLocaleString("es-CO")} filas con las existentes…`
                      : `Agregando filas nuevas: ${(importacion.subidas ?? 0).toLocaleString("es-CO")} de ${(importacion.nuevas ?? 0).toLocaleString("es-CO")}`}
                </p>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-brand-cream-soft">
                  <div
                    className={`h-full rounded-full bg-brand-amber transition-all ${importacion.fase === "subiendo" ? "" : "w-1/3 animate-pulse"}`}
                    style={
                      importacion.fase === "subiendo"
                        ? { width: `${importacion.nuevas ? Math.round(((importacion.subidas ?? 0) / importacion.nuevas) * 100) : 100}%` }
                        : undefined
                    }
                  />
                </div>
                <p className="mt-2 text-[11px] text-brand-black/50">No cierres esta ventana mientras termina.</p>
              </div>
            )}
            {(importacion.fase === "listo" || importacion.fase === "error") && (
              <button
                onClick={() => setImportacion(null)}
                title="Cerrar"
                className="mt-6 w-full rounded-xl bg-brand-wine px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-wine/90"
              >
                Entendido
              </button>
            )}
          </div>
        </div>
      )}

      <ModalSinPermiso abierto={sinPermiso.abierto} onCerrar={sinPermiso.cerrar} />
    </div>
  );
}

function BotonPagina({
  onClick,
  disabled,
  title,
  children,
}: {
  onClick: () => void;
  disabled: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      className="h-7 w-7 rounded border border-gray-300 bg-white text-sm leading-none text-brand-brown transition hover:bg-brand-cream-soft disabled:opacity-40"
    >
      {children}
    </button>
  );
}
