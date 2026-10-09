import { NextResponse, type NextRequest } from "next/server";
import { getUser } from "@/lib/supabase/server";
import { searchFoods } from "@/lib/foods/server";

export async function GET(request: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const q = request.nextUrl.searchParams.get("q") ?? "";
  const foods = await searchFoods(user.supabase, q);
  return NextResponse.json({ foods }, { headers: { "Cache-Control": "private, max-age=60" } });
}
