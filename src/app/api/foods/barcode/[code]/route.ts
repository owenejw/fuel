import { NextResponse, type NextRequest } from "next/server";
import { currentProfileId } from "@/server/session";
import { lookupBarcode } from "@/lib/foods/server";
import { isValidBarcode } from "@/lib/foods/parsers";

export async function GET(_request: NextRequest, ctx: RouteContext<"/api/foods/barcode/[code]">) {
  if (!(await currentProfileId())) return NextResponse.json({ error: "No profile selected" }, { status: 401 });
  const { code } = await ctx.params;
  if (!isValidBarcode(code)) return NextResponse.json({ error: "Invalid barcode" }, { status: 400 });
  return NextResponse.json({ food: await lookupBarcode(code) }, { headers: { "Cache-Control": "private, no-store" } });
}
