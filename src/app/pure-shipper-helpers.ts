/**
 * Pure helper functions for Shipper delivery lifecycle, phone validation,
 * masking, OCR candidate resolution, and state decisions.
 *
 * All functions here are pure (deterministic, zero side-effects, no DOM/network).
 */

export type StatusClassification = {
  isTerminal: boolean;
  isRetryable: boolean;
  action: "stop_poll" | "backoff_and_retry";
};

export type LockerOpenState = {
  status: "Started" | "PendingApproval" | "Approved" | "Allocated" | "Deposited" | "Rejected" | "Expired" | "Cancelled" | "Failed" | string;
  openRequested?: boolean;
  compartmentAllocated?: boolean;
};

export type DeadlineContext = {
  clientDeadlineExpired: boolean;
  currentStatus: string;
  reservationExpiresAt?: string | null;
  now?: number;
};

export type DeadlineDecision = {
  shouldInferTerminal: boolean;
  action: "keep_waiting" | "poll_authoritative";
};

export type OcrCandidateItem = {
  phone: string;
  confidence?: number;
};

export type OcrScanInput = {
  status: "Succeeded" | "Failed" | string;
  phones?: string[];
  candidates?: OcrCandidateItem[];
  isMasked?: boolean;
};

export type CandidateSelectionOptions = {
  phoneTouched?: boolean;
  minConfidenceThreshold?: number; // default 0.8 (or 80)
};

export type CandidateSelectionOutcome = {
  action: "auto_select" | "require_manual_entry" | "keep_manual" | "masked_notice";
  selectedPhone?: string;
  formattedPhone?: string;
  notice: "success" | "masked" | "failed";
  validCandidates: string[];
};

export const MAX_WAYBILL_IMAGE_BYTES = 5 * 1024 * 1024;

export type WaybillFileLike = {
  name?: string;
  type?: string;
  size?: number;
};

export type WaybillFileValidation = {
  valid: boolean;
  message?: "Chỉ hỗ trợ ảnh JPEG hoặc PNG." | "Ảnh không được vượt quá 5 MB.";
};

/** Validates the client-side boundary that matches BE waybill OCR (JPEG/PNG, 5 MiB). */
export function validateWaybillFile(file: WaybillFileLike | null | undefined): WaybillFileValidation {
  if (!file) return { valid: false, message: "Chỉ hỗ trợ ảnh JPEG hoặc PNG." };
  const type = file.type?.toLowerCase().trim();
  const extension = file.name?.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  const supportedType = type === "image/jpeg" || type === "image/png";
  const supportedExtension = extension === "jpg" || extension === "jpeg" || extension === "png";
  if ((type && !supportedType) || (!type && !supportedExtension)) {
    return { valid: false, message: "Chỉ hỗ trợ ảnh JPEG hoặc PNG." };
  }
  if (typeof file.size === "number" && file.size > MAX_WAYBILL_IMAGE_BYTES) {
    return { valid: false, message: "Ảnh không được vượt quá 5 MB." };
  }
  return { valid: true };
}

/**
 * Normalizes input to plain digits. Handles +84 country code prefix.
 */
export function normalizePhoneDigits(value: string | null | undefined): string {
  if (!value) return "";
  const trimmed = value.trim();
  let digits = trimmed.replace(/\D/g, "");
  if (trimmed.startsWith("+84") || (digits.startsWith("84") && digits.length > 10)) {
    digits = `0${digits.slice(2)}`;
  }
  return digits;
}

/**
 * Validates a Vietnamese mobile recipient phone number:
 * - Must be exactly 10 digits
 * - Must begin with 03, 05, 07, 08, or 09
 * - Rejects non-digits, incorrect length, empty/whitespace, and other prefixes (e.g. 02, 01, 04, 06)
 */
export function isValidRecipientPhone(value: string | null | undefined): boolean {
  if (!value) return false;
  const digits = normalizePhoneDigits(value);
  // Must match exactly 10 digits starting with 03, 05, 07, 08, 09
  return /^0(3|5|7|8|9)\d{8}$/.test(digits);
}

/**
 * Formats a 10-digit phone number into groups: "0901 234 567"
 */
export function formatRecipientPhone(value: string | null | undefined): string {
  const digits = normalizePhoneDigits(value).slice(0, 11);
  return [digits.slice(0, 4), digits.slice(4, 7), digits.slice(7, 10), digits.slice(10)]
    .filter(Boolean)
    .join(" ");
}

/**
 * Masks a 10-digit phone number for privacy protection, e.g. "090****001".
 * Returns empty string if the phone is invalid or has wrong length.
 */
export function maskRecipientPhone(value: string | null | undefined): string {
  if (!value) return "";
  const digits = normalizePhoneDigits(value);
  if (!isValidRecipientPhone(digits)) return "";
  // 3 prefix digits + 4 asterisks + 3 suffix digits = 10 digits total
  return `${digits.slice(0, 3)}****${digits.slice(7)}`;
}

/**
 * Evaluates OCR scan output and decides whether to auto-select a phone candidate,
 * keep existing manual entry, display masked notice, or fallback to manual input.
 */
export function selectOcrCandidate(
  result: OcrScanInput | null | undefined,
  options: CandidateSelectionOptions = {},
): CandidateSelectionOutcome {
  const { phoneTouched = false, minConfidenceThreshold = 0.8 } = options;

  if (result?.isMasked) {
    return {
      action: "masked_notice",
      notice: "masked",
      validCandidates: [],
    };
  }

  if (phoneTouched) {
    return {
      action: "keep_manual",
      notice: result?.status === "Succeeded" ? "success" : "failed",
      validCandidates: [],
    };
  }

  if (!result || result.status !== "Succeeded") {
    return {
      action: "require_manual_entry",
      notice: "failed",
      validCandidates: [],
    };
  }

  // Collect candidate items
  const rawList: OcrCandidateItem[] = [];
  if (Array.isArray(result.candidates) && result.candidates.length > 0) {
    rawList.push(...result.candidates);
  } else if (Array.isArray(result.phones) && result.phones.length > 0) {
    rawList.push(...result.phones.map((phone) => ({ phone })));
  }

  // Filter valid phones
  const validList = rawList
    .map((item) => ({
      ...item,
      normalized: normalizePhoneDigits(item.phone),
    }))
    .filter((item) => isValidRecipientPhone(item.normalized));

  if (validList.length === 0) {
    return {
      action: "require_manual_entry",
      notice: "failed",
      validCandidates: [],
    };
  }

  const validPhones = validList.map((item) => item.normalized);
  const first = validList[0];

  // If confidence is specified, verify threshold
  if (first.confidence !== undefined) {
    const normalizedConfidence = first.confidence > 1 ? first.confidence / 100 : first.confidence;
    const normalizedThreshold = minConfidenceThreshold > 1 ? minConfidenceThreshold / 100 : minConfidenceThreshold;
    if (normalizedConfidence < normalizedThreshold) {
      return {
        action: "require_manual_entry",
        notice: "failed",
        validCandidates: validPhones,
      };
    }
  }

  return {
    action: "auto_select",
    selectedPhone: first.normalized,
    formattedPhone: formatRecipientPhone(first.normalized),
    notice: "success",
    validCandidates: validPhones,
  };
}

/**
 * Pure state transition decision for locker opening command (reserve/open compartment):
 * Once an open command is requested (even if response is lost or timed out),
 * a second OPEN request must NEVER be issued to prevent duplicate physical locker actuation.
 */
export function canRequestLockerOpen(state: LockerOpenState): boolean {
  if (state.openRequested) {
    return false;
  }
  if (state.compartmentAllocated) {
    return false;
  }
  return state.status === "Approved";
}

/**
 * Pure deadline evaluation helper:
 * When client local deadline expires, client must NOT infer terminal state (Expired/Failed) locally.
 * It must continue waiting and poll authoritative server status.
 */
export function evaluateDeadlineTransition(context: DeadlineContext): DeadlineDecision {
  const isTimeExpired =
    context.clientDeadlineExpired ||
    (context.reservationExpiresAt && context.now !== undefined
      ? context.now >= new Date(context.reservationExpiresAt).getTime()
      : false);

  if (isTimeExpired) {
    return {
      shouldInferTerminal: false,
      action: "poll_authoritative",
    };
  }

  return {
    shouldInferTerminal: false,
    action: "keep_waiting",
  };
}

/**
 * Pure HTTP status classification helper:
 * Distinguishes terminal guest poll errors from retryable/transient ones.
 * - Terminal: 401 (invalid/missing/expired guest session), 404 (session/request not found), 410 (session expired).
 * - Retryable: 429 (rate-limit), 500/502/503/504 (server busy/error), network failures (status 0 or undefined).
 */
export function classifyHttpStatus(status: number | undefined | null, code?: string): StatusClassification {
  if (status === undefined || status === null || status === 0) {
    return { isTerminal: false, isRetryable: true, action: "backoff_and_retry" };
  }

  // 401 Unauthorized, 410 Gone are always terminal for guest flows
  if (status === 401 || status === 410) {
    return { isTerminal: true, isRetryable: false, action: "stop_poll" };
  }

  // 404 Not Found is terminal if it indicates delivery/session not found
  if (status === 404) {
    if (code === "delivery/not_found" || code === "auth/not_found" || code === "session_not_found" || !code) {
      return { isTerminal: true, isRetryable: false, action: "stop_poll" };
    }
    // Route glitch or unspecified non-delivery 404 can be retryable
    return { isTerminal: false, isRetryable: true, action: "backoff_and_retry" };
  }

  // 429 Too Many Requests and 5xx Server Errors are transient / retryable
  if (status === 429 || (status >= 500 && status <= 599)) {
    return { isTerminal: false, isRetryable: true, action: "backoff_and_retry" };
  }

  // 400 or other client errors without specific retry path
  return { isTerminal: true, isRetryable: false, action: "stop_poll" };
}
