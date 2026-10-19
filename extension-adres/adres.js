// En la consulta de ADRES (en el navegador de la persona): llena tipo y número
// de documento, pulsa «Consultar» cuando el reCAPTCHA de la página ya cargó (a
// lo sumo 2 veces por cada Validar pedido desde SIGCOMPRO) y, al mostrarse el
// resultado, envía nombres y apellidos. Si ADRES pide un reto visible, lo
// resuelve la persona.
(() => {
  const MAX_CLICS = 2;
  let enviado = false;
  let errorEnviado = "";
  let temporizador = null;

  const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
  const progreso = (texto) => chrome.runtime.sendMessage({ tipo: "progreso", texto }).catch(() => undefined);

  function textoPagina() {
    return (document.body?.innerText || "").replace(/\u00a0/g, " ");
  }

  function leerResultado(texto) {
    const t = texto.replace(/\r/g, "");
    const tomar = (re) => {
      const m = t.match(re);
      return m ? m[1].replace(/[\t ]+/g, " ").trim() : "";
    };
    return {
      numero: tomar(/N[ÚU]MERO\s+DE\s+IDENTIFICACI[ÓO]N\s*[:\t ]*\s*([0-9.\- ]+)/i).replace(/\D+/g, ""),
      nombres: tomar(/(?:^|\n|\t|\s)NOMBRES\s*[:\t ]*\s*([^\n\t]+?)(?=\s*(?:\n|\t|APELLIDOS|$))/i),
      apellidos: tomar(/(?:^|\n|\t|\s)APELLIDOS\s*[:\t ]*\s*([^\n\t]+?)(?=\s*(?:\n|\t|FECHA|DEPARTAMENTO|MUNICIPIO|$))/i),
    };
  }

  function aviso(texto) {
    if (!document.body) return;
    let el = document.getElementById("sigcompro-aviso");
    if (!el) {
      el = document.createElement("div");
      el.id = "sigcompro-aviso";
      el.style.cssText =
        "position:fixed;top:8px;left:50%;transform:translateX(-50%);z-index:99999;background:#7a1e2b;color:#fff;" +
        "font:600 14px Arial,sans-serif;padding:10px 16px;border-radius:10px;box-shadow:0 6px 20px rgba(0,0,0,.25)";
      document.body.appendChild(el);
    }
    el.textContent = texto;
  }

  /** Pide la consulta pendiente (reintenta: puede llegar justo después de abrir la ventana). */
  async function obtenerPendiente() {
    for (let i = 0; i < 20; i++) {
      const p = await chrome.runtime.sendMessage({ tipo: "pendiente" }).catch(() => null);
      if (p?.cedula) return p;
      await esperar(500);
    }
    return null;
  }

  /**
   * Espera a que el reCAPTCHA de ADRES esté LISTO: cuando ya dibujó su marco
   * (badge/iframe). Con la ventana precargada suele estar listo de inmediato.
   * Máx. 8 s; luego se intenta igual.
   */
  async function esperarRecaptcha() {
    const inicio = Date.now();
    while (Date.now() - inicio < 8000) {
      if (document.querySelector('.grecaptcha-badge, iframe[src*="recaptcha"]')) {
        await esperar(250);
        return true;
      }
      await esperar(150);
    }
    return false;
  }

  function esperarRespuesta(boton, clics) {
    if (temporizador) clearTimeout(temporizador);
    temporizador = setTimeout(async () => {
      if (enviado) return;
      if (clics < MAX_CLICS && boton && !boton.disabled) {
        // ADRES no reaccionó: un segundo y último intento.
        const r = await chrome.runtime.sendMessage({ tipo: "marcarClic" }).catch(() => null);
        progreso("ADRES no respondió, reintentando la consulta…");
        boton.click();
        esperarRespuesta(boton, r?.clics ?? MAX_CLICS);
        return;
      }
      aviso("ADRES no respondió. Si ves un reto del captcha, resuélvelo y pulsa «Consultar».");
      chrome.runtime.sendMessage({
        tipo: "error",
        motivo: "sinRespuesta",
        mensaje: "ADRES no respondió a tiempo. Revisa la ventana de ADRES (puede pedir un reto) y pulsa «Consultar».",
      });
    }, 12000);
  }

  let procesando = false;

  async function llenarFormulario(directa) {
    const num = document.getElementById("txtNumDoc");
    const tipo = document.getElementById("tipoDoc");
    const boton = document.getElementById("btnConsultar");
    if (!num || !boton || procesando || enviado) return;
    procesando = true;
    const p = directa ?? (await obtenerPendiente());
    if (!p?.cedula) {
      procesando = false;
      return;
    }
    progreso("ADRES cargado");
    // "Cédula de ciudadanía" ya viene elegida; cambiarla recarga el formulario.
    if (tipo && tipo.value !== "CC") {
      tipo.value = "CC";
      tipo.dispatchEvent(new Event("change", { bubbles: true }));
      return;
    }
    if (num.value !== p.cedula) {
      num.value = p.cedula;
      num.dispatchEvent(new Event("input", { bubbles: true }));
      num.dispatchEvent(new Event("change", { bubbles: true }));
    }
    progreso(`Cédula ${p.cedula} llenada en ADRES`);
    const clics = p.clics ?? 0;
    if (clics >= MAX_CLICS) {
      // Ya se pulsó (la página se recargó tras consultar): solo se espera el resultado.
      aviso(`Consultando la cédula ${p.cedula}…`);
      esperarRespuesta(boton, clics);
      return;
    }
    aviso(`Consultando la cédula ${p.cedula} en ADRES…`);
    progreso("Esperando que cargue el reCAPTCHA de ADRES…");
    await esperarRecaptcha();
    if (enviado || boton.disabled) return;
    const r = await chrome.runtime.sendMessage({ tipo: "marcarClic" }).catch(() => null);
    progreso("Consultando en ADRES…");
    boton.click();
    esperarRespuesta(boton, r?.clics ?? clics + 1);
  }

  async function revisarResultado() {
    if (enviado) return;
    const texto = textoPagina();
    if (/N[ÚU]MERO\s+DE\s+IDENTIFICACI/i.test(texto) && /APELLIDOS/i.test(texto)) {
      const r = leerResultado(texto);
      if (r.nombres || r.apellidos) {
        enviado = true;
        if (temporizador) clearTimeout(temporizador);
        aviso("Datos enviados a SIGCOMPRO. Esta ventana se cerrará.");
        await chrome.runtime.sendMessage({ tipo: "resultado", ...r });
        return;
      }
    }
    const err = (document.getElementById("Error")?.innerText || "").trim();
    if (err && err !== errorEnviado) {
      errorEnviado = err;
      await chrome.runtime.sendMessage({ tipo: "error", motivo: "adres", mensaje: err });
    }
  }

  // Ventana precargada: SIGCOMPRO avisa la cédula cuando se pulsa Validar.
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.tipo === "consultarAhora" && msg.cedula) {
      llenarFormulario({ cedula: String(msg.cedula), clics: 0 });
    }
  });

  // Documento oculto de la extensión: le pasa la cédula al formulario.
  const origenExtension = new URL(chrome.runtime.getURL("")).origin;
  window.addEventListener("message", (e) => {
    if (e.origin !== origenExtension) return;
    const d = e.data;
    if (d?.tipo === "SIGCOMPRO_CONSULTAR" && d.cedula) {
      llenarFormulario({ cedula: String(d.cedula), clics: 0 });
    }
  });

  llenarFormulario();
  revisarResultado();
  const obs = new MutationObserver(() => revisarResultado());
  if (document.body) obs.observe(document.body, { childList: true, subtree: true, characterData: true });
})();
