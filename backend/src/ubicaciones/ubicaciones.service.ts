import { Injectable, Logger } from '@nestjs/common';

const API_BASE = 'https://api-colombia.com/api/v1';

interface CiudadApi {
  name: string;
  departmentId: number;
}

export interface CiudadSugerida {
  nombre: string;
  departamento: string | null;
}

@Injectable()
export class UbicacionesService {
  private readonly logger = new Logger(UbicacionesService.name);
  private departamentos: Map<number, string> | null = null;

  /** Carga (una sola vez) el mapa id→nombre de departamentos. */
  private async cargarDepartamentos(): Promise<Map<number, string>> {
    if (this.departamentos) return this.departamentos;
    const mapa = new Map<number, string>();
    try {
      const res = await fetch(`${API_BASE}/Department`);
      if (res.ok) {
        const data = (await res.json()) as Array<{ id: number; name: string }>;
        for (const d of data) mapa.set(d.id, d.name);
      }
    } catch (e) {
      this.logger.warn(`No se pudieron cargar departamentos: ${String(e)}`);
    }
    this.departamentos = mapa;
    return mapa;
  }

  /** Busca ciudades de Colombia por nombre (autocompletar). */
  async buscarCiudades(q?: string): Promise<CiudadSugerida[]> {
    const texto = (q ?? '').trim();
    if (texto.length < 2) return [];

    const deptos = await this.cargarDepartamentos();
    try {
      const res = await fetch(
        `${API_BASE}/City/search/${encodeURIComponent(texto)}`,
      );
      if (!res.ok) return [];
      const data = (await res.json()) as CiudadApi[];
      if (!Array.isArray(data)) return [];

      const vistos = new Set<string>();
      const out: CiudadSugerida[] = [];
      for (const c of data) {
        if (!c?.name || vistos.has(c.name)) continue;
        vistos.add(c.name);
        out.push({
          nombre: c.name,
          departamento: deptos.get(c.departmentId) ?? null,
        });
        if (out.length >= 15) break;
      }
      return out;
    } catch (e) {
      this.logger.warn(`Error consultando ciudades: ${String(e)}`);
      return [];
    }
  }

  /** Devuelve el departamento de una ciudad (coincidencia exacta) o null. */
  async departamentoDeCiudad(ciudad?: string): Promise<string | null> {
    const texto = (ciudad ?? '').trim();
    if (texto.length < 2) return null;
    try {
      const sugeridas = await this.buscarCiudades(texto);
      const norm = (v: string) =>
        v
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .trim()
          .toLowerCase();
      const exacta = sugeridas.find((c) => norm(c.nombre) === norm(texto));
      return (exacta ?? sugeridas[0])?.departamento ?? null;
    } catch {
      return null;
    }
  }
}
