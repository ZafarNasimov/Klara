import { handle, HttpError, readJson } from "@/lib/api";
import { ACCESS_COOKIE, accessToken, passwordMatches, safeNext, sitePassword } from "@/lib/access";

/** Site login: `{ password, next }` → access cookie (30 days). */
export async function POST(req: Request) {
  return handle(async () => {
    const body = await readJson<{ password?: unknown; next?: unknown }>(req);
    const pw = sitePassword();
    const given = typeof body.password === "string" ? body.password : "";
    if (pw && !passwordMatches(given)) {
      // Slows down guessing.
      await new Promise((r) => setTimeout(r, 400));
      throw new HttpError("Das Passwort stimmt nicht.", 401);
    }
    const res = Response.json({ ok: true, next: safeNext(body.next) });
    if (pw) {
      const secure = new URL(req.url).protocol === "https:";
      res.headers.append(
        "Set-Cookie",
        `${ACCESS_COOKIE}=${accessToken(pw)}; Path=/; Max-Age=${30 * 24 * 3600}; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`,
      );
    }
    return res;
  });
}
