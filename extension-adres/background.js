// Coordina SIGCOMPRO (quien pide la consulta) y ADRES.
// Modo principal: el formulario de ADRES se carga en un DOCUMENTO OCULTO de la
// extensión (offscreen): no se abre ninguna ventana. Respaldo: si ese modo no
// está disponible o no responde, se usa una ventana minimizada.
// Para que sea rápido, al abrir el formulario de cliente en SIGCOMPRO se deja
// ADRES PRECARGADO.
const URL_FORMULARIO = "https://aplicaciones.adres.gov.co/BDUA_Internet/Pages/ConsultarAfiliadoWeb_2.aspx";
const VIGENCIA_MS = 10 * 60 * 1000;
const VIGENCIA_PRECARGA_MS = 5 * 60 * 1000;

const HAY_OFFSCREEN = !!chrome.offscreen?.createDocument;
const ESPERA_OFFSCREEN_MS = 8000;

async function existeOffscreen() {
  try {
    if (chrome.offscreen.hasDocument) return await chrome.offscreen.hasDocument();
    const ctx = await chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"] });
    return ctx.length > 0;
  } catch {
    return false;
  }
}

/** Crea (si falta) el documento oculto con el formulario de ADRES. */
async function asegurarOffscreen() {
  if (await existeOffscreen()) return true;
  try {
    await chrome.offscreen.createDocument({
      url: "offscreen.html",
      reasons: ["IFRAME_SCRIPTING"],
      justification: "Consultar el formulario de ADRES sin abrir ventanas.",
    });
    return true;
  } catch {
    return false;
  }
}

async function cerrarOffscreen() {
  try {
    if (await existeOffscreen()) await chrome.offscreen.closeDocument();
  } catch {
    /* ya estaba cerrado */
  }
}

/** Pasa a la ventana minimizada (respaldo) para una consulta en curso. */
async function usarVentanaRespaldo(p) {
  const v = await abrirOculta(p.tabId);
  await chrome.storage.session.set({
    pendiente: { ...p, modo: "ventana", windowId: v.windowId, clics: 0, ts: Date.now() },
  });
}

/** Si el modo oculto no da señales a tiempo, se cambia a la ventana minimizada. */
function vigilarOffscreen(ts) {
  setTimeout(async () => {
    const p = await leerPendiente();
    if (!p || p.ts !== ts || p.modo !== "offscreen" || p.avance) return;
    await usarVentanaRespaldo(p);
  }, ESPERA_OFFSCREEN_MS);
}

async function leerPendiente() {
  const { pendiente } = await chrome.storage.session.get("pendiente");
  if (!pendiente || Date.now() - pendiente.ts > VIGENCIA_MS) return null;
  return pendiente;
}

async function leerPrecarga() {
  const { precarga } = await chrome.storage.session.get("precarga");
  if (!precarga) return null;
  try {
    await chrome.windows.get(precarga.windowId);
  } catch {
    await chrome.storage.session.remove("precarga");
    return null;
  }
  return precarga;
}

async function cerrarVentana(windowId) {
  if (windowId == null) return;
  // Se cierran las pestañas una por una: cerrar la ventana completa con varias
  // pestañas hace que el navegador pregunte "¿Quieres cerrar todas las pestañas?".
  try {
    const tabs = await chrome.tabs.query({ windowId });
    const ids = tabs.map((t) => t.id).filter((id) => id != null);
    if (ids.length) {
      await chrome.tabs.remove(ids);
      return;
    }
  } catch {
    /* se intenta cerrar la ventana directamente */
  }
  try {
    await chrome.windows.remove(windowId);
  } catch {
    /* ya estaba cerrada */
  }
}

/** Minimiza una ventana de ADRES. */
async function ocultar(windowId) {
  if (windowId == null) return;
  try {
    await chrome.windows.update(windowId, { state: "minimized" });
  } catch {
    /* ventana cerrada */
  }
}

/** Devuelve el foco a la pestaña de SIGCOMPRO. */
async function volverASigcompro(tabId) {
  if (tabId == null) return;
  try {
    const tab = await chrome.tabs.get(tabId);
    await chrome.windows.update(tab.windowId, { focused: true });
    await chrome.tabs.update(tabId, { active: true });
  } catch {
    /* pestaña no disponible */
  }
}

/** Abre el formulario de ADRES en una ventana minimizada. */
async function abrirOculta(tabSigcompro) {
  let ventana;
  try {
    ventana = await chrome.windows.create({ url: URL_FORMULARIO, type: "normal", state: "minimized" });
  } catch {
    ventana = await chrome.windows.create({ url: URL_FORMULARIO, type: "normal", focused: false });
  }
  // Algunos escritorios ignoran "minimizada" al crear: se insiste enseguida.
  await ocultar(ventana?.id);
  setTimeout(() => ocultar(ventana?.id), 400);
  setTimeout(() => volverASigcompro(tabSigcompro), 450);
  return { windowId: ventana?.id ?? null, adresTabId: ventana?.tabs?.[0]?.id ?? null };
}

/** ¿La ventana es la de una consulta en curso o la precargada (y no se debe mostrar)? */
async function esVentanaOculta(windowId) {
  const p = await leerPendiente();
  if (p && p.windowId === windowId) return p.mostrar ? null : p;
  const pre = await leerPrecarga();
  if (pre && pre.windowId === windowId) return pre;
  return null;
}

// Si ADRES abre el resultado en una pestaña o ventana nueva, se lleva a la
// ventana oculta y se vuelve a minimizar: la consulta sigue en segundo plano.
chrome.tabs.onCreated.addListener(async (tab) => {
  const p = await leerPendiente();
  // Modo oculto: si ADRES igual abrió una pestaña (el resultado), se manda a
  // una ventana minimizada y se cierra al leer los datos.
  const url = String(tab.pendingUrl || tab.url || "");
  if (p?.modo === "offscreen" && url.startsWith("https://aplicaciones.adres.gov.co/") && tab.id != null) {
    try {
      await chrome.windows.create({ tabId: tab.id, state: "minimized" });
    } catch {
      /* no se pudo mover */
    }
    await volverASigcompro(p.tabId);
    return;
  }
  if (!p || p.windowId == null || p.mostrar) return;
  let deAdres = tab.windowId === p.windowId;
  if (!deAdres && tab.openerTabId != null) {
    try {
      const opener = await chrome.tabs.get(tab.openerTabId);
      deAdres = opener.windowId === p.windowId;
    } catch {
      /* opener no disponible */
    }
  }
  if (!deAdres) return;
  if (tab.windowId !== p.windowId && tab.id != null) {
    try {
      await chrome.tabs.move(tab.id, { windowId: p.windowId, index: -1 });
    } catch {
      /* no se pudo mover */
    }
  }
  await ocultar(p.windowId);
  await volverASigcompro(p.tabId);
});

// Si una ventana oculta de ADRES toma el foco, se minimiza y se vuelve a SIGCOMPRO.
chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) return;
  const v = await esVentanaOculta(windowId);
  if (!v) return;
  await ocultar(windowId);
  await volverASigcompro(v.tabId ?? v.sigcomproTabId);
});

chrome.runtime.onMessage.addListener((msg, sender, responder) => {
  (async () => {
    // Al abrir el formulario de cliente: se deja ADRES listo y minimizado.
    if (msg?.tipo === "precargar") {
      if (await leerPendiente()) return responder({ ok: true });
      if (HAY_OFFSCREEN && (await asegurarOffscreen())) return responder({ ok: true, oculto: true });
      const pre = await leerPrecarga();
      if (pre && Date.now() - pre.ts < VIGENCIA_PRECARGA_MS) return responder({ ok: true });
      if (pre) await cerrarVentana(pre.windowId);
      const v = await abrirOculta(sender.tab?.id);
      await chrome.storage.session.set({
        precarga: { ...v, sigcomproTabId: sender.tab?.id ?? null, ts: Date.now() },
      });
      return responder({ ok: true });
    }

    // Al cerrar el formulario de cliente: se cierra la ventana precargada.
    if (msg?.tipo === "cerrarPrecarga") {
      if (HAY_OFFSCREEN && !(await leerPendiente())) await cerrarOffscreen();
      const pre = await leerPrecarga();
      if (pre && !(await leerPendiente())) {
        await chrome.storage.session.remove("precarga");
        await cerrarVentana(pre.windowId);
      }
      return responder({ ok: true });
    }

    if (msg?.tipo === "consultar") {
      const cedula = String(msg.cedula || "").replace(/\D+/g, "");
      const anterior = await leerPendiente();
      if (anterior?.windowId != null) await cerrarVentana(anterior.windowId);
      // Modo oculto: sin ventanas.
      if (HAY_OFFSCREEN && (await asegurarOffscreen())) {
        const ts = Date.now();
        await chrome.storage.session.set({
          pendiente: { cedula, tabId: sender.tab?.id ?? null, modo: "offscreen", windowId: null, ts },
        });
        chrome.runtime.sendMessage({ destino: "offscreen", tipo: "consultar", cedula }).catch(() => undefined);
        vigilarOffscreen(ts);
        return responder({ ok: true, oculto: true });
      }
      const pre = await leerPrecarga();
      if (pre) {
        // Se usa la ventana precargada: solo se llena y se consulta.
        await chrome.storage.session.remove("precarga");
        await chrome.storage.session.set({
          pendiente: { cedula, tabId: sender.tab?.id ?? null, modo: "ventana", windowId: pre.windowId, ts: Date.now() },
        });
        if (pre.adresTabId != null) {
          try {
            await chrome.tabs.sendMessage(pre.adresTabId, { tipo: "consultarAhora", cedula });
          } catch {
            /* aún cargando: el formulario la pedirá al terminar de cargar */
          }
        }
        return responder({ ok: true, precargada: true });
      }
      const v = await abrirOculta(sender.tab?.id);
      await chrome.storage.session.set({
        pendiente: { cedula, tabId: sender.tab?.id ?? null, modo: "ventana", windowId: v.windowId, ts: Date.now() },
      });
      return responder({ ok: true });
    }

    if (msg?.tipo === "pendiente") {
      const p = await leerPendiente();
      // Solo el marco de esa consulta toma la cédula (el oculto no tiene pestaña).
      const delOculto = p?.modo === "offscreen" && !sender.tab;
      const deLaVentana = p?.modo !== "offscreen" && sender.tab?.windowId === p?.windowId;
      if (p && (delOculto || deLaVentana)) {
        return responder({ cedula: p.cedula, clics: p.clics ?? 0 });
      }
      return responder(null);
    }

    // Se cuenta cada clic en «Consultar» (ADRES recarga la página y no se debe
    // pulsar en bucle).
    if (msg?.tipo === "marcarClic") {
      const p = await leerPendiente();
      const clics = (p?.clics ?? 0) + 1;
      if (p) await chrome.storage.session.set({ pendiente: { ...p, clics } });
      return responder({ ok: true, clics });
    }

    // Avance del proceso en ADRES: se muestra en el modal de SIGCOMPRO.
    if (msg?.tipo === "progreso") {
      const p = await leerPendiente();
      if (p && !p.avance) await chrome.storage.session.set({ pendiente: { ...p, avance: true } });
      if (p?.tabId != null) {
        try {
          await chrome.tabs.sendMessage(p.tabId, { tipo: "progreso", texto: msg.texto });
        } catch {
          /* pestaña cerrada */
        }
      }
      return responder({ ok: true });
    }

    if (msg?.tipo === "resultado" || msg?.tipo === "error") {
      const p = await leerPendiente();
      if (!p) return responder({ ok: false });
      // En modo oculto, si ADRES no respondió (posible reto del captcha), se
      // repite en la ventana minimizada, que sí se puede mostrar para resolverlo.
      if (msg.tipo === "error" && msg.motivo === "sinRespuesta" && p.modo === "offscreen") {
        responder({ ok: true });
        await usarVentanaRespaldo(p);
        return;
      }
      if (p.tabId != null) {
        try {
          await chrome.tabs.sendMessage(p.tabId, { ...msg, cedulaConsultada: p.cedula });
        } catch {
          /* la pestaña de SIGCOMPRO se cerró */
        }
      }
      responder({ ok: true });
      if (msg.tipo === "error" && p.windowId != null) {
        // Algo falló o ADRES pide un reto: se muestra la ventana para resolverlo.
        await chrome.storage.session.set({ pendiente: { ...p, mostrar: true } });
        try {
          await chrome.windows.update(p.windowId, { state: "normal", focused: true });
        } catch {
          /* ventana cerrada */
        }
      }
      if (msg.tipo === "resultado" && p.modo === "offscreen") {
        await chrome.storage.session.remove("pendiente");
        if (sender.tab?.id != null) {
          try {
            await chrome.tabs.remove(sender.tab.id);
          } catch {
            /* ya estaba cerrada */
          }
        }
        // Se deja el formulario listo para la siguiente consulta.
        chrome.runtime.sendMessage({ destino: "offscreen", tipo: "cargar" }).catch(() => undefined);
        return;
      }
      if (msg.tipo === "resultado") {
        await chrome.storage.session.remove("pendiente");
        if (sender.tab?.id != null && sender.tab.windowId !== p.windowId && sender.tab.id !== p.tabId) {
          try {
            await chrome.tabs.remove(sender.tab.id);
          } catch {
            /* ya estaba cerrada */
          }
        }
        await cerrarVentana(p.windowId);
        await volverASigcompro(p.tabId);
      }
      return;
    }

    if (msg?.tipo === "cancelar") {
      const p = await leerPendiente();
      await chrome.storage.session.remove("pendiente");
      if (p?.modo === "offscreen") {
        chrome.runtime.sendMessage({ destino: "offscreen", tipo: "cargar" }).catch(() => undefined);
      } else if (p) await cerrarVentana(p.windowId);
      responder({ ok: true });
    }
  })();
  return true;
});
