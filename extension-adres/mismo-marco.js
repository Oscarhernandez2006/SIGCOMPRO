// Se ejecuta en la página de ADRES (mundo de la página) SOLO cuando está dentro
// del documento oculto de la extensión: ADRES abre el resultado con
// window.open; aquí se carga en el mismo marco para que no se abra nada.
(() => {
  try {
    const ancestros = Array.from(window.location.ancestorOrigins || []);
    if (!ancestros.some((o) => o.startsWith("chrome-extension://"))) return;
    window.open = function (url) {
      if (url) window.location.assign(new URL(String(url), window.location.href).href);
      return null;
    };
  } catch {
    /* sin cambios */
  }
})();
