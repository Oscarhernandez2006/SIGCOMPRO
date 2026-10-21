"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import styles from "./SidebarLayout.module.css";

const SidebarContext = createContext({ collapsed: false, toggle: () => {} });

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

export function SidebarToggle() {
  const { collapsed, toggle } = useContext(SidebarContext);
  const label = collapsed ? "Expandir men\u00fa lateral" : "Contraer men\u00fa lateral";
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      aria-expanded={!collapsed}
      aria-controls="panel-sidebar-navigation"
      title={label}
      className={styles.toggle}
    >
      {collapsed ? <PanelLeftOpen aria-hidden="true" /> : <PanelLeftClose aria-hidden="true" />}
    </button>
  );
}

export default function SidebarLayout({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <SidebarContext.Provider value={{ collapsed, toggle: () => setCollapsed((previous) => !previous) }}>
      <div className={`${styles.layout} min-h-screen bg-brand-cream-soft text-brand-black`} data-collapsed={collapsed}>
        {children}
      </div>
    </SidebarContext.Provider>
  );
}