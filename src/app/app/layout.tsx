import type { ReactNode } from "react";

export default function MobileLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-1 justify-center bg-muted">
      <div className="flex w-full max-w-md flex-col border-x border-border bg-background">{children}</div>
    </div>
  );
}
