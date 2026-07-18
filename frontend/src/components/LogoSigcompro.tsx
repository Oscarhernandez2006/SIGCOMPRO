"use client";

/**
 * Logo de marca SIGCOMPRO recreado en código (SVG/CSS) con animación.
 *
 * Ciclo de 30s (clase .logo-anim + keyframes en globals.css):
 *  1. La moto arranca (humito) y la "G" cae con 3 rebotes hasta el tamaño de
 *     las letras -> se lee "SIGCOMPRO".
 *  2. La moto se va y se estaciona junto a la primera "S" (~20s parada).
 *  3. Arranca de nuevo, choca con la "G" y la "G" queda encima de la moto
 *     (logo ensamblado). Se repite.
 */
export default function LogoSigcompro({ className }: { className?: string }) {
  return (
    <div
      className={`logo-anim flex select-none flex-col items-center leading-none ${className ?? ""}`}
      aria-label="SIGCOMPRO · Gestión de Domicilios"
    >
      <div className="flex items-end">
        <span className="logo-si font-display text-[22px] font-extrabold tracking-tight text-brand-wine">
          SI
        </span>

        {/* Slot central angosto: la G queda junta en "SIGCOMPRO". */}
        <span className="relative mx-[1px] inline-block h-[30px] w-[16px] align-bottom">
          {/* G aérea / letra */}
          <span
            className="logo-g absolute bottom-[20px] left-1/2 z-20 font-display text-[15px] font-extrabold leading-none text-brand-wine"
            style={{ transformOrigin: "center bottom" }}
          >
            G
          </span>

          {/* Moto + humito (más ancha que el slot: sobresale y la envuelven las letras) */}
          <span
            className="logo-moto absolute bottom-0 left-[-11px] z-10 block h-[26px] w-[38px]"
            style={{ transformOrigin: "center bottom" }}
          >
            <Motico className="h-[26px] w-[38px]" />
            <span className="logo-smoke absolute bottom-[2px] left-[1px] h-[7px] w-[7px] rounded-full bg-brand-brown/40 blur-[1px]" />
          </span>
        </span>

        <span className="logo-ompro font-display text-[22px] font-extrabold tracking-tight text-brand-amber">
          OMPRO
        </span>
      </div>

      <span className="mt-[3px] text-[8px] font-semibold uppercase tracking-[0.18em] text-brand-wine/80">
        Gestión de Domicilios
      </span>
    </div>
  );
}

/** Silueta lateral de una Vespa/motico, cuerpo vino con detalles ámbar. */
function Motico({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 44" className={className} fill="none" aria-hidden="true">
      {/* Ruedas */}
      <circle cx="16" cy="34" r="8" fill="#6e1a2b" />
      <circle cx="16" cy="34" r="3.4" fill="#f5efe2" />
      <circle cx="50" cy="34" r="8" fill="#6e1a2b" />
      <circle cx="50" cy="34" r="3.4" fill="#f5efe2" />

      {/* Guardabarros trasero / cuerpo */}
      <path
        d="M9 31 C3 26 6 14 18 12.5 C29 11 33 20 33 30 L33 31 Z"
        fill="#6e1a2b"
      />
      {/* Asiento */}
      <path
        d="M15 13 C17 8 27 6.8 34.5 10 L35.5 17 L17 18 Z"
        fill="#6e1a2b"
      />
      {/* Piso / plataforma */}
      <path d="M31 31 L44 31 L50 25 L34 25 Z" fill="#6e1a2b" />
      {/* Escudo frontal (pierna) en ámbar */}
      <path
        d="M44 31 C55.5 31 57.5 15 55 8 L48 8 C48 16.5 45.5 25 39.5 25 L42 31 Z"
        fill="#d9772e"
      />
      {/* Manubrio */}
      <path
        d="M50.5 9 L60 3"
        stroke="#6e1a2b"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <circle cx="60.5" cy="2.5" r="3" fill="#6e1a2b" />
      {/* Farol */}
      <circle cx="52" cy="15.5" r="3.2" fill="#e8975a" />
    </svg>
  );
}
