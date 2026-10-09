import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { supabaseServer } from "@/lib/supabase/server";

/** Magic-link landing: verifies the token hash (works across browsers, unlike PKCE). */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const tokenHash = params.get("token_hash");
  const type = (params.get("type") ?? "email") as EmailOtpType;
  const code = params.get("code");
  const nextParam = params.get("next") ?? "/";
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/";

  const supabase = await supabaseServer();
  const { error } = tokenHash
    ? await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
    : code
      ? await supabase.auth.exchangeCodeForSession(code)
      : { error: new Error("missing token") };

  return NextResponse.redirect(new URL(error ? "/login?error=link" : next, request.url));
}
