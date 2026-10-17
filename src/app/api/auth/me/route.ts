import { getSessionUser } from "@/lib/auth/session";

export async function GET(request: Request) {
  const user = getSessionUser(request.headers.get("cookie"));
  return Response.json({ user });
}
