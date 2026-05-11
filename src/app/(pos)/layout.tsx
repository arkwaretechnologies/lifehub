"use client";

import PosProtectedShell from "@/components/pharmacy/PosProtectedShell";

export default function PosLayout({ children }: { children: React.ReactNode }) {
  return <PosProtectedShell>{children}</PosProtectedShell>;
}
