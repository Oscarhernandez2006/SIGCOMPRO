// Puente entre la página de SIGCOMPRO y la extensión (mensajes de ventana).
// No modifica el HTML (evita errores de hidratación de React): SIGCOMPRO la
// detecta enviando SIGCOMPRO_ADRES_PING y esperando SIGCOMPRO_ADRES_LISTO.
(() => {
  window.addEventListener("message", (e) => {
    if (e.source !== window) return;
    const d = e.data;
    if (!d || typeof d !== "object") return;
    if (d.tipo === "SIGCOMPRO_ADRES_CONSULTAR") {
      chrome.runtime.sendMessage({ tipo: "consultar", cedula: d.cedula });
    } else if (d.tipo === "SIGCOMPRO_ADRES_PRECARGAR") {
      chrome.runtime.sendMessage({ tipo: "precargar" });
    } else if (d.tipo === "SIGCOMPRO_ADRES_CERRAR_PRECARGA") {
      chrome.runtime.sendMessage({ tipo: "cerrarPrecarga" });
    } else if (d.tipo === "SIGCOMPRO_ADRES_CANCELAR") {
      chrome.runtime.sendMessage({ tipo: "cancelar" });
    } else if (d.tipo === "SIGCOMPRO_ADRES_PING") {
      // Responde con la versión instalada (SIGCOMPRO avisa si hay una más nueva).
      window.postMessage(
        { tipo: "SIGCOMPRO_ADRES_LISTO", version: chrome.runtime.getManifest().version },
        window.location.origin,
      );
    }
  });

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.tipo === "resultado") {
      window.postMessage(
        {
          tipo: "SIGCOMPRO_ADRES_RESULTADO",
          numero: msg.numero,
          nombres: msg.nombres,
          apellidos: msg.apellidos,
          cedulaConsultada: msg.cedulaConsultada,
        },
        window.location.origin,
      );
    } else if (msg?.tipo === "progreso") {
      window.postMessage({ tipo: "SIGCOMPRO_ADRES_PROGRESO", texto: msg.texto }, window.location.origin);
    } else if (msg?.tipo === "error") {
      window.postMessage({ tipo: "SIGCOMPRO_ADRES_ERROR", mensaje: msg.mensaje }, window.location.origin);
    }
  });
})();
