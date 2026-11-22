import type { Metadata } from "next";
import { Suspense } from "react";
import { KlaraAvatar } from "@/components/klara/klara-avatar";
import { LoginForm } from "./login-form";
import { LangSwitch, T } from "@/lib/i18n-provider";

export const metadata: Metadata = { title: "Anmelden" };

/** The site password (SITE_PASSWORD); src/proxy.ts sends every visitor without access here. */
export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center bg-surface px-6 py-16">
      <div className="flex w-full max-w-sm flex-col items-center text-center">
        <KlaraAvatar size={72} title="Klara" />
        <h1 className="mt-5 text-3xl font-semibold tracking-tight text-foreground">Klara</h1>
        <p className="mt-2 text-base text-muted-foreground">
          <T>Bitte das Passwort für diesen Zugang eingeben.</T>
        </p>
        <Suspense>
          <Form searchParams={searchParams} />
        </Suspense>
        <LangSwitch size="lg" className="mt-8" />
      </div>
    </main>
  );
}

async function Form({ searchParams }: { searchParams: PageProps<"/login">["searchParams"] }) {
  const sp = await searchParams;
  return <LoginForm next={typeof sp.next === "string" ? sp.next : "/"} />;
}
