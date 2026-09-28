export type DeliverySession = {
  id: string;
  guestSessionToken: string;
  status: number;
  sessionExpiresAt: string;
};

export type DeliverySummary = {
  id: string;
  status: number;
  parcelImageUrl: string | null;
  sessionExpiresAt: string;
};

export class DeliveryApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function request<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new DeliveryApiError(
      payload?.message ?? "Không thể kết nối với hệ thống. Vui lòng thử lại.",
      response.status,
    );
  }

  return payload as T;
}

export const initiateDelivery = (lockerCode: string) =>
  request<DeliverySession>("/backend/delivery-requests/initiate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lockerCode }),
  });

export async function uploadParcelFile(file: File): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);

  const result = await request<{ url: string }>("/api/parcel-images", {
    method: "POST",
    body: formData,
  });

  return result.url;
}

export const attachParcelImage = (
  requestId: string,
  guestSessionToken: string,
  parcelImageUrl: string,
) =>
  request<DeliverySummary>(`/backend/delivery-requests/${requestId}/upload-image`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Guest-Session-Token": guestSessionToken,
    },
    body: JSON.stringify({ parcelImageUrl }),
  });

export const submitRecipient = (
  requestId: string,
  guestSessionToken: string,
  recipientPhone: string,
) =>
  request<DeliverySummary>(`/backend/delivery-requests/${requestId}/submit-recipient`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Guest-Session-Token": guestSessionToken,
    },
    body: JSON.stringify({ recipientPhone }),
  });
