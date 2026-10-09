import { NextResponse, type NextRequest } from "next/server";
import { getUser } from "@/lib/supabase/server";
import { lookupBarcode } from "@/lib/foods/server";
import { isValidBarcode } from "@/lib/foods/parsers";

export async function GET(_request: NextRequest, ctx: RouteContext<"/api/foods/barcode/[code]">) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { code } = await ctx.params;
  if (!isValidBarcode(code)) return NextResponse.json({ error: "Invalid barcode" }, { status: 400 });
  const food = await lookupBarcode(user.supabase, code);
  return NextResponse.json({ food }, { headers: { "Cache-Control": "private, no-store" } });
}
