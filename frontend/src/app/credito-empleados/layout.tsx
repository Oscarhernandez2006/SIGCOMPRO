import type { ReactNode } from "react";
import CreditoShell from "@/components/CreditoShell";

export default function CreditoEmpleadosLayout({ children }: { children: ReactNode }) {
  return <CreditoShell>{children}</CreditoShell>;
}
