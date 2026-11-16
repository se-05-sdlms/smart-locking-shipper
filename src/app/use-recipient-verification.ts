import { useCallback, useEffect, useRef, useState } from "react";
import { DeliveryApiError, resolveRecipient } from "./delivery-api";
import type { DeliverySession } from "./delivery-api";

type Status = "idle" | "loading" | "found" | "not-found" | "cannot-receive" | "limit" | "error";
type Identity = { phone: string; sessionId: string; token: string };

// Verification belongs to one phone and one guest session, never just to the screen.
export function useRecipientVerification(phone: string, session: DeliverySession | null, enabled: boolean, ready: boolean, retry: number) {
  const [status, setStatus] = useState<Status>("idle");
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const generation = useRef(0);
  const verified = useRef<Identity | null>(null);
  const digits = phone.replace(/\D/g, "");
  const sessionId = session?.id;
  const token = session?.guestSessionToken;

  // Called synchronously by phone/session mutations, before React renders or debounces.
  const invalidate = useCallback((nextStatus: Status = "idle") => {
    generation.current++;
    verified.current = null;
    setStatus(nextStatus);
    setName("");
    setMessage("");
  }, []);

  const isVerified = useCallback((current: DeliverySession | null, currentPhone: string) => {
    const identity = verified.current;
    return !!identity && !!current && identity.phone === currentPhone.replace(/\D/g, "") &&
      identity.sessionId === current.id && identity.token === current.guestSessionToken;
  }, []);

  useEffect(() => {
    const counter = generation;
    const identity = verified;
    const run = ++counter.current;
    identity.current = null;
    if (!enabled || !ready || !sessionId || !token || !/^0\d{9}$/.test(digits)) return;
    const timer = window.setTimeout(async () => {
      setStatus("loading");
      setName("");
      setMessage("");
      try {
        const result = await resolveRecipient(sessionId, token, digits);
        if (run !== generation.current) return;
        verified.current = { phone: digits, sessionId, token };
        setName(result.fullName);
        setStatus("found");
      } catch (error) {
        if (run !== generation.current) return;
        if (error instanceof DeliveryApiError && error.code === "delivery/recipient_not_found") setStatus("not-found");
        else if (error instanceof DeliveryApiError && error.code === "delivery/recipient_cannot_receive") setStatus("cannot-receive");
        else if (error instanceof DeliveryApiError && error.code === "delivery/lookup_limit_reached") setStatus("limit");
        else {
          setStatus("error");
          setMessage(error instanceof Error ? error.message : "Không thể tra cứu người nhận.");
        }
      }
    }, 300);
    return () => {
      window.clearTimeout(timer);
      counter.current++;
      identity.current = null;
    };
  }, [digits, enabled, ready, retry, sessionId, token]);

  return { status, name, message, invalidate, isVerified };
}
