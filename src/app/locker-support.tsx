"use client";

import { Button } from "@heroui/react";
import { Handset } from "@gravity-ui/icons";
import { useCallback, useEffect, useRef, useState } from "react";

type SupportContact = {
  lockerCode: string;
  isAvailable: boolean;
  isFallback: boolean;
  contactName: string | null;
  phoneNumber: string | null;
  supportHours: string | null;
  instructions: string;
  refreshedAt: string;
};

// The reference is a public record ID, never an OTP or guest session token.
export function LockerSupport({ lockerCode, reference }: { lockerCode: string; reference?: string }) {
  const [open, setOpen] = useState(false);
  const [contact, setContact] = useState<SupportContact | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const generation = useRef(0);
  const load = useCallback(async (): Promise<SupportContact | null> => {
    const request = ++generation.current;
    setLoading(true);
    setContact(null);
    setMessage("");
    try {
      const response = await fetch(`/backend/lockers/public/by-code/${encodeURIComponent(lockerCode)}/support`, { cache: "no-store" });
      if (!response.ok) throw new Error("Chưa tải được liên hệ. Vui lòng thử lại hoặc làm theo hướng dẫn tại tủ.");
      const result = await response.json() as SupportContact;
      if (request !== generation.current) return null;
      setContact(result);
      return result;
    } catch (error) {
      if (request === generation.current) setMessage(error instanceof Error ? error.message : "Chưa tải được liên hệ hỗ trợ.");
      return null;
    } finally {
      if (request === generation.current) setLoading(false);
    }
  }, [lockerCode]);
  const invalidate = useCallback(() => { generation.current++; }, []);

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => void load(), 0);
    const interval = setInterval(() => void load(), 60_000);
    const refresh = () => { if (document.visibilityState === "visible") void load(); };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      invalidate();
      clearTimeout(timer);
      clearInterval(interval);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [open, load, invalidate]);

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setMessage("Đã sao chép.");
    } catch {
      setMessage("Không sao chép được tự động. Bạn có thể chọn thông tin bên trên để sao chép.");
    }
  }

  async function call() {
    const latest = await load();
    if (latest?.isAvailable && latest.phoneNumber) window.location.assign(`tel:${latest.phoneNumber}`);
  }

  if (!lockerCode) return null;
  return (
    <section className="mt-5 rounded-2xl border border-border bg-background p-4">
      <Button className="min-h-12 w-full" variant="secondary" aria-expanded={open} onPress={() => setOpen(!open)}>
        <Handset className="size-5" /> Liên hệ hỗ trợ tại tủ
      </Button>
      {open ? (
        <div className="mt-4 space-y-3 text-sm">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-semibold">Hỗ trợ tủ {lockerCode}</h2>
            <Button variant="ghost" className="min-h-11" isDisabled={loading} onPress={() => void load()}>Tải lại</Button>
          </div>
          {loading ? <p role="status">Đang tải liên hệ...</p> : null}
          {contact ? (
            <>
              <p className="font-semibold">{contact.contactName || "Hướng dẫn liên hệ"}</p>
              {contact.isFallback ? <p className="text-muted">Liên hệ dự phòng khi người phụ trách chưa sẵn sàng hoặc ngoài giờ.</p> : null}
              {contact.supportHours ? <p className="select-text text-muted">{contact.supportHours}</p> : null}
              <p className="select-text whitespace-pre-wrap">{contact.instructions}</p>
              {contact.isAvailable && contact.phoneNumber ? (
                <>
                  <p className="select-text font-semibold">{contact.phoneNumber}</p>
                  <Button className="min-h-12 w-full" onPress={() => void call()}>Gọi hỗ trợ</Button>
                  <Button className="min-h-12 w-full" variant="secondary" onPress={() => void copy(contact.phoneNumber!)}>Sao chép số điện thoại</Button>
                </>
              ) : <p className="text-muted">Chưa có số hỗ trợ khả dụng. Vui lòng làm theo hướng dẫn trên.</p>}
              {reference ? <p className="select-text break-all">Mã giao dịch: {reference}</p> : null}
              <Button className="min-h-12 w-full" variant="secondary" onPress={() => void copy(`Tủ: ${contact.lockerCode}${reference ? `\nGiao dịch: ${reference}` : ""}`)}>Sao chép mã tủ{reference ? " và giao dịch" : ""}</Button>
            </>
          ) : null}
          {message ? <p role="status" className="select-text text-muted">{message}</p> : null}
        </div>
      ) : null}
    </section>
  );
}
