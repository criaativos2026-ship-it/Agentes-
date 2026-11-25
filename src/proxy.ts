import { NextResponse, type NextRequest } from "next/server";

/**
 * Renova a validade do cookie de sessão no navegador (a validade REAL é conferida no banco
 * a cada requisição, com expiração deslizante). Não faz autorização: isso é feito no servidor.
 */
const COOKIE = process.env.NODE_ENV === "production" ? "__Host-nexus_session" : "nexus_session";
const MAX_AGE = 30 * 24 * 60 * 60;

export function proxy(request: NextRequest) {
  const response = NextResponse.next();
  const token = request.cookies.get(COOKIE)?.value;
  // Só em navegação de página (não em chamadas de API/polling): evita "ressuscitar" o cookie após sair.
  const isPageNavigation = request.headers.get("sec-fetch-dest") === "document" || (request.headers.get("accept") ?? "").includes("text/html");
  if (token && request.method === "GET" && isPageNavigation && !request.nextUrl.pathname.startsWith("/api/")) {
    response.cookies.set(COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: MAX_AGE,
    });
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|api/webhooks|api/cron).*)"],
};
