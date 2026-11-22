"use client";
// The DE/EN switch: stored per browser, sets <html lang>, re-mounts the screens
// so every $t() renders again. <T> translates text inside server components.
import { Fragment, useCallback, useEffect, useSyncExternalStore, type ReactNode } from "react";
import { $t, setCurrentLang, type Lang } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const KEY = "klara_lang";
const EVENT = "klara-lang";

function read(): Lang {
  try {
    return localStorage.getItem(KEY) === "en" ? "en" : "de";
  } catch {
    return "de";
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function useLang(): [Lang, (lang: Lang) => void] {
  const lang = useSyncExternalStore(subscribe, read, () => "de" as Lang);
  const set = useCallback((next: Lang) => {
    try {
      localStorage.setItem(KEY, next);
    } catch {}
    window.dispatchEvent(new Event(EVENT));
  }, []);
  return [lang, set];
}

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang] = useLang();
  // Before the children render, so their $t() calls see the language.
  setCurrentLang(lang);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  return <Fragment key={lang}>{children}</Fragment>;
}

/** Translated text inside a server component. */
export function T({ children, vars }: { children: string; vars?: Record<string, string | number> }) {
  useLang();
  return <>{$t(children, vars)}</>;
}

/** DE | EN, next to the role switcher. */
export function LangSwitch({ className, size = "sm" }: { className?: string; size?: "sm" | "lg" }) {
  const [lang, setLang] = useLang();
  return (
    <div role="radiogroup" aria-label={$t("Sprache der Oberfläche")} className={cn("inline-flex rounded-lg border border-border bg-surface p-0.5", className)}>
      {(["de", "en"] as const).map((l) => (
        <button
          key={l}
          type="button"
          role="radio"
          aria-checked={lang === l}
          lang={l}
          onClick={() => setLang(l)}
          title={l === "de" ? "Deutsch" : "English"}
          className={cn(
            "rounded-md px-2.5 font-mono text-xs uppercase outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
            size === "lg" ? "h-11 min-w-12" : "h-8",
            lang === l ? "bg-background font-medium text-foreground shadow-[0_0_0_1px_var(--border)]" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
