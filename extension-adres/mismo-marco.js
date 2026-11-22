// Se ejecuta en la página de ADRES (mundo de la página). En el documento oculto
// de la extensión o en una consulta de SIGCOMPRO (marca data-sigcompro-control
// que pone adres.js): ADRES abre el resultado con window.open; aquí se carga en
// el mismo marco (sin ventanas emergentes que el navegador bloquee). Los
// alert() de ADRES (p. ej. "no se encontró") se dejan en data-sigcompro-alerta
// para que adres.js los lea.
(() => {
  try {
    const ancestros = Array.from(window.location.ancestorOrigins || []);
    const enOculto = ancestros.some((o) => o.startsWith("chrome-extension://"));
    const controlado = () => enOculto || document.documentElement?.hasAttribute("data-sigcompro-control");
    const abrir = window.open;
    window.open = function (url, ...resto) {
      if (!controlado()) return abrir.call(window, url, ...resto);
      if (url) window.location.assign(new URL(String(url), window.location.href).href);
      return null;
    };
    const alertar = window.alert;
    window.alert = function (mensaje) {
      document.documentElement?.setAttribute("data-sigcompro-alerta", `${Date.now()}|${String(mensaje ?? "")}`);
      if (!controlado()) alertar.call(window, mensaje);
    };
  } catch {
    /* sin cambios */
  }
})();
