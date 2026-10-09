import { NextResponse } from "next/server";
import { getUser } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Permanently delete the signed-in user's account. Every user-owned table
 * references auth.users with ON DELETE CASCADE, so this removes all their data.
 */
export async function DELETE() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { error } = await supabaseAdmin().auth.admin.deleteUser(user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await user.supabase.auth.signOut().catch(() => undefined);
  return NextResponse.json({ ok: true });
}
