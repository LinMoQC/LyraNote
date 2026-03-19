import { NextRequest, NextResponse } from "next/server"

const PUBLIC_PATHS = ["/", "/login", "/sign-in", "/setup"]
const SETUP_PATH = "/setup"
const LOGIN_PATH = "/login"
const APP_DEFAULT = "/app/chat"

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))
}

export default function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Always skip Next.js internals and static assets
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/") ||
    /\.(.+)$/.test(pathname)
  ) {
    return NextResponse.next()
  }

  const session = req.cookies.get("lyranote_session")?.value
  const expired = req.nextUrl.searchParams.has("expired")

  // 401 triggered: server-side clear httpOnly cookie, then redirect to clean /login
  if (expired && session) {
    const clean = new URL(LOGIN_PATH, req.url)
    const response = NextResponse.redirect(clean)
    response.cookies.delete("lyranote_session")
    return response
  }

  // Logged-in user visiting login or setup → redirect to app
  if (session && (pathname.startsWith(LOGIN_PATH) || pathname.startsWith(SETUP_PATH))) {
    return NextResponse.redirect(new URL(APP_DEFAULT, req.url))
  }

  // No session + non-public route → go to login
  if (!session && !isPublicPath(pathname)) {
    return NextResponse.redirect(new URL(LOGIN_PATH, req.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
  ],
}
