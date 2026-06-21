import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

export async function proxy(request: NextRequest) {
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });

  const isAuth = !!token;
  const isLoginPage = request.nextUrl.pathname === "/login";

  if (!isAuth && !isLoginPage) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (isAuth && isLoginPage) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/login", "/api/pratiche/:path*", "/api/persone/:path*", "/api/appuntamenti/:path*"],
};
