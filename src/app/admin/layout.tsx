import { AdminTopbar } from "@/components/admin/admin-topbar";
import { RoleProvider } from "@/lib/role";

/** Desktop surface (Bauleiter / Büro). */
export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <RoleProvider fallback="bauleiter">
      <div className="flex h-dvh flex-col bg-surface">
        <AdminTopbar />
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      </div>
    </RoleProvider>
  );
}
