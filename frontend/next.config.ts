import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  devIndicators: false,
  // Genera un build autocontenido para producción (imagen Docker ligera).
  output: "standalone",
  // Fija la raíz del proyecto a esta carpeta para evitar que Turbopack
  // infiera mal el directorio raíz por culpa de lockfiles externos.
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
