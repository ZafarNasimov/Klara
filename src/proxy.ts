// Login in front of the whole app when SITE_PASSWORD is set (see src/lib/access.ts).
// Open without login: the login page and route, and the mail-provider webhook
// (it carries its own token). Pages redirect to /login, API calls get 401.
import { NextResponse, type NextRequest } from "next/server";
import { ACCESS_COOKIE, hasAccess } from "@/lib/access";

const OPEN = ["/login", "/api/login", "/api/email/inbound"];

export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (OPEN.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return NextResponse.next();
  if (hasAccess(req.cookies.get(ACCESS_COOKIE)?.value)) return NextResponse.next();
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Anmeldung erforderlich" }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  // Static build files, the voice-detector model and icons need no login.
  matcher: ["/((?!_next/static|_next/image|vad/|favicon.ico|.*\\.(?:png|svg|ico|webp|jpg|woff2?)$).*)"],
};
