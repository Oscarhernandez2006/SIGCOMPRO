import type { ReactNode } from "react";
import RunErrandsShell from "@/components/RunErrandsShell";

export default function RunErrandsLayout({ children }: { children: ReactNode }) {
  return <RunErrandsShell>{children}</RunErrandsShell>;
}
