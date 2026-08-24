"use client";

import { use, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { API_URL } from "@/lib/api";
import {
  PORTADA_IMG,
  paginarItems,
  precioMenu,
  umMenu,
  type ItemMenu,
  type PaginaMenu,
} from "@/lib/menu-plantillas";

interface MenuProducto {
  referencia: string;
  producto: string;
  um: string;
  precio: number;
}
interface MenuCategoria {
  categoria: string;
  productos: MenuProducto[];
}
interface MenuTienda {
  slug: string;
  nombre: string;
  direccion: string | null;
  telefono: string | null;
  barrio: string | null;
  ciudad: string | null;
  categorias: MenuCategoria[];
}

/** Alto de la hoja en unidades de container-query (100cqh = alto de la hoja). */
const CQH = 100;

/** Una hoja del menú: fondo real + lista de productos superpuesta. */
function HojaCategoria({ pagina }: { pagina: PaginaMenu }) {
  const { plantilla, items } = pagina;
  const { area, filasPorPagina } = plantilla;
  const areaAlto = CQH - area.top - area.bottom;
  const filaCqh = areaAlto / filasPorPagina;
  const fuenteCqh = filaCqh * 0.44;

  return (
    <div className="relative mx-auto aspect-[2/3] w-full max-w-[560px] overflow-hidden bg-black [container-type:size]">
      <Image
        src={plantilla.imagen}
        alt=""
        fill
        sizes="(max-width: 560px) 100vw, 560px"
        className="object-fill"
      />
      <div
        className="absolute"
        style={{
          top: `${area.top}%`,
          left: `${area.left}%`,
          right: `${area.right}%`,
          bottom: `${area.bottom}%`,
        }}
      >
        {items.map((it) => (
          <div
            key={it.referencia}
            className="flex items-center gap-[2cqw]"
            style={{ height: `${filaCqh}cqh`, fontSize: `${fuenteCqh}cqh` }}
          >
            <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap uppercase text-white">
              {it.producto || it.referencia}
            </span>
            <span className="whitespace-nowrap text-right font-semibold tabular-nums text-white">
              {it.precio > 0 ? precioMenu(it.precio) : "—"}
              {it.precio > 0 && umMenu(it.um) && (
                <span
                  className="ml-[0.5cqw] font-normal text-[#e9e2d4]"
                  style={{ fontSize: `${fuenteCqh * 0.72}cqh` }}
                >
                  {umMenu(it.um)}
                </span>
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Portada con el nombre de la tienda superpuesto. */
function HojaPortada({ nombre }: { nombre: string }) {
  return (
    <div className="relative mx-auto aspect-[2/3] w-full max-w-[560px] overflow-hidden bg-black [container-type:size]">
      <Image
        src={PORTADA_IMG}
        alt="Carnes Santacruz"
        fill
        priority
        sizes="(max-width: 560px) 100vw, 560px"
        className="object-fill"
      />
      <div className="absolute left-0 right-0 top-[3.2%] flex justify-center px-[2cqw]">
        <div className="flex min-w-[58%] max-w-[90%] flex-col items-center gap-[0.55cqh] rounded-[1.1cqh] border border-[#e5b24b]/45 bg-black/45 px-[2.2cqw] py-[1.3cqh] shadow-[0_1.5cqh_3.5cqh_rgba(0,0,0,0.35)] backdrop-blur-[2px]">
          <Image
            src="/LOGOCARNESSANTACRUZ.png"
            alt="Carnes Santacruz"
            width={170}
            height={170}
            className="h-[11cqh] w-auto object-contain"
          />
          {nombre && (
            <div
              className="w-full text-center font-extrabold uppercase tracking-[0.08em] text-[#f4bf56]"
              style={{ fontSize: "2.1cqh", textShadow: "0 0.7cqh 1.8cqh rgba(0,0,0,.55)" }}
            >
              {nombre}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function TiendaMenuPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const [tienda, setTienda] = useState<MenuTienda | null>(null);
  const [estado, setEstado] = useState<"cargando" | "ok" | "error">("cargando");

  useEffect(() => {
    let vigente = true;
    setEstado("cargando");
    fetch(`${API_URL}/menu/${encodeURIComponent(slug)}`)
      .then((r) => {
        if (!r.ok) throw new Error("no encontrada");
        return r.json();
      })
      .then((data: MenuTienda) => {
        if (!vigente) return;
        setTienda(data);
        setEstado("ok");
      })
      .catch(() => vigente && setEstado("error"));
    return () => {
      vigente = false;
    };
  }, [slug]);

  // Aplana los productos y los reparte en hojas según su plantilla.
  const paginas = useMemo(() => {
    if (!tienda) return [];
    const items: ItemMenu[] = tienda.categorias.flatMap((c) =>
      c.productos.map((p) => ({
        referencia: p.referencia,
        producto: p.producto,
        categoria: c.categoria,
        um: p.um,
        precio: p.precio,
      })),
    );
    return paginarItems(items);
  }, [tienda]);

  // Bloques únicos (para la barra de navegación y las anclas).
  const bloques = useMemo(() => {
    const vistos = new Set<string>();
    const lista: { clave: string; etiqueta: string; indice: number }[] = [];
    paginas.forEach((pag, i) => {
      if (vistos.has(pag.plantilla.clave)) return;
      vistos.add(pag.plantilla.clave);
      lista.push({
        clave: pag.plantilla.clave,
        etiqueta: pag.items[0]?.categoria ?? pag.plantilla.clave,
        indice: i,
      });
    });
    return lista;
  }, [paginas]);

  const inicioBloque = useMemo(
    () => new Map(bloques.map((b) => [b.indice, b.clave])),
    [bloques],
  );

  if (estado === "cargando") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black text-[#cfc7b8]">
        <p>Cargando menú…</p>
      </main>
    );
  }

  if (estado === "error" || !tienda) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-black px-6 text-center text-[#cfc7b8]">
        <Image
          src="/LOGOCARNESSANTACRUZ.png"
          alt="Carnes Santacruz"
          width={120}
          height={120}
          className="h-24 w-auto object-contain opacity-90"
        />
        <h1 className="text-2xl font-bold text-[#e5b24b]">Tienda no encontrada</h1>
        <p>Verifica el enlace del menú con tu asesor de Carnes Santacruz.</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black">
      {bloques.length > 1 && (
        <nav className="sticky top-0 z-20 border-b border-white/10 bg-black/95 backdrop-blur">
          <div className="mx-auto flex max-w-[560px] gap-2 overflow-x-auto px-3 py-2.5">
            {bloques.map((b) => (
              <a
                key={b.clave}
                href={`#bloque-${b.clave}`}
                className="shrink-0 rounded-full border border-[#e5b24b]/40 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[#e5b24b] transition hover:bg-[#e5b24b] hover:text-black"
              >
                {b.etiqueta}
              </a>
            ))}
          </div>
        </nav>
      )}
      <div className="mx-auto max-w-[560px] space-y-3 px-2 py-3 sm:px-0 sm:py-6">
        <HojaPortada nombre={tienda.nombre.toUpperCase()} />
        {paginas.map((pagina, i) => {
          const ancla = inicioBloque.get(i);
          return (
            <div
              key={`${pagina.plantilla.clave}-${i}`}
              id={ancla ? `bloque-${ancla}` : undefined}
              className="scroll-mt-14"
            >
              <HojaCategoria pagina={pagina} />
            </div>
          );
        })}
        {paginas.length === 0 && (
          <p className="py-16 text-center text-[#cfc7b8]">
            Esta tienda aún no tiene precios publicados.
          </p>
        )}
      </div>
    </main>
  );
}
