import type { FichaPersona, Incumplimiento } from "./incumplimientos";

const esc = (v: unknown) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const cop = (n: unknown) =>
  `$ ${Math.round(Number(n) || 0).toLocaleString("es-CO")}`;

const fechaHora = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleString("es-CO", {
        timeZone: "America/Bogota",
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      })
    : "—";

const soloFecha = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("es-CO", { timeZone: "America/Bogota", day: "2-digit", month: "long", year: "numeric" })
    : "—";

/** Solo admite data URLs de imagen (evita inyectar otras URLs en el informe). */
const imagenSegura = (src: string | null) => (src && /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(src) ? src : null);

function bloqueRegistro(r: Incumplimiento, n: number): string {
  const p = r.pedido ?? {};
  const c = p.cliente;
  const d = p.despacho;
  const img = imagenSegura(r.imagen);
  const productos = (p.productos ?? [])
    .map(
      (i) =>
        `<tr><td>${esc(i.referencia)}</td><td>${esc(i.producto)}</td><td class="num">${esc(i.cantidad)} ${esc(
          (i.um || "").toUpperCase() === "KG" ? "kg" : "und",
        )}</td><td class="num">${cop(i.valor)}</td></tr>`,
    )
    .join("");
  const dato = (k: string, v: unknown) =>
    v === null || v === undefined || v === "" ? "" : `<div class="dato"><span>${esc(k)}</span><b>${esc(v)}</b></div>`;
  return `
  <section class="registro">
    <div class="reg-head">
      <div><span class="reg-n">Registro ${n}</span><span class="reg-com">Comanda ${esc(r.comanda || p.comanda)}</span></div>
      <div class="reg-fecha">${esc(fechaHora(r.creadoEn))}</div>
    </div>
    <div class="grid3">
      ${dato("Punto de venta", r.puntoNombre)}
      ${dato("Estado al marcar", r.estadoPedido)}
      ${dato("N° del día", p.numeroDia)}
      ${dato("Fecha del pedido", fechaHora(p.fecha))}
      ${dato("Entrega programada", p.fechaProgramada)}
      ${dato("Hora de despacho pedida", p.horaDespacho)}
      ${dato("Medio de pago", p.pago)}
      ${dato("Tipo de entrega", p.entrega === "domicilio" ? "Domicilio" : p.entrega === "recoge" ? "Recoge en punto" : p.entrega)}
      ${dato("Vendedor", p.vendedor)}
    </div>
    <div class="motivo">
      <div class="motivo-t">Motivo</div>
      <div class="motivo-v">${esc(r.motivo)}</div>
      <div class="motivo-t">Descripción del incumplimiento</div>
      <div class="desc">${esc(r.descripcion).replace(/\n/g, "<br>")}</div>
      ${r.criterio ? `<div class="motivo-t">Criterio de asignación del responsable</div><div class="desc">${esc(r.criterio)}</div>` : ""}
    </div>
    <div class="cols">
      <div>
        <div class="sub">Cliente</div>
        ${dato("Nombre", c?.nombre)}
        ${dato("NIT / Cédula", c?.nit)}
        ${dato("Dirección", c?.direccion)}
        ${dato("Barrio / Ciudad", [c?.barrio, c?.ciudad].filter(Boolean).join(", "))}
        ${dato("Teléfono", c?.telefono)}
      </div>
      <div>
        <div class="sub">Gestión de despacho registrada</div>
        ${dato("Porcionador", d?.porcionador || "Sin asignar")}
        ${dato("Inicio alistamiento", d?.inicioAlistamiento ? fechaHora(d.inicioAlistamiento) : "Sin iniciar")}
        ${dato("Fin alistamiento", d?.finAlistamiento ? fechaHora(d.finAlistamiento) : "Sin terminar")}
        ${dato("Factura", d?.factura || "Sin facturar")}
        ${dato("Domiciliario", d?.domiciliario || "Sin asignar")}
        ${dato("Pago confirmado", d ? (d.pagoConfirmado ? "Sí" : "No") : "")}
      </div>
    </div>
    ${
      productos
        ? `<table class="prod"><thead><tr><th>Ref.</th><th>Producto</th><th class="num">Cantidad</th><th class="num">Valor</th></tr></thead>
           <tbody>${productos}</tbody>
           <tfoot><tr><td colspan="3">Total del pedido${p.domicilio ? ` (incluye domicilio ${cop(p.domicilio)})` : ""}</td><td class="num">${cop(p.total)}</td></tr></tfoot></table>`
        : ""
    }
    ${
      img
        ? `<div class="evid"><div class="sub">Evidencia: pedido en Despacho al momento del registro</div><img src="${img}" alt="Evidencia comanda ${esc(r.comanda)}"></div>`
        : `<div class="evid sin">Sin imagen de evidencia (se conserva la copia de datos del pedido).</div>`
    }
    <div class="reg-pie">Registrado por <b>${esc(r.registradoPorNombre)}</b> · ID registro ${esc(r.id)}</div>
  </section>`;
}

/** Abre el informe imprimible (Guardar como PDF) de incumplimientos de una persona. */
export function generarInformeIncumplimientos(
  ficha: FichaPersona,
  registros: Incumplimiento[],
  opciones: { desde?: string; hasta?: string; emitidoPor?: string },
) {
  const per = ficha.persona;
  const ordenados = [...registros].sort((a, b) => a.creadoEn.localeCompare(b.creadoEn));
  const motivos = new Map<string, number>();
  for (const r of ordenados) motivos.set(r.motivo, (motivos.get(r.motivo) ?? 0) + 1);
  const puntos = [...new Set(ordenados.map((r) => r.puntoNombre).filter(Boolean))];
  const ahora = new Date();
  const codigo = `INC-${(per.cedula || per.id).replace(/[^\w-]/g, "")}-${ahora
    .toLocaleDateString("en-CA", { timeZone: "America/Bogota" })
    .replace(/-/g, "")}`;
  const periodo =
    opciones.desde || opciones.hasta
      ? `${opciones.desde ? soloFecha(`${opciones.desde}T12:00:00`) : "Inicio"} – ${
          opciones.hasta ? soloFecha(`${opciones.hasta}T12:00:00`) : "Hoy"
        }`
      : ordenados.length
        ? `${soloFecha(ordenados[0].creadoEn)} – ${soloFecha(ordenados[ordenados.length - 1].creadoEn)}`
        : "—";
  const logo = `${window.location.origin}/LOGOCARNESSANTACRUZ.png`;

  const indice = ordenados
    .map(
      (r, i) =>
        `<tr><td class="num">${i + 1}</td><td>${esc(fechaHora(r.creadoEn))}</td><td>${esc(r.comanda)}</td><td>${esc(
          r.puntoNombre,
        )}</td><td>${esc(r.estadoPedido)}</td><td>${esc(r.motivo)}</td></tr>`,
    )
    .join("");
  const motivosHtml = [...motivos.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([m, n]) => `<div class="mot"><span>${esc(m)}</span><b>${n}</b></div>`)
    .join("");

  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8">
  <title>${esc(codigo)} · Informe de incumplimientos · ${esc(per.nombre)}</title>
  <style>
    @page { size: Letter; margin: 14mm 13mm 16mm; }
    *{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    body{font-family:"Segoe UI",Arial,sans-serif;color:#1f1a17;font-size:11px;margin:0;line-height:1.4}
    .wine{color:#7a1f2b}
    header{display:flex;align-items:center;justify-content:space-between;border-bottom:3px solid #7a1f2b;padding-bottom:10px}
    header img{height:58px}
    .h-c{text-align:center;flex:1}
    .h-c .emp{font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:#6b5a50}
    .h-c h1{margin:2px 0 0;font-size:19px;color:#7a1f2b;letter-spacing:.02em}
    .h-c .h-sub{font-size:10.5px;color:#6b5a50}
    .h-r{text-align:right;font-size:9.5px;color:#6b5a50;min-width:150px}
    .h-r b{display:block;color:#1f1a17;font-size:11px}
    .conf{margin:8px 0 12px;background:#7a1f2b;color:#fff;text-align:center;font-size:9px;letter-spacing:.25em;padding:3px;border-radius:3px}
    h2{font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:#7a1f2b;border-bottom:1px solid #e3d6cc;padding-bottom:3px;margin:16px 0 8px}
    .ficha{display:grid;grid-template-columns:repeat(3,1fr);gap:6px 14px;background:#faf6f2;border:1px solid #eadfd6;border-radius:8px;padding:10px 12px}
    .dato{display:flex;flex-direction:column;margin-bottom:3px}
    .dato span{font-size:8.5px;text-transform:uppercase;letter-spacing:.06em;color:#8a786c}
    .dato b{font-size:11px;font-weight:600}
    .kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
    .kpi{border:1px solid #eadfd6;border-radius:8px;padding:8px 10px}
    .kpi span{font-size:8.5px;text-transform:uppercase;letter-spacing:.06em;color:#8a786c}
    .kpi b{display:block;font-size:18px;color:#7a1f2b}
    .kpi.alerta{background:#fdecec;border-color:#f3c2c2}
    .mots{margin-top:8px;display:grid;grid-template-columns:repeat(2,1fr);gap:4px 14px}
    .mot{display:flex;justify-content:space-between;border-bottom:1px dotted #d9c9bd;padding:2px 0}
    table{width:100%;border-collapse:collapse}
    th{background:#7a1f2b;color:#fff;font-size:9px;text-transform:uppercase;letter-spacing:.05em;text-align:left;padding:5px 6px}
    td{padding:4px 6px;border-bottom:1px solid #eee3da;vertical-align:top}
    tbody tr:nth-child(even) td{background:#fcf9f6}
    .num{text-align:right;white-space:nowrap}
    .registro{border:1px solid #e3d6cc;border-radius:10px;padding:12px;margin:12px 0;page-break-inside:avoid;break-inside:avoid}
    .registro + .registro{page-break-before:auto}
    .reg-head{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #eadfd6;padding-bottom:6px;margin-bottom:8px}
    .reg-n{background:#7a1f2b;color:#fff;border-radius:999px;padding:2px 10px;font-weight:700;font-size:10px;margin-right:8px}
    .reg-com{font-weight:700;font-size:12px}
    .reg-fecha{font-size:10px;color:#6b5a50}
    .grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:4px 14px}
    .motivo{margin:8px 0;background:#fdf3f3;border-left:4px solid #b42318;border-radius:4px;padding:8px 10px}
    .motivo-t{font-size:8.5px;text-transform:uppercase;letter-spacing:.06em;color:#8a3a33;margin-top:2px}
    .motivo-v{font-weight:700;font-size:12px;color:#b42318;margin-bottom:4px}
    .desc{font-size:11px}
    .cols{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:8px 0}
    .sub{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#7a1f2b;margin-bottom:4px}
    .prod{margin-top:6px}
    .prod tfoot td{font-weight:700;border-top:2px solid #7a1f2b;background:#faf6f2}
    .evid{margin-top:10px}
    .evid img{width:100%;border:1px solid #d9c9bd;border-radius:6px}
    .evid.sin{font-size:10px;color:#8a786c;font-style:italic}
    .reg-pie{margin-top:6px;font-size:9.5px;color:#6b5a50;text-align:right}
    .firmas{display:grid;grid-template-columns:repeat(3,1fr);gap:24px;margin-top:46px;page-break-inside:avoid}
    .firma{border-top:1px solid #1f1a17;padding-top:4px;text-align:center;font-size:10px}
    .firma span{display:block;color:#6b5a50;font-size:9px}
    .nota{margin-top:18px;font-size:9px;color:#6b5a50;border-top:1px solid #eadfd6;padding-top:6px}
  </style></head><body>
  <header>
    <img src="${logo}" alt="Carnes Santacruz" onerror="this.style.visibility='hidden'">
    <div class="h-c">
      <div class="emp">Carnes Santacruz · Grupo Santacruz</div>
      <h1>Informe de incumplimientos operativos</h1>
      <div class="h-sub">Pedidos no gestionados al cierre del turno · SIGCOMPRO</div>
    </div>
    <div class="h-r">Código<b>${esc(codigo)}</b>Emitido<b>${esc(fechaHora(ahora.toISOString()))}</b>${
      opciones.emitidoPor ? `Emitido por<b>${esc(opciones.emitidoPor)}</b>` : ""
    }</div>
  </header>
  <div class="conf">DOCUMENTO CONFIDENCIAL · USO EXCLUSIVO DE GERENCIA Y ADMINISTRACIÓN</div>

  <h2>1. Datos del colaborador</h2>
  <div class="ficha">
    <div class="dato"><span>Nombre completo</span><b>${esc(per.nombre)}</b></div>
    <div class="dato"><span>Cédula</span><b>${esc(per.cedula)}</b></div>
    <div class="dato"><span>Cargo / Rol</span><b style="text-transform:capitalize">${esc(per.rol || "—")}</b></div>
    <div class="dato"><span>Estado en el sistema</span><b>${per.activo ? "Activo" : "Inactivo"}</b></div>
    <div class="dato"><span>Puntos asignados</span><b>${esc(per.puntos.join(", ") || "—")}</b></div>
    <div class="dato"><span>Registrado en SIGCOMPRO</span><b>${esc(soloFecha(per.creadoEn))}</b></div>
  </div>

  <h2>2. Resumen del periodo</h2>
  <div class="kpis">
    <div class="kpi alerta"><span>Incumplimientos</span><b>${ordenados.length}</b></div>
    <div class="kpi"><span>Periodo evaluado</span><b style="font-size:11px;margin-top:4px">${esc(periodo)}</b></div>
    <div class="kpi"><span>Puntos involucrados</span><b style="font-size:11px;margin-top:4px">${esc(puntos.join(", ") || "—")}</b></div>
    <div class="kpi"><span>Valor de pedidos afectados</span><b style="font-size:14px;margin-top:2px">${cop(
      ordenados.reduce((s, r) => s + (Number(r.pedido?.total) || 0), 0),
    )}</b></div>
  </div>
  ${motivosHtml ? `<div class="mots">${motivosHtml}</div>` : ""}

  <h2>3. Relación de registros</h2>
  <table><thead><tr><th class="num">#</th><th>Fecha y hora</th><th>Comanda</th><th>Punto</th><th>Estado al marcar</th><th>Motivo</th></tr></thead>
  <tbody>${indice || `<tr><td colspan="6">Sin registros en el periodo.</td></tr>`}</tbody></table>

  <h2>4. Detalle y evidencia de cada registro</h2>
  ${ordenados.map((r, i) => bloqueRegistro(r, i + 1)).join("")}

  <div class="firmas">
    <div class="firma">Elaboró<span>${esc(opciones.emitidoPor || "Administración SIGCOMPRO")}</span></div>
    <div class="firma">Revisó / Aprobó<span>Gerencia</span></div>
    <div class="firma">Colaborador (enterado)<span>${esc(per.nombre)} · CC ${esc(per.cedula)}</span></div>
  </div>
  <p class="nota">
    Este informe se genera automáticamente con la información registrada en SIGCOMPRO. Cada registro conserva una copia
    fija del pedido y la imagen del tablero de Despacho en el momento en que se verificó que el pedido quedó sin gestionar
    al cierre del turno (después de las 8:00 p. m.). Su contenido sirve como soporte para los procesos administrativos y
    disciplinarios que la empresa determine.
  </p>
  </body></html>`;

  const w = window.open("", "_blank", "width=1000,height=800");
  if (!w) {
    alert("Permite las ventanas emergentes para generar el informe.");
    return;
  }
  w.document.write(html);
  w.document.close();
  w.focus();
  const imgs = Array.from(w.document.images);
  Promise.all(
    imgs.map((im) => (im.complete ? Promise.resolve() : new Promise((r) => ((im.onload = r), (im.onerror = r))))),
  ).then(() => setTimeout(() => w.print(), 300));
}
