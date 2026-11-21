// Site password (SITE_PASSWORD) and the proxy in front of the app.
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it } from "vitest";
import { proxy } from "@/proxy";
import { ACCESS_COOKIE, accessToken, hasAccess, passwordMatches, safeNext } from "./access";

afterEach(() => {
  delete process.env.SITE_PASSWORD;
});

const req = (path: string, cookie?: string) =>
  new NextRequest(`https://klara.example${path}`, cookie ? { headers: { cookie: `${ACCESS_COOKIE}=${cookie}` } } : undefined);

describe("site password", () => {
  it("lets everything through when no password is set", () => {
    expect(hasAccess(undefined)).toBe(true);
    expect(proxy(req("/admin")).headers.get("x-middleware-next")).toBe("1");
  });

  it("checks the password and the cookie", () => {
    process.env.SITE_PASSWORD = "Baustelle2026";
    expect(passwordMatches("Baustelle2026")).toBe(true);
    expect(passwordMatches(" Baustelle2026 ")).toBe(true);
    expect(passwordMatches("baustelle2026")).toBe(false);
    expect(hasAccess(undefined)).toBe(false);
    expect(hasAccess(accessToken("anders"))).toBe(false);
    expect(hasAccess(accessToken("Baustelle2026"))).toBe(true);
  });

  it("sends pages to the login, refuses API calls, keeps the webhook open", () => {
    process.env.SITE_PASSWORD = "Baustelle2026";
    const page = proxy(req("/admin/case/abc?tab=1"));
    expect(page.status).toBe(307);
    expect(page.headers.get("location")).toBe("https://klara.example/login?next=%2Fadmin%2Fcase%2Fabc%3Ftab%3D1");
    expect(proxy(req("/api/cases")).status).toBe(401);
    expect(proxy(req("/api/email/inbound?token=x")).headers.get("x-middleware-next")).toBe("1");
    expect(proxy(req("/login")).headers.get("x-middleware-next")).toBe("1");
    expect(proxy(req("/admin", accessToken("Baustelle2026"))).headers.get("x-middleware-next")).toBe("1");
  });

  it("only returns to paths on this site", () => {
    expect(safeNext("/admin")).toBe("/admin");
    expect(safeNext("//evil.example")).toBe("/");
    expect(safeNext("https://evil.example")).toBe("/");
  });
});
