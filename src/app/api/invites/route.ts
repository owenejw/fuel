import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getUser, isAdminEmail } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

async function requireAdmin() {
  const user = await getUser();
  return user && isAdminEmail(user.email) ? user : null;
}

/** Unambiguous characters only (no 0/O, 1/I/L). */
function newCode() {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(10);
  const chars = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
  return `${chars.slice(0, 5)}-${chars.slice(5)}`;
}

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  // Deliberately does not expose who redeemed a code.
  const { data, error } = await supabaseAdmin()
    .from("invites")
    .select("code, created_at, expires_at, used_at")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ invites: data });
}

export async function POST(request: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = (await request.json().catch(() => ({}))) as { days?: number };
  const days = Math.min(Math.max(Number(body.days) || 14, 1), 365);
  const { data, error } = await supabaseAdmin()
    .from("invites")
    .insert({ code: newCode(), expires_at: new Date(Date.now() + days * 86400_000).toISOString() })
    .select("code, created_at, expires_at, used_at")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ invite: data });
}

export async function DELETE(request: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const code = request.nextUrl.searchParams.get("code");
  if (!code) return NextResponse.json({ error: "Missing code" }, { status: 400 });
  await supabaseAdmin().from("invites").delete().eq("code", code).is("used_at", null);
  return NextResponse.json({ ok: true });
}
