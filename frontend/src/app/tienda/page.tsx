"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Anton, Oswald } from "next/font/google";
import { API_URL } from "@/lib/api";

const anton = Anton({ subsets: ["latin"], weight: "400" });
const oswald = Oswald({ subsets: ["latin"], weight: ["500", "600", "700"] });

interface TiendaResumen {
  slug: string;
  nombre: string;
  ciudad: string | null;
}

export default function TiendasIndexPage() {
  const [tiendas, setTiendas] = useState<TiendaResumen[]>([]);
  const [estado, setEstado] = useState<"cargando" | "ok" | "error">("cargando");

  useEffect(() => {
    let vigente = true;
    fetch(`${API_URL}/menu/tiendas`)
      .then((r) => {
        if (!r.ok) throw new Error("error");
        return r.json();
      })
      .then((data: TiendaResumen[]) => {
        if (!vigente) return;
        setTiendas(data);
        setEstado("ok");
      })
      .catch(() => vigente && setEstado("error"));
    return () => {
      vigente = false;
    };
  }, []);

  return (
    <main className="min-h-screen bg-[#0a0a0a] px-5 py-12 text-[#f2eee6]">
      <div className="mx-auto max-w-2xl text-center">
        <Image
          src="/LOGOCARNESSANTACRUZ.png"
          alt="Carnes Santacruz"
          width={200}
          height={200}
          priority
          className="mx-auto h-28 w-auto object-contain"
        />
        <h1 className={`${anton.className} mt-4 text-3xl uppercase tracking-wide text-[#e5b24b]`}>
          Nuestras tiendas
        </h1>
        <p className={`${oswald.className} mt-1 text-sm uppercase tracking-[0.2em] text-[#cfc7b8]`}>
          Elige un punto para ver su lista de precios
        </p>

        <div className="mt-8 space-y-3 text-left">
          {estado === "cargando" && (
            <p className="text-center text-[#cfc7b8]">Cargando…</p>
          )}
          {estado === "error" && (
            <p className="text-center text-[#cfc7b8]">
              No se pudieron cargar las tiendas.
            </p>
          )}
          {estado === "ok" && tiendas.length === 0 && (
            <p className="text-center text-[#cfc7b8]">
              No hay tiendas publicadas.
            </p>
          )}
          {tiendas.map((t) => (
            <Link
              key={t.slug}
              href={`/tienda/${t.slug}`}
              className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-4 transition hover:border-[#e5b24b]/50 hover:bg-white/[0.06]"
            >
              <div>
                <div className={`${oswald.className} text-lg font-semibold uppercase text-[#f2eee6]`}>
                  {t.nombre}
                </div>
                {t.ciudad && (
                  <div className="text-xs text-[#cfc7b8]">{t.ciudad}</div>
                )}
              </div>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5 text-[#e5b24b]">
                <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
              </svg>
            </Link>
          ))}
        </div>

        <div className={`${oswald.className} mt-12 text-lg font-bold uppercase text-[#e5b24b]`}>
          ¡Calidad <span className="text-white">Superior!</span>
        </div>
        <div className="mt-1 text-xs uppercase tracking-[0.3em] text-[#cfc7b8]">
          www.carnessantacruz.co
        </div>
      </div>
    </main>
  );
}
