"use client";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { ApiError, postJson } from "@/lib/use-api";

export function LoginForm({ next }: { next: string }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await postJson<{ next: string }>("/api/login", { password, next });
      // A full load, so the new cookie applies to every request of the app.
      window.location.assign(r.next);
    } catch (err) {
      setError(err instanceof ApiError && err.status < 500 ? err.message : "Anmelden hat nicht geklappt. Bitte erneut versuchen.");
      setBusy(false);
    }
  };

  return (
    <form onSubmit={(e) => void submit(e)} className="mt-8 grid w-full gap-3 text-left">
      <label htmlFor="site-password" className="text-sm font-medium text-foreground">
        Passwort
      </label>
      <input
        id="site-password"
        type="password"
        autoComplete="current-password"
        autoFocus
        value={password}
        onChange={(e) => {
          setPassword(e.target.value);
          setError(null);
        }}
        aria-invalid={!!error}
        aria-describedby={error ? "site-password-error" : undefined}
        className="h-12 w-full rounded-lg border border-border bg-background px-3 text-base text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-light-red"
      />
      {error ? (
        <p id="site-password-error" className="text-sm text-light-red-text">
          {error}
        </p>
      ) : null}
      <Button type="submit" className="mt-2 h-12 text-base" disabled={!password || busy}>
        {busy ? "Wird angemeldet …" : "Anmelden"}
      </Button>
    </form>
  );
}
