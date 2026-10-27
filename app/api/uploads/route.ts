import { NextResponse, type NextRequest } from "next/server";
import { requirePermission } from "@/lib/server/auth";
import { sweepAfterUpload } from "@/lib/server/upload-cleanup";
import { MAX_UPLOAD_BYTES, processUpload, StorageError, UploadError } from "@/lib/server/uploads";

// POST /api/uploads  (multipart/form-data, field "file")
// -> 201 { message, url, bytes, source } | 400 { error, details }
export async function POST(req: NextRequest) {
  const denied = await requirePermission(req, "products:write");
  if (denied) return denied;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "validation failed", details: ["send the image as multipart/form-data"] }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "validation failed", details: ["file is required"] }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "validation failed", details: [`images must be ${MAX_UPLOAD_BYTES / 1024 / 1024} MB or smaller`] }, { status: 400 });
  }

  try {
    const result = await processUpload(Buffer.from(await file.arrayBuffer()));
    sweepAfterUpload(); // converted and stored: now clear out uploads nothing uses any more
    return NextResponse.json({ message: "image uploaded", ...result }, { status: 201 });
  } catch (e) {
    // storage trouble is the server's (503), not the image's (400) - so the admin isn't told to
    // re-export a perfectly good file
    if (e instanceof StorageError) return NextResponse.json({ error: "storage unavailable", details: [e.message] }, { status: 503 });
    const message = e instanceof UploadError ? e.message : "The image could not be processed.";
    if (!(e instanceof UploadError)) console.error("uploads: unexpected error -", e);
    return NextResponse.json({ error: "validation failed", details: [message] }, { status: 400 });
  }
}
