import type { ReactNode } from "react";
import { AdminTopbar } from "@/components/admin/admin-topbar";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-1 flex-col bg-muted">
      <AdminTopbar />
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
