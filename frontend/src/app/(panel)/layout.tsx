import type { ReactNode } from "react";
import PanelShell from "@/components/PanelShell";

export default function PanelLayout({ children }: { children: ReactNode }) {
  return <PanelShell>{children}</PanelShell>;
}
