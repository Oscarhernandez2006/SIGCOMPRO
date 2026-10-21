/** Sonido de nueva solicitud de extensión: tres notas ascendentes (distinto al timbre del chat). */
export function sonidoNuevaExtension() {
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    if (ctx.state === "suspended") void ctx.resume().catch(() => {});
    const ahora = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.value = 0.8;
    master.connect(ctx.destination);
    // Sol - Do - Mi (arpegio ascendente), timbre suave tipo marimba.
    const notas = [
      { freq: 783.99, inicio: 0 },
      { freq: 1046.5, inicio: 0.13 },
      { freq: 1318.5, inicio: 0.26 },
    ];
    for (const n of notas) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = n.freq;
      const inicio = ahora + n.inicio;
      gain.gain.setValueAtTime(0, inicio);
      gain.gain.linearRampToValueAtTime(0.55, inicio + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, inicio + 0.35);
      osc.connect(gain);
      gain.connect(master);
      osc.start(inicio);
      osc.stop(inicio + 0.4);
    }
    setTimeout(() => void ctx.close(), 1200);
  } catch {
    /* el navegador puede bloquear audio sin interacción previa */
  }
}

/** Pide permiso de notificaciones del sistema (solo si aún no se ha decidido). */
export function pedirPermisoNotificaciones() {
  if (typeof Notification === "undefined") return;
  if (Notification.permission === "default") void Notification.requestPermission().catch(() => {});
}

/** Notificación del sistema operativo; al hacer clic enfoca la pestaña y abre `url`. */
export function notificarSistema(titulo: string, cuerpo: string, url: string, etiqueta: string) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  try {
    const n = new Notification(titulo, { body: cuerpo, tag: etiqueta, icon: "/LOGOCARNESSANTACRUZ.png" });
    n.onclick = () => {
      window.focus();
      window.location.href = url;
      n.close();
    };
  } catch {
    /* algunos navegadores móviles solo permiten notificaciones vía service worker */
  }
}
