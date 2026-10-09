import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";

const Body = z.object({
  email: z.email().max(254),
  code: z.string().trim().min(4).max(32),
});

/**
 * Redeem an invite code and create the account. Public sign-ups are disabled
 * in Supabase, so this is the only way in. The client then requests a
 * sign-in code by email as usual.
 */
export async function POST(request: NextRequest) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid email and invite code." }, { status: 400 });
  const email = parsed.data.email.toLowerCase();
  const code = parsed.data.code.toUpperCase();
  const admin = supabaseAdmin();

  // Atomically claim the code so it can't be used twice concurrently.
  const { data: claimed, error: claimError } = await admin.rpc("claim_invite", { p_code: code });
  if (claimError || claimed !== true) {
    return NextResponse.json({ error: "That invite code is invalid, expired or already used." }, { status: 400 });
  }

  const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (error || !data.user) {
    await admin.from("invites").update({ claimed_at: null }).eq("code", code);
    const exists = /already|registered|exists/i.test(error?.message ?? "");
    return NextResponse.json(
      { error: exists ? "An account with that email already exists — just sign in." : "Could not create the account." },
      { status: exists ? 409 : 500 },
    );
  }

  await admin.from("invites").update({ used_at: new Date().toISOString(), used_by: data.user.id }).eq("code", code);
  return NextResponse.json({ ok: true });
}
