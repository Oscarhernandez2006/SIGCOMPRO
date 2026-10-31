/**
 * Extensión «SIGCOMPRO · Validar cédula en ADRES»: detección (con versión),
 * versión disponible para descargar y datos del navegador para instalarla.
 */

/**
 * Interruptor de la validación de cédula en ADRES. En `false` se ocultan los
 * botones «Validar» e «Instalar extensión» en toda SIGCOMPRO (desactivada
 * mientras se publica la extensión en la tienda de Edge).
 */
export const VALIDACION_ADRES_ACTIVA = true;

/**
 * URL de la extensión en la tienda de complementos de Microsoft Edge
 * (publicada como "oculta"; publicar ahí es gratis). Si se llena, en Edge el
 * botón «Instalar» abre la tienda: se pulsa «Obtener» y se actualiza sola.
 * Ej.: "https://microsoftedge.microsoft.com/addons/detail/<id>"
 */
export const URL_EXTENSION_EDGE = "";

/**
 * URL en la Chrome Web Store (opcional; publicar ahí cuesta 5 USD únicos).
 * Si se llena, Chrome y Brave también instalan con un clic.
 */
export const URL_EXTENSION_WEBSTORE = "";

export const URL_EXTENSION_ZIP = "/extension-adres.zip";

export interface EstadoExtension {
  instalada: boolean;
  /** Versión instalada (null en versiones viejas que no la informan). */
  version: string | null;
}

/** Saluda a la extensión (si está instalada responde con su versión). */
export function detectarExtension(espera = 400): Promise<EstadoExtension> {
  if (typeof window === "undefined") return Promise.resolve({ instalada: false, version: null });
  return new Promise((resolve) => {
    const alMensaje = (e: MessageEvent) => {
      const d = e.data as { tipo?: string; version?: string } | null;
      if (e.source === window && d?.tipo === "SIGCOMPRO_ADRES_LISTO") {
        window.removeEventListener("message", alMensaje);
        clearTimeout(t);
        resolve({ instalada: true, version: typeof d.version === "string" ? d.version : null });
      }
    };
    const t = setTimeout(() => {
      window.removeEventListener("message", alMensaje);
      resolve({ instalada: false, version: null });
    }, espera);
    window.addEventListener("message", alMensaje);
    window.postMessage({ tipo: "SIGCOMPRO_ADRES_PING" }, window.location.origin);
  });
}

let versionDisponible: Promise<string | null> | null = null;

/** Versión de la extensión que ofrece este SIGCOMPRO (null si no está disponible). */
export function obtenerVersionDisponible(): Promise<string | null> {
  if (!versionDisponible) {
    versionDisponible = fetch("/extension-adres.json", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { version?: string } | null) => j?.version ?? null)
      .catch(() => null);
  }
  return versionDisponible;
}

/** ¿La versión `a` es menor que `b`? ("1.6.0" < "1.7.0"). Sin versión = vieja. */
export function esVersionMenor(a: string | null, b: string | null): boolean {
  if (!b) return false;
  if (!a) return true;
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) < (pb[i] ?? 0);
  }
  return false;
}

export interface Navegador {
  nombre: "Brave" | "Edge" | "Chrome" | "Otro";
  /** Página de extensiones del navegador (no se puede abrir desde la web: se copia). */
  paginaExtensiones: string;
  /** ¿Soporta la extensión (Chromium)? */
  compatible: boolean;
}

/** Tienda desde la que se instala con un clic en este navegador (null = descarga manual). */
export function urlTiendaPara(nav: Navegador): string | null {
  if (nav.nombre === "Edge") return URL_EXTENSION_EDGE || null;
  if (nav.nombre === "Chrome" || nav.nombre === "Brave") return URL_EXTENSION_WEBSTORE || null;
  return null;
}

export function detectarNavegador(): Navegador {
  if (typeof navigator === "undefined") return { nombre: "Otro", paginaExtensiones: "", compatible: false };
  const ua = navigator.userAgent;
  if ((navigator as Navigator & { brave?: unknown }).brave) {
    return { nombre: "Brave", paginaExtensiones: "brave://extensions", compatible: true };
  }
  if (/Edg\//.test(ua)) return { nombre: "Edge", paginaExtensiones: "edge://extensions", compatible: true };
  if (/Chrome\//.test(ua) && !/OPR\//.test(ua)) {
    return { nombre: "Chrome", paginaExtensiones: "chrome://extensions", compatible: true };
  }
  return { nombre: "Otro", paginaExtensiones: "", compatible: false };
}
