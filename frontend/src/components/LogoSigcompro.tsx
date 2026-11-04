"use client";

/**
 * Logo animado de SIGCOMPRO: moto de domicilios con la caja "SIGCOMPRO",
 * pin de entrega con check, líneas de velocidad y carretera en movimiento.
 * SVG puro + CSS (sin imágenes). Respeta `prefers-reduced-motion`.
 */
export default function LogoSigcompro({ className = "h-12 w-auto" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 200 104"
      overflow="visible"
      className={className}
      role="img"
      aria-label="SIGCOMPRO — Pedidos y despacho"
      fill="none"
    >
      <style>{`
        .lg-moto { animation: lg-bob 0.55s ease-in-out infinite; transform-origin: 100px 50px; }
        .lg-road { stroke-dasharray: 14 10; animation: lg-road 0.6s linear infinite; }
        .lg-speed { animation: lg-speed 0.7s ease-in-out infinite; }
        .lg-speed2 { animation-delay: 0.18s; }
        .lg-speed3 { animation-delay: 0.36s; }
        .lg-pin { animation: lg-pin 1.4s ease-in-out infinite; transform-origin: 172px 36px; }
        .lg-wheel { animation: lg-spin 0.5s linear infinite; }
        .lg-sweep { animation: lg-sweep 3.2s ease-in-out infinite; }
        .lg-pulse { animation: lg-pulse 1.4s ease-in-out infinite; transform-origin: 136px 34px; }
        .lg-twinkle { animation: lg-twinkle 1.4s ease-in-out infinite; transform-origin: 172px 24px; }
        .lg-wheel-r { transform-origin: 70px 53px; }
        .lg-wheel-f { transform-origin: 138px 53px; }
        @keyframes lg-bob { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-1.2px) } }
        @keyframes lg-road { to { stroke-dashoffset: -24 } }
        @keyframes lg-speed { 0%,100% { opacity: .15; transform: translateX(6px) } 50% { opacity: 1; transform: translateX(0) } }
        @keyframes lg-pin { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-4px) } }
        @keyframes lg-spin { to { transform: rotate(360deg) } }
        @keyframes lg-sweep { 0%,35% { transform: translateX(-120px) } 65%,100% { transform: translateX(120px) } }
        @keyframes lg-pulse { 0%,100% { opacity: .35; transform: scale(1) } 50% { opacity: .9; transform: scale(1.5) } }
        @keyframes lg-twinkle { 0%,100% { opacity: .25 } 50% { opacity: .8 } }
        @media (prefers-reduced-motion: reduce) {
          .lg-moto, .lg-road, .lg-speed, .lg-pin, .lg-wheel, .lg-sweep, .lg-pulse, .lg-twinkle { animation: none; }
        }
      `}</style>

      <defs>
        <linearGradient id="lg-wine" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#8A2438" />
          <stop offset="1" stopColor="#531320" />
        </linearGradient>
        <linearGradient id="lg-amber" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#F0A25E" />
          <stop offset="1" stopColor="#C6621F" />
        </linearGradient>
        <linearGradient id="lg-text" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#6E1A2B" />
          <stop offset="0.5" stopColor="#9B2C42" />
          <stop offset="1" stopColor="#6E1A2B" />
        </linearGradient>
        <linearGradient id="lg-shine" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#FFF4D6" stopOpacity="0" />
          <stop offset="0.5" stopColor="#FFF4D6" stopOpacity=".85" />
          <stop offset="1" stopColor="#FFF4D6" stopOpacity="0" />
        </linearGradient>
        <filter id="lg-shadow" x="-20%" y="-20%" width="140%" height="160%">
          <feDropShadow dx="0" dy="2.5" stdDeviation="2" floodColor="#531320" floodOpacity=".35" />
        </filter>
        <filter id="lg-glow" x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="2.2" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <filter id="lg-glow-soft" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="1" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <clipPath id="lg-clip-text">
          <text x="100" y="86" textAnchor="middle" fontFamily="'Playfair Display', Georgia, serif" fontWeight="700" fontSize="20" letterSpacing="1.5">SIGCOMPRO</text>
        </clipPath>
      </defs>

      {/* Carretera */}
      <line x1="0" y1="62" x2="200" y2="62" stroke="#6E1A2B" strokeWidth="2" strokeLinecap="round" />
      <line className="lg-road" x1="0" y1="68" x2="200" y2="68" stroke="#6E1A2B" strokeWidth="2" strokeLinecap="round" opacity=".8" />

      {/* Líneas de velocidad */}
      <g stroke="#D9772E" strokeWidth="3" strokeLinecap="round">
        <line className="lg-speed" x1="8" y1="30" x2="30" y2="30" />
        <line className="lg-speed lg-speed2" x1="2" y1="38" x2="30" y2="38" />
        <line className="lg-speed lg-speed3" x1="12" y1="46" x2="30" y2="46" />
      </g>

      <g className="lg-moto" filter="url(#lg-shadow)">
        {/* Cajón térmico de domicilios sobre la parrilla trasera */}
        <g transform="rotate(-4 52 26)">
          {/* asa */}
          <rect x="45" y="4" width="14" height="5" rx="2.5" fill="#3D211C" />
          {/* cuerpo */}
          <rect x="31" y="8" width="42" height="34" rx="4" fill="url(#lg-wine)" stroke="#531320" strokeWidth="1.5" />
          {/* tapa */}
          <path d="M31 12 a4 4 0 0 1 4 -4 h34 a4 4 0 0 1 4 4 v6 h-42 z" fill="#8A2438" />
          <rect x="31" y="17.5" width="42" height="1.6" fill="#F5EFE2" opacity=".7" />
          {/* correas */}
          <rect x="37" y="8" width="3" height="34" fill="#D9772E" opacity=".9" />
          <rect x="64" y="8" width="3" height="34" fill="#D9772E" opacity=".9" />
          {/* emblema frontal: cloche de comida */}
          <circle cx="52" cy="30" r="7" fill="#F5EFE2" />
          <path d="M46.5 31.5 a5.5 5.5 0 0 1 11 0 z" fill="#D9772E" />
          <rect x="45.5" y="31.5" width="13" height="1.6" rx=".8" fill="#6E1A2B" />
          <circle cx="52" cy="25.3" r="1" fill="#6E1A2B" />
          {/* brillo */}
          <rect x="33" y="10" width="38" height="5" rx="2.5" fill="#FFFFFF" opacity=".18" />
        </g>
        <path d="M50 42v4h20" stroke="#6E1A2B" strokeWidth="2.5" strokeLinecap="round" fill="none" />

        {/* Ruedas con neumático */}
        <g className="lg-wheel lg-wheel-r">
          <circle cx="70" cy="52.5" r="10" fill="#3D211C" />
          <circle cx="70" cy="52.5" r="5.5" fill="#F5EFE2" />
          <path d="M70 48v10M65 53h10" stroke="#6E1A2B" strokeWidth="1.4" />
          <circle cx="70" cy="53" r="1.8" fill="#6E1A2B" />
        </g>
        <g className="lg-wheel lg-wheel-f">
          <circle cx="138" cy="52.5" r="10" fill="#3D211C" />
          <circle cx="138" cy="52.5" r="5.5" fill="#F5EFE2" />
          <path d="M138 48v10M133 53h10" stroke="#6E1A2B" strokeWidth="1.4" />
          <circle cx="138" cy="53" r="1.8" fill="#6E1A2B" />
        </g>

        {/* Scooter */}
        <path d="M58 54 A12 12 0 0 1 82 54 Z" fill="url(#lg-wine)" />
        <path d="M66 50 L66 42 Q66 36 72 36 L100 36 Q106 36 108 42 L114 50 Z" fill="url(#lg-wine)" />
        <path d="M70 36 Q72 31 80 31 L98 31 Q104 31 104 36 Z" fill="#3D211C" />
        <rect x="82" y="50" width="42" height="5.5" rx="1.5" fill="url(#lg-wine)" />
        <rect x="88" y="51.5" width="30" height="1.6" fill="#F5EFE2" opacity=".8" />
        <path d="M118 55 L126 28 Q127 24 131 24 L135 24 L133 55 Z" fill="url(#lg-wine)" />
        <path d="M126 54 A12 12 0 0 1 150 54 Z" fill="url(#lg-wine)" />
        <path d="M131 26 L145 21" stroke="#6E1A2B" strokeWidth="3.5" strokeLinecap="round" />
        <circle cx="146" cy="20.5" r="2.6" fill="#3D211C" />
        <circle className="lg-pulse" cx="136" cy="34" r="5" fill="#F0A25E" filter="url(#lg-glow)" />
        <circle cx="136" cy="34" r="3.8" fill="url(#lg-amber)" stroke="#6E1A2B" strokeWidth="1.5" />
        <circle cx="137" cy="33" r="1.2" fill="#F5EFE2" />

        {/* Conductor */}
        <path d="M86 34 L90 42 L110 45 L113 39 L96 33 Z" fill="#3D211C" />
        <path d="M107 39 L113 39 L114 51 L105 51 Z" fill="#3D211C" />
        <path d="M84 37 L88 22 Q92 15 100 15 L108 17 L110 26 L98 38 Z" fill="url(#lg-amber)" />
        <path d="M103 18 L141 21 L140.5 26 L104 26 Z" fill="url(#lg-amber)" />
        <circle cx="142" cy="23" r="2.8" fill="#3D211C" />
        <path d="M100 15 L102 9 L110 10 L108 17 Z" fill="#6E1A2B" />
        <circle cx="105" cy="9" r="7.5" fill="url(#lg-wine)" />
        <path d="M100 5 Q103 2.5 106.5 3.2" stroke="#F5EFE2" strokeWidth="1.3" strokeLinecap="round" opacity=".6" />
        <path d="M105 6 Q110 3 112.5 8 L112.5 12 Q109 10 104 11 Z" fill="#F5EFE2" />
        <path d="M97.5 9 h15" stroke="#3D211C" strokeWidth="1.2" strokeLinecap="round" opacity=".6" />
      </g>

      {/* Pin de entrega con check */}
      <g className="lg-pin">
        <path
          d="M172 44c-7-8-11-13-11-19a11 11 0 0 1 22 0c0 6-4 11-11 19z"
          fill="url(#lg-amber)"
          stroke="#6E1A2B"
          strokeWidth="2"
          strokeLinejoin="round"
          filter="url(#lg-glow-soft)"
        />
        <circle className="lg-twinkle" cx="166" cy="19" r="2" fill="#FFF4D6" />
        <path d="M166 25l4 4 8-8" stroke="#F5EFE2" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </g>

      {/* Nombre (debajo de la animación) */}
      <text
        x="100"
        y="86"
        textAnchor="middle"
        fontFamily="'Playfair Display', Georgia, serif"
        fontWeight="700"
        fontSize="20"
        fill="url(#lg-text)"
        letterSpacing="1.5"
        filter="url(#lg-glow-soft)"
      >
        SIGCOMPRO
      </text>
      <g clipPath="url(#lg-clip-text)">
        <rect className="lg-sweep" x="70" y="68" width="60" height="24" fill="url(#lg-shine)" />
      </g>
      <text
        x="100"
        y="99"
        textAnchor="middle"
        fontFamily="Manrope, Arial, sans-serif"
        fontWeight="600"
        fontSize="7.5"
        fill="#3D211C"
        letterSpacing="2.4"
      >
        PEDIDOS &amp; DESPACHO
      </text>
    </svg>
  );
}
