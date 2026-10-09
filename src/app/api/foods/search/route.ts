import { NextResponse, type NextRequest } from "next/server";
import { currentProfileId } from "@/server/session";
import { searchFoods } from "@/lib/foods/server";

export async function GET(request: NextRequest) {
  if (!(await currentProfileId())) return NextResponse.json({ error: "No profile selected" }, { status: 401 });
  const foods = await searchFoods(request.nextUrl.searchParams.get("q") ?? "");
  return NextResponse.json({ foods }, { headers: { "Cache-Control": "private, max-age=60" } });
}
