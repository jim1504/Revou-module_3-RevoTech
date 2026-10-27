import { NextResponse, type NextRequest } from "next/server";
import { contentTypeOf, readUpload } from "@/lib/server/uploads";

// GET /api/images/<id>.avif | <id>@800.avif | <id>@400.avif - uploaded product images
// (.webp for the rare upload the AVIF encoder couldn't handle)
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/images/[file]">) {
  const { file } = await ctx.params;
  const bytes = await readUpload(file);
  if (!bytes) return NextResponse.json({ error: "image not found" }, { status: 404 });
  return new Response(new Uint8Array(bytes), {
    headers: {
      "content-type": contentTypeOf(file),
      // file names are random and never reused, so the bytes behind a URL never change
      "cache-control": "public, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
    },
  });
}
