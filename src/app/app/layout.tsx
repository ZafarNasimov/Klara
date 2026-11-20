import { RoleProvider } from "@/lib/role";

/** Mobile surface (Polier). On a desktop screen it renders as a phone-width column. */
export default function MobileLayout({ children }: LayoutProps<"/app">) {
  return (
    <RoleProvider fallback="polier">
      <div className="flex min-h-dvh flex-1 justify-center bg-surface">
        <div className="relative flex min-h-dvh w-full max-w-md flex-col bg-background sm:border-x sm:border-border">{children}</div>
      </div>
    </RoleProvider>
  );
}
