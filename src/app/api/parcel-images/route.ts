import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const EXTENSIONS: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File) || !EXTENSIONS[file.type]) {
    return Response.json({ message: "Chỉ chấp nhận ảnh JPG, PNG hoặc WebP." }, { status: 400 });
  }

  if (file.size > MAX_IMAGE_BYTES) {
    return Response.json({ message: "Ảnh kiện hàng không được vượt quá 5 MB." }, { status: 400 });
  }

  const filename = `${crypto.randomUUID()}${EXTENSIONS[file.type]}`;
  const uploadDirectory = path.join(process.cwd(), "public", "uploads");
  await mkdir(uploadDirectory, { recursive: true });
  await writeFile(path.join(uploadDirectory, filename), Buffer.from(await file.arrayBuffer()));

  return Response.json({ url: `${new URL(request.url).origin}/uploads/${filename}` }, { status: 201 });
}
