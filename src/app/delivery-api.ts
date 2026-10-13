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

export type GuestDeliveryStatus = {
  requestId: string;
  status: "Started" | "PendingApproval" | "Approved" | "Allocated" | "Deposited" | "Rejected" | "Expired" | "Cancelled" | "Failed";
  approvalExpiresAt: string | null;
  compartmentCode: string | null;
  reservationExpiresAt: string | null;
  parcelId: string | null;
  failureCode: string | null;
  failureDetail: string | null;
};

export type CompartmentReservation = {
  requestId: string;
  reservationId: string;
  compartmentId: string;
  compartmentCode: string;
  reservedAt: string;
  reservationExpiresAt: string;
};

export type ReturnPickupSession = {
  returnRequestId: string;
  guestSessionToken: string;
  lockerCode: string;
  compartmentCode: string;
  imageUrl: string;
  expiresAt: string;
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
  request<DeliverySession>("/backend/delivery-requests", {
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

export const submitDelivery = (
  requestId: string,
  guestSessionToken: string,
  parcelImageUrl: string,
  recipientPhone: string,
) =>
  request<DeliverySummary>(`/backend/delivery-requests/${requestId}:submit`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Guest-Session-Token": guestSessionToken,
    },
    body: JSON.stringify({ parcelImageUrl, recipientPhone }),
  });

export const getDeliveryStatus = (requestId: string, guestSessionToken: string) =>
  request<GuestDeliveryStatus>(`/backend/delivery-requests/${requestId}`, {
    method: "GET",
    headers: { "X-Guest-Session-Token": guestSessionToken },
  });

export const reserveCompartment = (requestId: string, guestSessionToken: string) =>
  request<CompartmentReservation>(`/backend/delivery-requests/${requestId}:openCompartment`, {
    method: "POST",
    headers: { "X-Guest-Session-Token": guestSessionToken },
  });

export const validateReturnPickup = (lockerCode: string, pickupCode: string) =>
  request<ReturnPickupSession>("/backend/return-pickup-sessions", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lockerCode, pickupCode }),
  });

export const openReturnPickup = (session: ReturnPickupSession) =>
  request<ReturnPickupSession>(`/backend/return-pickup-sessions/${session.returnRequestId}:openCompartment`, {
    method: "POST", headers: { "X-Guest-Session-Token": session.guestSessionToken },
  });
