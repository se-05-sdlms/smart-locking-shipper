export const MAX_WAYBILL_IMAGE_BYTES = 5 * 1024 * 1024;

export type WaybillFileLike = { name?: string; type?: string; size?: number };
export type WaybillFileValidation = {
  valid: boolean;
  message?: "Chỉ hỗ trợ ảnh JPEG hoặc PNG." | "Ảnh không được vượt quá 5 MB.";
};

/** Matches the backend waybill OCR contract before any upload or image decode. */
export function validateWaybillFile(file: WaybillFileLike | null | undefined): WaybillFileValidation {
  if (!file) return { valid: false, message: "Chỉ hỗ trợ ảnh JPEG hoặc PNG." };
  const type = file.type?.toLowerCase().trim();
  const extension = file.name?.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  const supportedType = type === "image/jpeg" || type === "image/png";
  const supportedExtension = extension === "jpg" || extension === "jpeg" || extension === "png";
  if ((type && !supportedType) || (!type && !supportedExtension)) return { valid: false, message: "Chỉ hỗ trợ ảnh JPEG hoặc PNG." };
  if (typeof file.size === "number" && file.size > MAX_WAYBILL_IMAGE_BYTES) return { valid: false, message: "Ảnh không được vượt quá 5 MB." };
  return { valid: true };
}
