export { auth as default } from "./auth";

export const config = {
  matcher: ["/((?!api/auth|login|signup|_next/static|_next/image|favicon.ico).*)"],
};
