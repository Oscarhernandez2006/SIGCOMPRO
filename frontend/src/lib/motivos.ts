import { apiFetch } from "./api";

export type TipoMotivo = "anular" | "cancelar";

export interface Motivo {
  id: string;
  tipo: TipoMotivo;
  nombre: string;
  activo: boolean;
  creado_en: string;
}

export interface MotivoInput {
  tipo: TipoMotivo;
  nombre: string;
  activo?: boolean;
}

/** Lista los motivos. Opcionalmente filtra por tipo y/o solo activos. */
export function listarMotivos(opts?: {
  tipo?: TipoMotivo;
  soloActivos?: boolean;
}): Promise<Motivo[]> {
  const params = new URLSearchParams();
  if (opts?.tipo) params.set("tipo", opts.tipo);
  if (opts?.soloActivos) params.set("activos", "1");
  const qs = params.toString();
  return apiFetch<Motivo[]>(`/motivos${qs ? `?${qs}` : ""}`);
}

export function crearMotivo(input: MotivoInput): Promise<Motivo> {
  return apiFetch<Motivo>("/motivos", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function actualizarMotivo(
  id: string,
  input: Partial<MotivoInput>,
): Promise<Motivo> {
  return apiFetch<Motivo>(`/motivos/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function eliminarMotivo(id: string): Promise<{ id: string }> {
  return apiFetch<{ id: string }>(`/motivos/${id}`, {
    method: "DELETE",
  });
}
