import { NextResponse } from "next/server";
import { getUser, isAdminEmail } from "@/lib/supabase/server";

export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  return NextResponse.json({ isAdmin: isAdminEmail(user.email) }, { headers: { "Cache-Control": "private, no-store" } });
}
