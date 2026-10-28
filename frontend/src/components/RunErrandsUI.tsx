"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { AlertCircle, Inbox, X } from "lucide-react";

export const fieldClass = "min-w-0 rounded-lg border border-brand-brown/20 bg-white px-3 py-2 text-sm text-brand-black outline-none transition focus:border-brand-wine focus:ring-2 focus:ring-brand-wine/10 disabled:opacity-50";
export const primaryClass = "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-brand-wine px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-wine-dark disabled:cursor-not-allowed disabled:opacity-50";
export const secondaryClass = "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-brand-brown/20 bg-white px-3 py-2 text-sm font-semibold text-brand-black transition hover:bg-brand-cream-soft disabled:opacity-50";
export const tableClass = "w-full text-left text-sm [&_th]:whitespace-nowrap [&_th]:px-4 [&_th]:py-3 [&_th]:text-xs [&_th]:font-semibold [&_th]:text-brand-black/60 [&_td]:px-4 [&_td]:py-3 [&_tbody_tr]:border-t [&_tbody_tr]:border-brand-brown/10 [&_tbody_tr]:transition-colors [&_tbody_tr:hover]:bg-brand-cream-soft/50";

export function PageHeader({ title, icon, children }: { title: string; icon: ReactNode; children?: ReactNode }) {
  return <header className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-brand-brown/10 pb-5">
    <div className="flex min-w-0 items-center gap-3"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-brand-wine/10 text-brand-wine">{icon}</span>
      <div className="min-w-0"><p className="text-xs font-semibold text-brand-black/60">Run-Errands</p><h1 className="break-words font-serif text-2xl font-bold text-brand-wine">{title}</h1></div></div>
    <div className="flex flex-wrap items-center gap-2">{children}</div>
  </header>;
}

const tones = { wine: "bg-brand-wine/10 text-brand-wine", green: "bg-emerald-50 text-emerald-700", blue: "bg-sky-50 text-sky-700", amber: "bg-amber-50 text-amber-700", red: "bg-rose-50 text-rose-700", teal: "bg-teal-50 text-teal-700" };

export function Metric({ title, value, detail, icon, tone = "wine" }: { title: string; value: string | number; detail?: string; icon: ReactNode; tone?: keyof typeof tones }) {
  return <div className="flex min-w-0 items-start gap-3 rounded-lg border border-brand-brown/10 bg-white p-4">
    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${tones[tone]}`}>{icon}</span>
    <div className="min-w-0"><p className="text-xs font-medium text-brand-black/70">{title}</p><p className="mt-1 break-words text-2xl font-bold tabular-nums text-brand-black">{typeof value === "number" ? value.toLocaleString("es-CO") : value}</p>{detail && <p className="mt-1 text-xs text-brand-black/55">{detail}</p>}</div>
  </div>;
}

export function IconAction({ label, onClick, children, disabled, danger = false }: { label: string; onClick: () => void; children: ReactNode; disabled?: boolean; danger?: boolean }) {
  return <button type="button" title={label} aria-label={label} onClick={onClick} disabled={disabled}
    className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-transparent transition disabled:opacity-40 ${danger ? "text-rose-600 hover:border-rose-200 hover:bg-rose-50" : "text-brand-black/65 hover:border-brand-brown/15 hover:bg-brand-cream-soft hover:text-brand-wine"}`}>{children}</button>;
}

export function ErrorBanner({ message }: { message: string | null }) {
  return message ? <div role="alert" className="mb-4 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{message}</span></div> : null;
}

export function EmptyState({ text = "No hay registros para estos filtros." }: { text?: string }) {
  return <div className="flex flex-col items-center gap-3 px-5 py-12 text-center text-sm text-brand-black/60"><Inbox className="h-8 w-8 text-brand-black/25" />{text}</div>;
}

export function Modal({ title, onClose, busy = false, children }: { title: string; onClose: () => void; busy?: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  const cerrarActual = useRef(onClose);
  const ocupado = useRef(busy);
  useEffect(() => { cerrarActual.current = onClose; ocupado.current = busy; }, [onClose, busy]);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const teclado = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); if (!ocupado.current) cerrarActual.current(); }
    };
    document.addEventListener("keydown", teclado);
    return () => { dialog?.close(); document.body.style.overflow = previous; document.removeEventListener("keydown", teclado); };
  }, []);
  return <dialog ref={ref} aria-labelledby={id} onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}
    className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-xl overflow-y-auto rounded-lg border border-brand-brown/10 bg-white p-0 text-brand-black shadow-2xl backdrop:bg-black/45">
    <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-brand-brown/10 bg-white px-5 py-4"><h2 id={id} className="font-serif text-xl font-bold text-brand-wine">{title}</h2><IconAction label="Cerrar" onClick={onClose} disabled={busy}><X className="h-5 w-5" /></IconAction></div>
    <div className="p-5">{children}</div>
  </dialog>;
}

export function ActiveBadge({ active }: { active: boolean }) {
  return <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1 text-xs font-medium ${active ? "bg-emerald-50 text-emerald-700" : "bg-neutral-100 text-neutral-500"}`}><span className={`h-1.5 w-1.5 rounded-full ${active ? "bg-emerald-500" : "bg-neutral-400"}`} />{active ? "Activo" : "Inactivo"}</span>;
}