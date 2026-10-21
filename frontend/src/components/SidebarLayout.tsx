"use client";

import { Children, cloneElement, createContext, isValidElement, useContext, useEffect, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, Check, ChevronLeft, ChevronRight, Pencil, RefreshCw, X } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { getUsuario } from "@/lib/auth";
import styles from "./SidebarLayout.module.css";

type PanelSidebar = "administrativo" | "operativo" | "club" | "run-errands";
const SidebarContext = createContext({
  collapsed: false, toggle: () => {}, editing: false, saving: false, canEdit: false, loaded: false,
  error: "", orden: [] as string[], edit: () => {}, cancel: () => {}, save: async () => {},
  move: (_id: string, _direction: number, _siblings: string[]) => {},
});

type MenuElementProps = {
  href?: string; title?: string; children?: ReactNode;
  "aria-label"?: string; "data-sidebar-id"?: string; "data-sidebar-children"?: boolean;
};

export function SidebarNav({ children, className }: { children: ReactNode; className?: string }) {
  const { editing, saving, orden, move } = useContext(SidebarContext);
  const renderItems = (nodes: ReactNode): ReactNode => {
    const elements = Children.toArray(nodes);
    const keyOf = (node: ReactNode) => isValidElement<MenuElementProps>(node) ? node.props["data-sidebar-id"] || node.props.href || "" : "";
    const ranks = new Map(orden.map((id, index) => [id, index]));
    const sorted = elements.filter(keyOf).sort((first, second) => (ranks.get(keyOf(first)) ?? orden.length + elements.indexOf(first)) - (ranks.get(keyOf(second)) ?? orden.length + elements.indexOf(second)));
    const siblings = sorted.map(keyOf);
    return [...elements.filter((node) => !keyOf(node)), ...sorted.map((node, index) => {
      if (!isValidElement<MenuElementProps>(node)) return node;
      const id = keyOf(node);
      const group = !!node.props["data-sidebar-id"];
      const title = node.props.title || node.props["aria-label"] || id;
      const content = group ? cloneElement(node, {}, Children.map(node.props.children, (child) => {
        if (!isValidElement<MenuElementProps>(child) || !child.props["data-sidebar-children"]) return child;
        return cloneElement(child, {}, renderItems(child.props.children));
      })) : node;
      return <div key={id} data-sidebar-entry className={editing ? styles.orderRow : undefined}>
        <div className={styles.orderContent} onClickCapture={(event) => { if (editing && !group) { event.preventDefault(); event.stopPropagation(); } }}>{content}</div>
        {editing && <div className={styles.orderActions}>
          <button type="button" aria-label={`Subir ${title}`} title={`Subir ${title}`} disabled={saving || index === 0} onClick={() => move(id, -1, siblings)}><ArrowUp aria-hidden="true" /></button>
          <button type="button" aria-label={`Bajar ${title}`} title={`Bajar ${title}`} disabled={saving || index === sorted.length - 1} onClick={() => move(id, 1, siblings)}><ArrowDown aria-hidden="true" /></button>
        </div>}
      </div>;
    })];
  };
  return <nav className={className} data-sidebar-editing={editing}>{renderItems(children)}</nav>;
}

export function useSidebarDrawer() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const drawer = document.querySelector<HTMLElement>("[data-sidebar-drawer]");
    if (!drawer) return;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    const tablet = window.matchMedia("(min-width: 768px)");
    const closeOnResize = () => { if (tablet.matches) setOpen(false); };
    const focusable = () => Array.from(drawer.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), [tabindex="0"]',
    )).filter((element) => element.getClientRects().length > 0);
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
      } else if (event.key === "Tab") {
        const items = focusable();
        const first = items[0];
        const last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.body.style.overflow = "hidden";
    focusable()[0]?.focus();
    document.addEventListener("keydown", handleKey);
    tablet.addEventListener("change", closeOnResize);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKey);
      tablet.removeEventListener("change", closeOnResize);
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, [open]);
  return [open, setOpen] as const;
}

export function SidebarToggle({ allowCollapse = true }: { allowCollapse?: boolean }) {
  const { collapsed, toggle, editing, saving, canEdit, loaded, error, edit, cancel, save } = useContext(SidebarContext);
  const label = collapsed ? "Expandir men\u00fa lateral" : "Contraer men\u00fa lateral";
  return (
    <div className={styles.controls} data-sidebar-controls data-editing={editing}>
    {allowCollapse && <button
      type="button"
      onClick={toggle}
      aria-label={label}
      aria-expanded={!collapsed}
      aria-controls="panel-sidebar-navigation"
      title={label}
      className={styles.toggle}
      disabled={editing}
    >
      {collapsed ? <ChevronRight aria-hidden="true" /> : <ChevronLeft aria-hidden="true" />}
    </button>}
    {canEdit && !editing && <button type="button" className={`${styles.toggle} ${styles.editButton}`} aria-label={error && !loaded ? "Reintentar cargar orden del menú" : "Organizar menú"} title={error && !loaded ? error : "Organizar menú"} onClick={edit}>
      {error && !loaded ? <RefreshCw aria-hidden="true" /> : <Pencil aria-hidden="true" />}
    </button>}
    {editing && <>
      <button type="button" className={`${styles.toggle} ${styles.editButton}`} title="Guardar orden" aria-label="Guardar orden" disabled={saving} onClick={() => void save()}><Check aria-hidden="true" /></button>
      <button type="button" className={styles.toggle} title="Cancelar organización" aria-label="Cancelar organización" disabled={saving} onClick={cancel}><X aria-hidden="true" /></button>
    </>}
    {error && (editing || !loaded) && <div role="alert" className={styles.orderError}>{error}</div>}
    </div>
  );
}

export default function SidebarLayout({ children, panel = "operativo" }: { children: ReactNode; panel?: PanelSidebar }) {
  const [collapsed, setCollapsed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [orden, setOrden] = useState<string[]>([]);
  const [guardado, setGuardado] = useState<string[]>([]);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    setCanEdit(["administrador", "administrador app", "desarrollador"].includes((getUsuario()?.rol || "").trim().toLowerCase()));
  }, []);

  useEffect(() => {
    if (editing) return;
    let active = true;
    const load = async () => {
      try {
        const data = await apiFetch<{ orden: string[] }>(`/configuracion/sidebar/${panel}`);
        if (active) { setOrden(data.orden); setGuardado(data.orden); setLoaded(true); setError(""); }
      } catch (failure) { if (active) setError(failure instanceof Error ? failure.message : "No se pudo cargar el orden."); }
    };
    void load();
    const interval = setInterval(load, 30000);
    return () => { active = false; clearInterval(interval); };
  }, [panel, editing, reload]);

  const move = (id: string, direction: number, siblings: string[]) => {
    const index = siblings.indexOf(id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= siblings.length || saving) return;
    const reordered = [...siblings];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    setOrden((previous) => {
      let position = 0;
      const members = new Set(siblings);
      return [...new Set([...previous, ...siblings])].map((key) => members.has(key) ? reordered[position++] : key);
    });
  };
  const save = async () => {
    if (!canEdit || saving) return;
    setSaving(true); setError("");
    try {
      const data = await apiFetch<{ orden: string[] }>(`/configuracion/sidebar/${panel}`, { method: "PUT", body: JSON.stringify({ orden }) });
      setOrden(data.orden); setGuardado(data.orden); setEditing(false);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "No se pudo guardar el orden."); }
    finally { setSaving(false); }
  };
  return (
    <SidebarContext.Provider value={{ collapsed, toggle: () => setCollapsed((previous) => !previous), editing, saving, canEdit, loaded, error, orden, move, save,
      edit: () => { if (!loaded) { setReload((previous) => previous + 1); return; } setCollapsed(false); setError(""); setEditing(true); },
      cancel: () => { setOrden(guardado); setError(""); setEditing(false); },
    }}>
      <div className={`${styles.layout} min-h-screen bg-brand-cream-soft text-brand-black`} data-collapsed={collapsed}>
        {children}
      </div>
    </SidebarContext.Provider>
  );
}