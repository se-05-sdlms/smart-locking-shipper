"use client";

import {
  Button,
  Card,
  Chip,
  Description,
  Form,
  Input,
  InputOTP,
  Label,
  Link,
  REGEXP_ONLY_DIGITS,
  Radio,
  RadioGroup,
  Spinner,
  TextArea,
  TextField,
} from "@heroui/react";
import {
  ArrowLeft,
  ArrowChevronRight,
  Bell,
  Box,
  Camera,
  Check,
  CircleCheckFill,
  Clock,
  FileArrowUp,
  Handset,
  Lock,
  LockOpen,
  MapPin,
  Receipt,
  TriangleExclamation,
  Xmark,
} from "@gravity-ui/icons";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ChangeEvent, ReactNode } from "react";
import {
  DeliveryApiError,
  getDeliveryStatus,
  getReturnPickup,
  initiateDelivery,
  openReturnPickup,
  reportGuestIncident,
  reserveCompartment,
  resolveRecipient,
  scanWaybill,
  submitDelivery,
  uploadParcelFile,
  validateReturnPickup,
} from "./delivery-api";
import type { DeliverySession, GuestIncidentType, ReturnPickupSession } from "./delivery-api";

type Screen =
  | "welcome"
  | "receive-otp"
  | "receive-details"
  | "receive-open-failed"
  | "receive-opened"
  | "receive-success"
  | "recipient"
  | "parcel"
  | "waiting"
  | "searching"
  | "compartment"
  | "closing"
  | "success"
  | "not-found"
  | "rejected"
  | "expired"
  | "full"
  | "door-timeout"
  | "invalid-locker"
  | "locker-unavailable"
  | "incident"
  | "incident-success";

const INCIDENT_TYPES: { value: GuestIncidentType; label: string; hint: string }[] = [
  { value: "Compartment", label: "Không mở được ngăn / kẹt cửa", hint: "Ngăn không mở, cửa kẹt hoặc không đóng được" },
  { value: "Locker", label: "Tủ hỏng hoặc không phản hồi", hint: "Màn hình, nguồn hoặc kết nối của tủ gặp sự cố" },
  { value: "Parcel", label: "Sai thông tin kiện hàng", hint: "Sai người nhận, sai ngăn hoặc kiện hàng có vấn đề" },
  { value: "Return", label: "Sự cố khi lấy hàng trả", hint: "Mã lấy hàng hoặc ngăn hàng trả không đúng" },
  { value: "Other", label: "Vấn đề khác", hint: "Sự cố không thuộc các nhóm trên" },
];
const INCIDENT_DESCRIPTION_MIN = 10;
const INCIDENT_DESCRIPTION_MAX = 4000;

const DRAFT_STORAGE_KEY = "boxora.delivery.draft";
const PHONE_PATTERN = /^0\d{9}$/;
const OCR_NOTICES = {
  success: "Quét vận đơn thành công. Vui lòng kiểm tra lại số điện thoại người nhận.",
  failed: "Quét vận đơn thất bại. Vui lòng nhập số điện thoại người nhận thủ công.",
  masked: "Vận đơn đã che bớt số điện thoại. Vui lòng nhập đầy đủ số điện thoại người nhận.",
} as const;
type RecipientStatus = "idle" | "loading" | "found" | "not-found" | "cannot-receive" | "limit" | "error";
type ScanStatus = "idle" | "scanning" | "ready" | "error";

const LOCKER_CODE_PATTERN = /^[A-Za-z0-9_-]{2,32}$/;
// Preview links (?preview=<screen>) are a design aid only and must never be reachable in production.
const PREVIEW_ENABLED = process.env.NODE_ENV !== "production";
const PREVIEW_APPROVAL_SECONDS = 10 * 60;
const PREVIEW_DOOR_SECONDS = 5 * 60;
const PREVIEW_COMPARTMENT_CODE = "A03";

const formatTime = (seconds: number) =>
  `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;

const secondsUntil = (deadline: number) => Math.max(0, Math.ceil((deadline - Date.now()) / 1000));

const normalizePickupCode = (value: string) =>
  value.replace(/\D/g, "").slice(0, 6);

// Shared Boxora styles so every screen in the flow uses the same buttons and surfaces.
const PRIMARY_BUTTON_CLASS =
  "h-14 rounded-2xl bg-[#ff5b16] text-base font-semibold text-white shadow-[0_12px_28px_rgba(255,91,22,.24)]";
const SECONDARY_BUTTON_CLASS =
  "h-12 rounded-2xl border border-[#f1ded1] bg-white text-base font-semibold text-[#172033]";
const SURFACE_CARD_CLASS =
  "rounded-[1.7rem] border border-[#f2e7df] bg-white shadow-[0_18px_46px_rgba(91,40,10,.1)]";

function CountdownRing({
  seconds,
  totalSeconds,
  label,
  pendingLabel,
  ariaLabel,
  size = "lg",
}: {
  seconds: number | null;
  totalSeconds: number | null;
  label: string;
  pendingLabel: string;
  ariaLabel: (time: string) => string;
  size?: "lg" | "md";
}) {
  const radius = 112;
  const circumference = 2 * Math.PI * radius;
  const progress = seconds === null || !totalSeconds ? 1 : Math.max(0, Math.min(1, seconds / totalSeconds));

  return (
    <div
      aria-label={seconds === null ? pendingLabel : ariaLabel(formatTime(seconds))}
      className={`relative mx-auto aspect-square w-full ${size === "lg" ? "max-w-[17rem]" : "max-w-[13.5rem]"}`}
      role="timer"
    >
      <svg aria-hidden="true" className="absolute inset-0 size-full -rotate-90 drop-shadow-[0_14px_28px_rgba(255,91,22,.12)]" viewBox="0 0 260 260">
        <defs>
          <linearGradient id="countdown-ring" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="#ff9b55" />
            <stop offset="100%" stopColor="#ff5b16" />
          </linearGradient>
        </defs>
        <circle cx="130" cy="130" fill="none" r={radius} stroke="#ffeadc" strokeWidth="14" />
        <circle
          cx="130"
          cy="130"
          fill="none"
          r={radius}
          stroke="url(#countdown-ring)"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - progress)}
          strokeLinecap="round"
          strokeWidth="14"
          className="transition-[stroke-dashoffset] duration-1000 ease-linear"
        />
      </svg>
      <div className="absolute inset-[2.25rem] flex flex-col items-center justify-center rounded-full bg-[radial-gradient(circle_at_50%_30%,#fff_0%,#fff9f5_58%,#fff1e9_100%)] text-center shadow-[inset_0_0_0_1px_rgba(255,120,42,.08)]">
        <Clock className={`mb-2 text-[#ff5b16] ${size === "lg" ? "size-8" : "size-6"}`} />
        {seconds === null ? (
          <Spinner className="my-2 text-[#ff5b16]" color="current" size="lg" />
        ) : (
          <span className={`font-mono leading-none font-bold tracking-[-0.06em] text-[#172033] tabular-nums ${size === "lg" ? "text-[2.7rem]" : "text-[2.2rem]"}`}>
            {formatTime(seconds)}
          </span>
        )}
        <span className="mt-2 px-2 text-xs font-medium text-muted">{seconds === null ? pendingLabel : label}</span>
      </div>
    </div>
  );
}

function ApprovalCountdown({ seconds, totalSeconds }: { seconds: number | null; totalSeconds: number | null }) {
  return (
    <CountdownRing
      ariaLabel={(time) => `Còn ${time} để cư dân phê duyệt`}
      label="Đang chờ cư dân phê duyệt"
      pendingLabel="Đang đồng bộ thời hạn..."
      seconds={seconds}
      totalSeconds={totalSeconds}
    />
  );
}

const phoneDigits = (value: string) => value.replace(/\D/g, "");

// Accepts typed or pasted input; +84901234567 becomes 0901 234 567.
const normalizePhoneInput = (value: string) => {
  let digits = phoneDigits(value);
  if (value.trim().startsWith("+84") || (digits.startsWith("84") && digits.length > 10)) {
    digits = `0${digits.slice(2)}`;
  }
  return formatPhone(digits);
};

const formatPhone = (value: string) => {
  const digits = phoneDigits(value).slice(0, 11);
  return [digits.slice(0, 4), digits.slice(4, 7), digits.slice(7, 10), digits.slice(10)]
    .filter(Boolean)
    .join(" ");
};

const MAX_PARCEL_IMAGE_SIDE = 1600;

// Keeps the whole photo (the waybill must stay readable) and only shrinks it so it uploads fast on mobile data.
async function prepareParcelImage(file: File) {
  const image = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, MAX_PARCEL_IMAGE_SIDE / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));

  const context = canvas.getContext("2d");
  if (!context) {
    image.close();
    throw new Error("Không thể xử lý ảnh kiện hàng.");
  }

  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  image.close();

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) => result ? resolve(result) : reject(new Error("Không thể xử lý ảnh kiện hàng.")),
      "image/jpeg",
      0.85,
    );
  });
  const filename = file.name.replace(/\.[^.]+$/, "") || "kien-hang";
  return new File([blob], `${filename}.jpg`, { type: "image/jpeg", lastModified: Date.now() });
}

function AppHeader({ isBackDisabled = false, lockerCode, goBack }: { isBackDisabled?: boolean; lockerCode: string; goBack: () => void }) {
  return (
    <header className="safe-top sticky top-0 z-20 overflow-hidden bg-[#fffaf6]/95 px-4 pb-4 backdrop-blur-md">
      <div aria-hidden="true" className="absolute -right-8 -top-12 size-32 rotate-12 bg-[#ff7a2d]/12 [clip-path:polygon(25%_0,100%_0,72%_100%,0_82%)]" />
      <div className="relative mx-auto flex w-full max-w-lg items-center gap-2.5">
        <Button isIconOnly aria-label="Quay lại" className="size-11 shrink-0 text-[#202020]" isDisabled={isBackDisabled} variant="ghost" onPress={goBack}>
          <ArrowLeft className="size-6" />
        </Button>
        <Image alt="Logo Boxora" className="shrink-0" height={44} priority src="/boxora-logo.svg" width={44} />
        <div className="min-w-0">
          <p className="truncate text-[1.35rem] font-extrabold leading-6 tracking-[-0.035em] text-[#f55a12]">BOXORA</p>
          <p className="truncate text-sm font-medium text-[#697386]">{lockerCode ? `Tủ ${lockerCode}` : "Chưa xác định tủ"}</p>
        </div>
      </div>
    </header>
  );
}

function WelcomeScreen({
  onSend,
  onReceive,
  onReport,
}: {
  onSend: () => void;
  onReceive: () => void;
  onReport: () => void;
}) {
  return (
    <main className="welcome-screen relative isolate flex min-h-dvh flex-col overflow-hidden bg-[#fff4ea] text-[#172033]">
      <Image
        alt=""
        className="object-cover object-center"
        fill
        priority
        sizes="100vw"
        src="/boxora-locker-welcome.png"
      />
      <div aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,248,241,.08)_0%,rgba(255,248,241,.04)_38%,rgba(74,28,5,.08)_66%,rgba(34,15,6,.42)_100%)]" />

      <div className="welcome-brand relative z-10 mx-auto mt-[12dvh] flex flex-col items-center text-center sm:mt-[14dvh]">
        <Image alt="Logo Boxora" className="drop-shadow-[0_18px_35px_rgba(112,45,8,.22)]" height={112} priority src="/boxora-logo.svg" width={112} />
        <p className="mt-4 text-[11px] font-bold uppercase tracking-[0.28em] text-[#73300d]">Tủ khóa thông minh</p>
        <h1 className="mt-1 text-4xl font-bold tracking-[-0.06em] text-[#172033] drop-shadow-[0_2px_12px_rgba(255,255,255,.8)] sm:text-5xl">
          BOXORA
        </h1>
      </div>

      <div className="welcome-actions safe-bottom relative z-10 mx-auto mt-auto w-full max-w-md space-y-3 px-5 pb-5 sm:pb-8">
        <Button
          fullWidth
          aria-label="Bắt đầu gửi hàng"
          className="group h-[5.75rem] justify-between rounded-[1.8rem] border border-white/25 bg-[#f55a12] px-5 text-white shadow-[0_22px_50px_rgba(98,35,5,.34)] transition-transform active:scale-[.985]"
          size="lg"
          onPress={onSend}
        >
          <span className="flex items-center gap-4">
            <span className="flex size-13 items-center justify-center rounded-2xl bg-white/16 ring-1 ring-white/28">
              <Box className="size-8" />
            </span>
            <span className="text-[1.65rem] font-bold tracking-[-0.035em]">Gửi hàng</span>
          </span>
          <ArrowChevronRight className="size-7 transition-transform group-hover:translate-x-1" />
        </Button>

        <Button
          fullWidth
          aria-label="Bắt đầu lấy hàng"
          className="group h-[5.75rem] justify-between rounded-[1.8rem] border border-white/70 bg-white/92 px-5 text-[#172033] shadow-[0_20px_45px_rgba(61,26,7,.24)] backdrop-blur-md transition-transform active:scale-[.985]"
          size="lg"
          variant="secondary"
          onPress={onReceive}
        >
          <span className="flex items-center gap-4">
            <span className="flex size-13 items-center justify-center rounded-2xl bg-[#fff0e6] text-[#ef560f] ring-1 ring-[#f6c8ad]">
              <Lock className="size-8" />
            </span>
            <span className="text-[1.65rem] font-bold tracking-[-0.035em]">Lấy hàng</span>
          </span>
          <ArrowChevronRight className="size-7 transition-transform group-hover:translate-x-1" />
        </Button>

        <Button
          fullWidth
          className="h-11 text-sm font-semibold text-white drop-shadow-[0_1px_6px_rgba(0,0,0,.45)]"
          size="sm"
          variant="ghost"
          onPress={onReport}
        >
          <TriangleExclamation className="size-4" /> Báo sự cố tại tủ
        </Button>
      </div>
    </main>
  );
}

function ApiErrorCard({ message }: { message: string }) {
  return (
    <Card variant="secondary">
      <Card.Content className="flex items-start gap-3 text-sm">
        <TriangleExclamation className="mt-0.5 size-5 shrink-0 text-danger" />
        <span>{message}</span>
      </Card.Content>
    </Card>
  );
}

function ParcelPhotoGuide() {
  return (
    <div className="relative aspect-[4/3] overflow-hidden rounded-[1.7rem] bg-[#fff6ed] shadow-[0_18px_45px_rgba(102,45,10,.12)]">
      <Image
        alt="Ảnh mẫu kiện hàng nằm trọn trong khung"
        className="object-cover"
        fill
        priority
        sizes="(max-width: 640px) calc(100vw - 40px), 456px"
        src="/illustrations/parcel-photo-guide.png"
      />
      <div aria-hidden="true" className="absolute inset-0 bg-linear-to-t from-[#3f1d08]/35 via-transparent to-white/5" />
      <span aria-hidden="true" className="absolute left-5 top-5 size-10 rounded-tl-xl border-l-3 border-t-3 border-white drop-shadow-md" />
      <span aria-hidden="true" className="absolute right-5 top-5 size-10 rounded-tr-xl border-r-3 border-t-3 border-white drop-shadow-md" />
      <span aria-hidden="true" className="absolute bottom-5 left-5 size-10 rounded-bl-xl border-b-3 border-l-3 border-white drop-shadow-md" />
      <span aria-hidden="true" className="absolute bottom-5 right-5 size-10 rounded-br-xl border-b-3 border-r-3 border-white drop-shadow-md" />
      <div className="absolute inset-x-7 bottom-5 flex items-center justify-center gap-2 rounded-full border border-white/45 bg-[#2d1609]/58 px-4 py-2.5 text-center text-sm font-semibold text-white shadow-lg backdrop-blur-md">
        <Camera className="size-4 shrink-0" />
        Chụp mặt có vận đơn, chữ thật rõ
      </div>
    </div>
  );
}

function StatusScreen({
  tone,
  icon,
  title,
  description,
  details,
  actions,
}: {
  tone: "danger" | "warning" | "success" | "brand";
  icon: ReactNode;
  title: string;
  description: string;
  details?: ReactNode;
  actions: ReactNode;
}) {
  const toneClass = {
    danger: "bg-[#fff0ec] text-[#e5484d] ring-[#ffd9d2]",
    warning: "bg-[#fff4e5] text-[#e07b00] ring-[#ffe2bf]",
    success: "bg-[#eaf9ef] text-[#20a555] ring-[#c9efd6]",
    brand: "bg-[#fff0e5] text-[#ff5b16] ring-[#ffd7bf]",
  }[tone];

  return (
    <div className="flex flex-1 flex-col">
      <div className="pt-4 text-center">
        <span className={`mx-auto flex size-20 items-center justify-center rounded-[1.6rem] shadow-[0_14px_32px_rgba(91,40,10,.08)] ring-1 ${toneClass}`}>
          {icon}
        </span>
        <h1 className="mt-5 text-[1.9rem] font-extrabold leading-tight tracking-[-0.05em] text-balance text-[#172033]">{title}</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-pretty text-muted">{description}</p>
      </div>
      {details ? <div className="mt-7 space-y-3">{details}</div> : null}
      <div className="mt-auto space-y-3 pt-7">{actions}</div>
    </div>
  );
}

function InfoRows({ title, subtitle, rows }: { title?: string; subtitle?: string; rows: [string, string][] }) {
  return (
    <Card className={`gap-0 p-0 ${SURFACE_CARD_CLASS}`}>
      {title ? (
        <Card.Header className="flex-row items-center gap-3 border-b border-[#eee7e1] px-5 py-4">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#fff0e5] text-[#ff5b16]">
            <Receipt className="size-5" />
          </span>
          <div className="min-w-0">
            <Card.Title className="text-[15px] font-bold text-[#172033]">{title}</Card.Title>
            {subtitle ? <Card.Description className="truncate text-xs">{subtitle}</Card.Description> : null}
          </div>
        </Card.Header>
      ) : null}
      <Card.Content className="px-5 py-1">
        {rows.map(([label, value]) => (
          <div className="flex items-center justify-between gap-4 border-b border-[#eee7e1] py-3.5 last:border-0" key={label}>
            <span className="text-sm text-muted">{label}</span>
            <span className="text-right text-sm font-bold text-[#172033]">{value}</span>
          </div>
        ))}
      </Card.Content>
    </Card>
  );
}

function HintCard({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <Card className="rounded-2xl border border-[#ffe1cf] bg-[#fff5ed] shadow-none" variant="secondary">
      <Card.Content className="flex-row items-center gap-3 text-sm leading-5 text-[#6f3a1a]">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white text-[#ff5b16] shadow-sm">{icon}</span>
        <span>{children}</span>
      </Card.Content>
    </Card>
  );
}

export function DeliveryFlow() {
  const [screen, setScreen] = useState<Screen>("welcome");
  const [lockerCode, setLockerCode] = useState("");
  const [phone, setPhone] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [recipientStatus, setRecipientStatus] = useState<RecipientStatus>("idle");
  const [recipientMessage, setRecipientMessage] = useState("");
  const [lookupTick, setLookupTick] = useState(0);
  const [scanStatus, setScanStatus] = useState<ScanStatus>("idle");
  const [ocrNotice, setOcrNotice] = useState<"" | keyof typeof OCR_NOTICES>("");
  const [ocrPhones, setOcrPhones] = useState<string[]>([]);
  const [isPhotoZoomed, setIsPhotoZoomed] = useState(false);
  const [apiError, setApiError] = useState("");
  const [deliverySession, setDeliverySession] = useState<DeliverySession | null>(null);
  const [compartmentCode, setCompartmentCode] = useState("");
  const [parcelId, setParcelId] = useState("");
  const [approvalDeadline, setApprovalDeadline] = useState<number | null>(null);
  const [approvalSeconds, setApprovalSeconds] = useState<number | null>(null);
  const [approvalTotalSeconds, setApprovalTotalSeconds] = useState<number | null>(null);
  const submittedAt = useRef<number | null>(null);
  const [isSendingRequest, setIsSendingRequest] = useState(false);
  const [otp, setOtp] = useState("");
  const [otpError, setOtpError] = useState("");
  const [isVerifyingPickup, setIsVerifyingPickup] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [doorDeadline, setDoorDeadline] = useState<number | null>(null);
  const [doorSeconds, setDoorSeconds] = useState<number | null>(null);
  const [doorTotalSeconds, setDoorTotalSeconds] = useState<number | null>(null);
  const [checkingDoor, setCheckingDoor] = useState(false);
  const [openingDoor, setOpeningDoor] = useState(false);
  const [pickupSession, setPickupSession] = useState<ReturnPickupSession | null>(null);
  const [pickupCompartmentCode, setPickupCompartmentCode] = useState("");
  const [incidentOrigin, setIncidentOrigin] = useState<Screen>("welcome");
  const [incidentType, setIncidentType] = useState<GuestIncidentType | "">("");
  const [incidentDescription, setIncidentDescription] = useState("");
  const [incidentError, setIncidentError] = useState("");
  const [isSubmittingIncident, setIsSubmittingIncident] = useState(false);
  const [incidentReference, setIncidentReference] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);
  const deliverySessionRef = useRef<DeliverySession | null>(null);
  const sessionPromise = useRef<Promise<DeliverySession> | null>(null);
  const phoneTouched = useRef(false);
  const scanRun = useRef(0);
  const lookupRun = useRef(0);
  // Set only when the OCR quota is used up and the photo was stored through the plain image upload instead.
  const fallbackImageUrl = useRef<string | null>(null);

  const storeSession = useCallback((session: DeliverySession | null) => {
    deliverySessionRef.current = session;
    setDeliverySession(session);
  }, []);

  const clearDraft = useCallback(() => {
    window.sessionStorage.removeItem(DRAFT_STORAGE_KEY);
  }, []);

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const scannedLockerCode = searchParams.get("locker")?.trim() ?? "";
    const preview = PREVIEW_ENABLED ? (searchParams.get("preview") as Screen | null) : null;
    const previewPhone = PREVIEW_ENABLED ? searchParams.get("phone") : null;
    const available: Screen[] = ["welcome", "receive-otp", "receive-details", "receive-open-failed", "receive-opened", "receive-success", "recipient", "parcel", "waiting", "searching", "compartment", "closing", "success", "not-found", "rejected", "expired", "full", "door-timeout", "invalid-locker", "locker-unavailable"];
    const timer = window.setTimeout(() => {
      if (!LOCKER_CODE_PATTERN.test(scannedLockerCode)) {
        setScreen("invalid-locker");
        return;
      }
      setLockerCode(scannedLockerCode);
      // Resume an unfinished drop-off after a reload or app switch; the photo itself cannot be restored.
      try {
        const draft = JSON.parse(window.sessionStorage.getItem(DRAFT_STORAGE_KEY) ?? "null") as
          | { lockerCode: string; session: DeliverySession; phone: string }
          | null;
        if (draft && draft.lockerCode === scannedLockerCode && new Date(draft.session.sessionExpiresAt).getTime() > Date.now()) {
          storeSession(draft.session);
          if (draft.phone) {
            phoneTouched.current = true;
            setPhone(draft.phone);
          }
        }
      } catch {
        window.sessionStorage.removeItem(DRAFT_STORAGE_KEY);
      }
      if (previewPhone) setPhone(formatPhone(previewPhone));
      if (preview === "waiting") {
        setApprovalDeadline(Date.now() + PREVIEW_APPROVAL_SECONDS * 1000);
        setApprovalTotalSeconds(PREVIEW_APPROVAL_SECONDS);
      }
      if (preview === "closing") {
        setDoorDeadline(Date.now() + PREVIEW_DOOR_SECONDS * 1000);
        setDoorTotalSeconds(PREVIEW_DOOR_SECONDS);
      }
      if (preview && available.includes(preview)) {
        setCompartmentCode(PREVIEW_COMPARTMENT_CODE);
        setPickupCompartmentCode(PREVIEW_COMPARTMENT_CODE);
        setScreen(preview);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [storeSession]);

  useEffect(() => {
    if (screen !== "closing" || !doorDeadline) return;
    const updateDoorCountdown = () => setDoorSeconds(secondsUntil(doorDeadline));
    updateDoorCountdown();
    const timer = window.setInterval(updateDoorCountdown, 1000);
    return () => window.clearInterval(timer);
  }, [screen, doorDeadline]);

  useEffect(() => {
    if (screen !== "waiting" || !deliverySession) return;
    let cancelled = false;
    let inFlight = false;
    let timer: number | undefined;

    const poll = async () => {
      if (
        cancelled ||
        inFlight ||
        document.visibilityState !== "visible" ||
        !navigator.onLine
      )
        return;
      inFlight = true;
      try {
        const status = await getDeliveryStatus(deliverySession.id, deliverySession.guestSessionToken);
        if (cancelled) return;
        setApiError("");
        if (status.approvalExpiresAt) {
          const deadline = new Date(status.approvalExpiresAt).getTime();
          const startedAt = submittedAt.current ?? Date.now();
          setApprovalDeadline(deadline);
          setApprovalSeconds(secondsUntil(deadline));
          setApprovalTotalSeconds((total) => total ?? Math.max(1, Math.round((deadline - startedAt) / 1000)));
        }
        if (status.status === "Approved") {
          const reservation = await reserveCompartment(deliverySession.id, deliverySession.guestSessionToken);
          if (cancelled) return;
          setCompartmentCode(reservation.compartmentCode);
          const reservationDeadline = new Date(reservation.reservationExpiresAt).getTime();
          setDoorDeadline(reservationDeadline);
          setDoorTotalSeconds(secondsUntil(reservationDeadline));
          setScreen("compartment");
          return;
        }
        if (status.status === "Allocated" && status.compartmentCode) {
          setCompartmentCode(status.compartmentCode);
          if (status.reservationExpiresAt) {
            const reservationDeadline = new Date(status.reservationExpiresAt).getTime();
            setDoorDeadline(reservationDeadline);
            setDoorTotalSeconds((total) => total ?? secondsUntil(reservationDeadline));
          }
          setScreen("compartment");
          return;
        }
        if (status.status === "Deposited") {
          setParcelId(status.parcelId ?? "");
          setScreen("success");
          return;
        }
        if (status.status === "Rejected") return setScreen("rejected");
        if (status.status === "Expired" || status.status === "Cancelled") return setScreen("expired");
        if (status.status === "Failed") return setScreen(status.failureCode === "NoCompartment" ? "full" : "door-timeout");
        timer = window.setTimeout(poll, 2000);
      } catch (error) {
        if (cancelled) return;
        setApiError(error instanceof Error ? error.message : "Không thể kiểm tra trạng thái yêu cầu.");
        timer = window.setTimeout(poll, 3000);
      } finally {
        inFlight = false;
      }
    };

    const resumePolling = () => {
      if (document.visibilityState !== "visible" || !navigator.onLine) return;
      if (timer) window.clearTimeout(timer);
      timer = undefined;
      void poll();
    };

    void poll();
    document.addEventListener("visibilitychange", resumePolling);
    window.addEventListener("online", resumePolling);
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", resumePolling);
      window.removeEventListener("online", resumePolling);
    };
  }, [deliverySession, screen]);

  useEffect(() => {
    if (screen !== "waiting" || !approvalDeadline) return;

    const updateCountdown = () => {
      const remaining = secondsUntil(approvalDeadline);
      setApprovalSeconds(remaining);
      if (remaining === 0) setScreen("expired");
    };

    updateCountdown();
    const timer = window.setInterval(updateCountdown, 250);
    return () => window.clearInterval(timer);
  }, [approvalDeadline, screen]);

  useEffect(() => {
    if (!deliverySession || !["parcel", "recipient"].includes(screen)) return;
    window.sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({ lockerCode, session: deliverySession, phone }));
  }, [deliverySession, lockerCode, phone, screen]);

  // Looks the recipient up once a full number is present, so the Shipper can compare the name with the waybill.
  useEffect(() => {
    if (screen !== "recipient") return;
    const digits = phoneDigits(phone);
    const run = ++lookupRun.current;
    const timer = window.setTimeout(async () => {
      if (!PHONE_PATTERN.test(digits)) {
        setRecipientStatus("idle");
        setRecipientName("");
        setRecipientMessage("");
        return;
      }
      const session = deliverySessionRef.current;
      if (!session || (scanStatus !== "ready" && !fallbackImageUrl.current)) return;
      setRecipientStatus("loading");
      setRecipientName("");
      try {
        const result = await resolveRecipient(session.id, session.guestSessionToken, digits);
        if (run !== lookupRun.current) return;
        setRecipientName(result.fullName);
        setRecipientStatus("found");
      } catch (error) {
        if (run !== lookupRun.current) return;
        setRecipientName("");
        if (error instanceof DeliveryApiError && error.code === "delivery/recipient_not_found") {
          setRecipientStatus("not-found");
        } else if (error instanceof DeliveryApiError && error.code === "delivery/recipient_cannot_receive") {
          setRecipientStatus("cannot-receive");
        } else if (error instanceof DeliveryApiError && error.code === "delivery/lookup_limit_reached") {
          setRecipientStatus("limit");
        } else {
          setRecipientStatus("error");
          setRecipientMessage(error instanceof Error ? error.message : "Không thể tra cứu người nhận.");
        }
      }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [phone, scanStatus, screen, lookupTick]);

  useEffect(() => {
    if (!imageUrl?.startsWith("blob:")) return;
    return () => URL.revokeObjectURL(imageUrl);
  }, [imageUrl]);

  useEffect(() => {
    if (screen !== "receive-opened" || !pickupSession) return;
    let cancelled = false;
    let timer: number | undefined;

    const poll = async () => {
      if (cancelled || document.visibilityState !== "visible" || !navigator.onLine) return;
      try {
        await getReturnPickup(pickupSession);
        if (!cancelled) timer = window.setTimeout(poll, 2000);
      } catch (error) {
        if (cancelled) return;
        if (error instanceof DeliveryApiError && error.status === 409) {
          setApiError("");
          setPickupCompartmentCode(pickupSession.compartmentCode);
          setPickupSession(null);
          setScreen("receive-success");
          return;
        }
        setApiError(error instanceof Error ? error.message : "Không thể kiểm tra trạng thái cửa tủ.");
        timer = window.setTimeout(poll, 3000);
      }
    };

    const resumePolling = () => {
      if (document.visibilityState !== "visible" || !navigator.onLine) return;
      if (timer) window.clearTimeout(timer);
      timer = undefined;
      void poll();
    };

    void poll();
    document.addEventListener("visibilitychange", resumePolling);
    window.addEventListener("online", resumePolling);
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", resumePolling);
      window.removeEventListener("online", resumePolling);
    };
  }, [pickupSession, screen]);

  const reset = () => {
    setScreen("welcome");
    setPhone("");
    phoneTouched.current = false;
    scanRun.current += 1;
    lookupRun.current += 1;
    fallbackImageUrl.current = null;
    sessionPromise.current = null;
    clearDraft();
    setRecipientName("");
    setRecipientStatus("idle");
    setRecipientMessage("");
    setScanStatus("idle");
    setOcrNotice("");
    setOcrPhones([]);
    setIsPhotoZoomed(false);
    setApiError("");
    storeSession(null);
    setCompartmentCode("");
    setParcelId("");
    setApprovalDeadline(null);
    setApprovalSeconds(null);
    setApprovalTotalSeconds(null);
    submittedAt.current = null;
    setIsSendingRequest(false);
    setOtp("");
    setOtpError("");
    setIsVerifyingPickup(false);
    setImageUrl(null);
    setImageFile(null);
    setDoorDeadline(null);
    setDoorTotalSeconds(null);
    setDoorSeconds(null);
    setCheckingDoor(false);
    setOpeningDoor(false);
    setPickupSession(null);
    setPickupCompartmentCode("");
    setIncidentType("");
    setIncidentDescription("");
    setIncidentError("");
    setIncidentReference("");
  };

  const openIncidentReport = () => {
    setIncidentOrigin(screen);
    setIncidentType(screen.startsWith("receive-") ? "Return" : "");
    setIncidentDescription("");
    setIncidentError("");
    setScreen("incident");
  };

  const submitIncident = async () => {
    const description = incidentDescription.trim();
    const type = INCIDENT_TYPES.find((item) => item.value === incidentType);
    if (!type) {
      setIncidentError("Chọn loại sự cố trước khi gửi.");
      return;
    }
    if (description.length < INCIDENT_DESCRIPTION_MIN) {
      setIncidentError(`Mô tả cần ít nhất ${INCIDENT_DESCRIPTION_MIN} ký tự để bộ phận vận hành xử lý.`);
      return;
    }

    setIncidentError("");
    setIsSubmittingIncident(true);
    try {
      // Link the report to the guest flow in progress so operators see the related request.
      const incident = await reportGuestIncident({
        lockerCode,
        type: type.value,
        title: `Shipper báo sự cố: ${type.label}`,
        description,
        deliveryRequestId: pickupSession ? undefined : deliverySession?.id,
        returnRequestId: pickupSession?.returnRequestId,
      });
      setIncidentReference(incident.referenceCode);
      setScreen("incident-success");
    } catch (error) {
      if (error instanceof DeliveryApiError && error.code === "locker/not_found") {
        setScreen("invalid-locker");
        return;
      }
      setIncidentError(error instanceof Error ? error.message : "Không thể gửi báo cáo sự cố. Vui lòng thử lại.");
    } finally {
      setIsSubmittingIncident(false);
    }
  };

  const verifyPickupCode = async () => {
    setOtpError("");
    if (!/^\d{6}$/.test(otp)) {
      setOtpError("Mã lấy hàng phải gồm đúng 6 chữ số.");
      return;
    }
    setIsVerifyingPickup(true);
    try {
      const session = await validateReturnPickup(lockerCode, otp);
      setPickupSession(session);
      setPickupCompartmentCode(session.compartmentCode);
      setScreen("receive-details");
    } catch (error) {
      setOtpError(error instanceof Error ? error.message : "Mã lấy hàng không hợp lệ.");
    } finally {
      setIsVerifyingPickup(false);
    }
  };

  const openPickupCompartment = async () => {
    if (!pickupSession) return;
    setApiError("");
    setOpeningDoor(true);
    try {
      setPickupSession(await openReturnPickup(pickupSession));
      setScreen("receive-opened");
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Không thể mở ngăn tủ.");
      setScreen("receive-open-failed");
    } finally { setOpeningDoor(false); }
  };

  const handleSessionError = (error: unknown) => {
    if (error instanceof DeliveryApiError && error.code === "locker/not_found") {
      setScreen("invalid-locker");
    } else if (error instanceof DeliveryApiError && error.code === "locker/not_operational") {
      setScreen("locker-unavailable");
    } else {
      setApiError(error instanceof Error ? error.message : "Không thể khởi tạo phiên gửi hàng.");
    }
  };

  // The session is created in the background so the camera can open straight from the tap.
  const ensureSession = (): Promise<DeliverySession> => {
    if (deliverySessionRef.current) return Promise.resolve(deliverySessionRef.current);
    if (!sessionPromise.current) {
      sessionPromise.current = initiateDelivery(lockerCode)
        .then((session) => {
          storeSession(session);
          return session;
        })
        .finally(() => {
          sessionPromise.current = null;
        });
    }
    return sessionPromise.current;
  };

  const beginSend = () => {
    setApiError("");
    setScreen("parcel");
    fileInput.current?.click();
    ensureSession().catch(handleSessionError);
  };

  const runScan = async (file: File) => {
    const run = ++scanRun.current;
    fallbackImageUrl.current = null;
    setScanStatus("scanning");
    setOcrNotice("");
    setOcrPhones([]);
    setApiError("");

    try {
      let result: Awaited<ReturnType<typeof scanWaybill>> | undefined;
      for (let attempt = 0; !result; attempt += 1) {
        const session = await ensureSession();
        try {
          result = await scanWaybill(session.id, session.guestSessionToken, file);
        } catch (error) {
          // A session restored after a reload may already be gone, so start a fresh one once.
          const stale = error instanceof DeliveryApiError && [401, 404, 410].includes(error.status);
          if (!stale || attempt > 0) throw error;
          storeSession(null);
        }
      }
      if (run !== scanRun.current) return;

      setScanStatus("ready");
      if (result.isMasked) {
        setOcrNotice("masked");
      } else if (result.status === "Succeeded" && result.phones.length > 0) {
        setOcrNotice("success");
        setOcrPhones(result.phones);
        if (!phoneTouched.current) setPhone(formatPhone(result.phones[0]));
      } else {
        setOcrNotice("failed");
      }
    } catch (error) {
      if (run !== scanRun.current) return;
      if (error instanceof DeliveryApiError && error.code === "delivery/ocr_limit_reached") {
        // Automatic reading is used up for this session: keep the photo through the plain upload and let the Shipper type.
        try {
          fallbackImageUrl.current = await uploadParcelFile(file);
          if (run !== scanRun.current) return;
          setScanStatus("ready");
          setOcrNotice("failed");
        } catch (uploadError) {
          if (run !== scanRun.current) return;
          setScanStatus("error");
          setApiError(uploadError instanceof Error ? uploadError.message : "Không thể tải ảnh kiện hàng lên.");
        }
        return;
      }
      setScanStatus("error");
      setApiError(error instanceof Error ? error.message : "Không thể tải ảnh kiện hàng lên.");
    }
  };

  const choosePhoto = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const prepared = await prepareParcelImage(file);
      setImageFile(prepared);
      setImageUrl(URL.createObjectURL(prepared));
      setApiError("");
      setScreen("recipient");
      void runScan(prepared);
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Không thể xử lý ảnh kiện hàng.");
    }
  };

  const changePhone = (value: string) => {
    phoneTouched.current = true;
    setPhone(normalizePhoneInput(value));
  };

  const sendDeliveryRequest = async () => {
    const session = deliverySessionRef.current;
    if (!session || recipientStatus !== "found") {
      setApiError("Chưa xác nhận được người nhận. Vui lòng kiểm tra lại số điện thoại.");
      return;
    }

    setApiError("");
    setIsSendingRequest(true);
    try {
      await submitDelivery(session.id, session.guestSessionToken, fallbackImageUrl.current, phoneDigits(phone));
      clearDraft();
      // The approval window comes from the active system policy; the countdown starts once
      // the backend reports approvalExpiresAt on the first status poll.
      submittedAt.current = Date.now();
      setApprovalDeadline(null);
      setApprovalSeconds(null);
      setApprovalTotalSeconds(null);
      setScreen("waiting");
    } catch (error) {
      if (error instanceof DeliveryApiError && error.status === 404) {
        setScreen("not-found");
      } else if (error instanceof DeliveryApiError && error.code === "delivery/recipient_cannot_receive") {
        setRecipientStatus("cannot-receive");
        setRecipientName("");
      } else {
        setApiError(error instanceof Error ? error.message : "Không thể gửi yêu cầu giao hàng.");
      }
    } finally {
      setIsSendingRequest(false);
    }
  };

  const verifyDoor = async () => {
    if (!deliverySession) return;
    setCheckingDoor(true);
    setApiError("");
    try {
      const status = await getDeliveryStatus(deliverySession.id, deliverySession.guestSessionToken);
      if (status.status !== "Deposited") {
        throw new Error("Hệ thống chưa ghi nhận cửa đã đóng. Vui lòng chờ vài giây rồi thử lại.");
      }
      setParcelId(status.parcelId ?? "");
      setScreen("success");
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Chưa thể xác nhận cửa đã đóng.");
    } finally {
      setCheckingDoor(false);
    }
  };

  const goBack = () => {
    const previous: Partial<Record<Screen, Screen>> = {
      "receive-otp": "welcome",
      "receive-details": "receive-otp",
      "receive-open-failed": "receive-details",
      "receive-success": "welcome",
      parcel: "welcome",
      recipient: "parcel",
      "not-found": "recipient",
      waiting: "recipient",
      searching: "recipient",
      compartment: "searching",
      closing: "compartment",
      rejected: "welcome",
      expired: "welcome",
      full: "welcome",
      "door-timeout": "welcome",
      "locker-unavailable": "welcome",
      success: "welcome",
      incident: incidentOrigin,
      "incident-success": "welcome",
    };
    setScreen(previous[screen] ?? "welcome");
  };

  const reportIncidentLink = (
    <Button fullWidth className="h-11 text-sm font-semibold text-[#f55a12]" size="sm" variant="ghost" onPress={openIncidentReport}>
      <TriangleExclamation className="size-4" /> Báo sự cố tại tủ
    </Button>
  );

  const content = (() => {
    switch (screen) {
      case "welcome":
        return null;

      case "receive-otp":
        return (
          <div className="flex min-h-0 flex-1 flex-col">
            <h1 className="pt-4 text-center text-[2.35rem] font-extrabold tracking-[-0.055em] text-[#171717] sm:pt-6 sm:text-[2.7rem]">
              Lấy Hàng
            </h1>
            <Form className="mt-8 flex min-h-0 flex-1 flex-col" onSubmit={(event) => { event.preventDefault(); verifyPickupCode(); }}>
              <div className="flex flex-col gap-3">
                <Label className="text-base font-semibold text-[#697386]">Nhập mã lấy hàng</Label>
                <InputOTP
                  aria-describedby={otpError ? "otp-error" : undefined}
                  className="w-full"
                  inputMode="numeric"
                  isDisabled={isVerifyingPickup}
                  isInvalid={Boolean(otpError)}
                  maxLength={6}
                  name="pickup-code"
                  pasteTransformer={normalizePickupCode}
                  pattern={REGEXP_ONLY_DIGITS}
                  value={otp}
                  onChange={(value) => { setOtp(normalizePickupCode(value)); setOtpError(""); }}
                >
                  <InputOTP.Group>
                    {[0, 1, 2, 3, 4, 5].map((index) => (
                      <InputOTP.Slot
                        className="h-16! w-[calc((100vw-5rem)/6)]! flex-none! rounded-2xl border-2 border-[#ffd7bf] bg-white text-2xl font-bold text-[#171717] shadow-[0_8px_24px_rgba(119,52,14,.04)] data-[active=true]:border-[#ff5b16] data-[active=true]:ring-4 data-[active=true]:ring-[#ff5b16]/10 sm:h-[4.5rem]! sm:w-14!"
                        index={index}
                        key={index}
                      />
                    ))}
                  </InputOTP.Group>
                </InputOTP>
                <span className="min-h-5 text-sm font-medium text-danger" data-visible={Boolean(otpError)} id="otp-error">
                  {otpError}
                </span>
              </div>

              <div className="relative -mx-2 mt-1 min-h-52 flex-1 sm:min-h-64">
                <Image
                  alt="Tủ Boxora đang mở với kiện hàng bên trong"
                  className="object-contain"
                  fill
                  priority
                  sizes="(max-width: 640px) calc(100vw - 24px), 500px"
                  src="/illustrations/pickup-locker.png"
                />
              </div>

              <Button
                fullWidth
                isDisabled={otp.length !== 6}
                isPending={isVerifyingPickup}
                className="h-16 justify-between rounded-[1.4rem] bg-[#ff5b16] px-6 text-lg font-bold text-white shadow-[0_16px_34px_rgba(255,91,22,.25)]"
                size="lg"
                type="submit"
              >
                {isVerifyingPickup ? <Spinner color="current" size="sm" /> : <span className="size-5" />}
                {isVerifyingPickup ? "Đang xác thực..." : "Tiếp tục"}
                <ArrowChevronRight className={`size-6 ${isVerifyingPickup ? "invisible" : ""}`} />
              </Button>
            </Form>
          </div>
        );

      case "receive-details":
        return (
          <div className="flex flex-1 flex-col">
            <div>
              <span className="flex size-16 items-center justify-center rounded-[1.3rem] bg-[#fff0e5] text-[#ff5b16] shadow-[0_10px_28px_rgba(255,91,22,.1)]">
                <CircleCheckFill className="size-9" />
              </span>
              <h1 className="mt-5 text-[2rem] font-extrabold leading-tight tracking-[-0.05em] text-[#171717]">
                Đã tìm thấy hàng trả
              </h1>
              <p className="mt-2 text-base text-[#697386]">Kiểm tra thông tin trước khi mở ngăn.</p>
            </div>

            <Card className="relative mt-6 min-h-[22rem] overflow-hidden rounded-[1.7rem] border border-[#f2e8e1] bg-white p-0 shadow-[0_18px_48px_rgba(92,40,11,.12)]">
              <div aria-hidden="true" className="absolute inset-y-0 right-0 w-[58%] [mask-image:linear-gradient(to_right,transparent_0%,black_45%)]">
                {pickupSession ? (
                  // The backend may return images from different configured storage hosts.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img alt="Ảnh kiện hàng cư dân gửi" className="size-full object-cover object-center" src={pickupSession.imageUrl} />
                ) : null}
                <div className="absolute inset-0 bg-linear-to-b from-white/45 via-transparent to-white/20" />
                <Chip className="absolute right-5 top-[47%] border border-white/60 bg-[#ff6a1a] font-bold text-white shadow-lg" size="sm">
                  {pickupSession?.compartmentCode}
                </Chip>
              </div>

              <Card.Content className="relative z-10 flex h-full flex-col p-6">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-[#697386]">Ngăn tủ</p>
                    <p className="mt-1 text-[4.7rem] font-black leading-none tracking-[-0.08em] text-[#ff5b16]">{pickupSession?.compartmentCode}</p>
                  </div>
                  <Chip className="shrink-0" color="success" size="sm" variant="soft">
                    <CircleCheckFill className="size-4" /> Đã xác thực
                  </Chip>
                </div>

                <div className="mt-4 flex items-center gap-2 text-sm font-medium text-[#697386]">
                  <MapPin className="size-5 shrink-0 text-[#ff5b16]" />
                  <span>Tủ Boxora · {pickupSession?.lockerCode ?? lockerCode}</span>
                </div>

                <div className="mt-5 h-px bg-[#eee7e1]" />

                <div className="mt-5 flex items-center gap-4">
                  <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-[#fff0e5] text-[#ff5b16]">
                    <Box className="size-6" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm text-[#697386]">Kiện hàng trả đã được xác nhận</p>
                    <p className="text-base font-bold text-[#171717]">Chỉ mở ngăn {pickupSession?.compartmentCode}</p>
                  </div>
                </div>
              </Card.Content>
            </Card>

            <div className="mt-auto pt-6">
              <Button
                fullWidth
                isPending={openingDoor}
                className="h-16 rounded-[1.4rem] bg-[#ff5b16] text-lg font-bold text-white shadow-[0_16px_34px_rgba(255,91,22,.25)]"
                size="lg"
                onPress={openPickupCompartment}
              >
                {openingDoor ? <><Spinner color="current" size="sm" /> Đang mở ngăn...</> : <><LockOpen className="size-7" /> Mở ngăn {pickupSession?.compartmentCode}</>}
              </Button>
            </div>
          </div>
        );

      case "receive-opened":
        return (
          <div className="flex flex-1 flex-col">
            <div className="text-center">
              <span className="mx-auto flex size-20 items-center justify-center rounded-full bg-[#eaf9ef] text-[#20a555] shadow-[0_12px_32px_rgba(32,165,85,.14)]">
                <CircleCheckFill className="size-11" />
              </span>
              <h1 className="mt-5 text-[2rem] font-extrabold tracking-[-0.05em] text-[#171717]">Ngăn {pickupSession?.compartmentCode} đã mở</h1>
              <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[#697386]">
                Lấy kiện hàng ra khỏi ngăn và đóng cửa tủ sau khi hoàn tất.
              </p>
            </div>

            <Card className="mt-6 overflow-hidden rounded-[1.7rem] border border-[#f2e8e1] bg-white p-0 shadow-[0_18px_48px_rgba(92,40,11,.12)]">
              <Card.Content className="p-0">
                <div className="relative aspect-[16/9] overflow-hidden bg-[#fff7ef]">
                  {pickupSession ? (
                    // The backend may return images from different configured storage hosts.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img alt="Ảnh kiện hàng cần lấy" className="size-full object-cover object-center" src={pickupSession.imageUrl} />
                  ) : null}
                  <div className="absolute inset-0 bg-linear-to-t from-[#3b1b08]/30 via-transparent to-white/10" />
                  <Chip className="absolute right-4 top-4 border border-white/60 bg-[#ff6a1a] font-bold text-white shadow-lg" size="sm">
                    {pickupSession?.compartmentCode} · Đang mở
                  </Chip>
                </div>
                <div className="grid grid-cols-2 divide-x divide-[#eee7e1] px-2 py-4 text-center">
                  <div>
                    <p className="text-xs text-[#697386]">Tủ locker</p>
                    <p className="mt-1 font-bold text-[#171717]">{lockerCode}</p>
                  </div>
                  <div>
                    <p className="text-xs text-[#697386]">Ngăn lấy hàng</p>
                    <p className="mt-1 font-bold text-[#ff5b16]">{pickupSession?.compartmentCode}</p>
                  </div>
                </div>
              </Card.Content>
            </Card>

            <Card className="mt-4 rounded-2xl border border-[#ffe1cf] bg-[#fff5ed] shadow-none" variant="secondary">
              <Card.Content className="flex-row items-center gap-3 text-sm leading-5 text-[#6f3a1a]">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white text-[#ff5b16] shadow-sm">
                  <Box className="size-5" />
                </span>
                <span><strong>Lấy kiện hàng</strong>, sau đó đóng chặt cửa ngăn trước khi rời đi.</span>
              </Card.Content>
            </Card>

            {apiError ? <div className="mt-4"><ApiErrorCard message={apiError} /></div> : null}
            <div className="mt-auto flex items-center justify-center gap-3 pt-6 text-sm font-semibold text-[#697386]" aria-live="polite">
              <Spinner size="sm" /> Đang chờ tủ xác nhận cửa đã đóng
            </div>
          </div>
        );

      case "receive-success":
        return (
          <StatusScreen
            tone="success"
            icon={<CircleCheckFill className="size-11" />}
            title="Lấy hàng thành công"
            description={`Tủ đã xác nhận cửa ngăn ${pickupCompartmentCode} đóng và phiên lấy hàng đã hoàn tất.`}
            details={<InfoRows rows={[["Locker", lockerCode], ["Ngăn", pickupCompartmentCode], ["Trạng thái", "Đã lấy hàng"]]} />}
            actions={<Button fullWidth className={PRIMARY_BUTTON_CLASS} size="lg" onPress={reset}>Hoàn tất</Button>}
          />
        );

      case "receive-open-failed":
        return (
          <div className="flex flex-1 flex-col text-center">
            <div>
              <span className="mx-auto flex size-20 items-center justify-center rounded-full bg-[#fff0e8] text-[#e64b16] shadow-[0_12px_32px_rgba(230,75,22,.12)]">
                <TriangleExclamation className="size-10" />
              </span>
              <h1 className="mt-5 text-[2rem] font-extrabold leading-tight tracking-[-0.05em] text-[#171717]">
                 Không thể mở ngăn {pickupSession?.compartmentCode}
              </h1>
              <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[#697386]">
                Tủ chưa phản hồi yêu cầu mở ngăn. Kiện hàng vẫn đang được khóa an toàn.
              </p>
            </div>

            <Card className="mt-7 rounded-[1.7rem] border border-[#f4ded2] bg-white text-left shadow-[0_18px_48px_rgba(92,40,11,.1)]">
              <Card.Content className="space-y-4">
                <div className="flex items-center gap-3">
                  <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-[#fff0e8] text-[#e64b16]">
                    <Lock className="size-6" />
                  </span>
                  <div>
                    <p className="font-bold text-[#171717]">Cửa ngăn vẫn đang đóng</p>
                    <p className="text-sm text-[#697386]">Tủ {lockerCode} · Ngăn {pickupSession?.compartmentCode}</p>
                  </div>
                </div>
                <div className="h-px bg-[#eee7e1]" />
                <p className="text-sm leading-6 text-[#697386]">
                  Đứng gần tủ, kiểm tra cửa không bị kẹt rồi nhấn thử lại.
                </p>
              </Card.Content>
            </Card>

            <div className="mt-auto space-y-3 pt-7">
              <Button
                fullWidth
                isPending={openingDoor}
                className="h-16 rounded-[1.4rem] bg-[#ff5b16] text-lg font-bold text-white shadow-[0_16px_34px_rgba(255,91,22,.25)]"
                size="lg"
                onPress={openPickupCompartment}
              >
                {openingDoor ? <><Spinner color="current" size="sm" /> Đang thử mở lại...</> : <><LockOpen className="size-6" /> Thử mở lại</>}
              </Button>
              <Button fullWidth className={SECONDARY_BUTTON_CLASS} size="lg" variant="outline" onPress={reset}>Về trang đầu</Button>
              {reportIncidentLink}
            </div>
          </div>
        );

      case "parcel":
        return (
          <div className="flex flex-1 flex-col">
            <div className="mb-5">
              <h1 className="text-[1.75rem] font-bold tracking-[-0.045em] text-[#172033]">Chụp ảnh kiện hàng</h1>
              <p className="mt-1 text-sm leading-6 text-muted">Chụp mặt có dán vận đơn. Hệ thống tự đọc số điện thoại người nhận giúp bạn.</p>
            </div>
            <ParcelPhotoGuide />
            <div className="mt-4 grid grid-cols-3 gap-2">
              {["Đủ sáng", "Rõ vận đơn", "Không bị che"].map((tip) => (
                <div className="flex items-center justify-center gap-1.5 rounded-xl bg-[#fff4eb] px-2 py-2 text-[11px] font-semibold text-[#8b3c0d]" key={tip}>
                  <Check className="size-3.5 text-[#f55a12]" /> {tip}
                </div>
              ))}
            </div>
            {apiError ? <div className="mt-4"><ApiErrorCard message={apiError} /></div> : null}
            <div className="mt-auto space-y-3 pt-5">
              <Button fullWidth className={PRIMARY_BUTTON_CLASS} size="lg" onPress={() => fileInput.current?.click()}>
                <Camera className="size-5" /> Chụp ảnh kiện hàng
              </Button>
              <Button fullWidth className={SECONDARY_BUTTON_CLASS} size="lg" variant="outline" onPress={() => galleryInput.current?.click()}>
                <FileArrowUp className="size-5" /> Chọn ảnh từ thư viện
              </Button>
            </div>
          </div>
        );

      case "recipient": {
        const digits = phoneDigits(phone);
        const canSend = recipientStatus === "found" && scanStatus === "ready" && !isSendingRequest;
        return (
          <div className="flex flex-1 flex-col">
            <div className="mb-4">
              <h1 className="text-[1.75rem] font-bold tracking-[-0.045em] text-[#172033]">Xác nhận người nhận</h1>
              <p className="mt-1 text-sm leading-6 text-muted">Đối chiếu tên hiển thị với vận đơn trên kiện hàng rồi gửi yêu cầu.</p>
            </div>

            <Card className="gap-0 rounded-[1.6rem] border border-[#f2e7df] bg-white p-0 shadow-[0_14px_38px_rgba(101,45,12,.08)]">
              <Card.Content className="flex-row items-center gap-4 p-3">
                <button
                  aria-label="Phóng to ảnh kiện hàng"
                  className="relative size-24 shrink-0 overflow-hidden rounded-2xl bg-[#fff2e8] ring-1 ring-[#f4dfd0]"
                  type="button"
                  onClick={() => setIsPhotoZoomed(true)}
                >
                  {imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img alt="Ảnh kiện hàng" className="size-full object-cover" src={imageUrl} />
                  ) : null}
                </button>
                <div className="min-w-0 flex-1">
                  {scanStatus === "scanning" ? (
                    <p className="flex items-center gap-2 text-sm font-semibold text-[#303747]"><Spinner color="current" size="sm" /> Đang đọc vận đơn...</p>
                  ) : scanStatus === "ready" ? (
                    <Chip color="success" size="sm" variant="soft"><Check className="size-3" /> Ảnh đã sẵn sàng</Chip>
                  ) : scanStatus === "error" ? (
                    <Chip color="danger" size="sm" variant="soft">Chưa tải được ảnh</Chip>
                  ) : null}
                  <p className="mt-1 text-xs text-muted">Chạm vào ảnh để phóng to</p>
                  <Button className="mt-1 h-8 px-0 text-[#f55a12]" size="sm" variant="ghost" onPress={() => fileInput.current?.click()}>
                    <Camera className="size-4" /> Chụp lại ảnh
                  </Button>
                </div>
              </Card.Content>
            </Card>

            {scanStatus === "error" && imageFile ? (
              <div className="mt-3 space-y-3">
                {apiError ? <ApiErrorCard message={apiError} /> : null}
                <Button fullWidth className={SECONDARY_BUTTON_CLASS} size="lg" variant="outline" onPress={() => void runScan(imageFile)}>
                  Thử tải lại ảnh
                </Button>
              </div>
            ) : null}

            <Card className="mt-4 rounded-[1.6rem] border border-[#f4ebe5] bg-white shadow-[0_14px_38px_rgba(101,45,12,.07)]">
              <Card.Content>
                <TextField className="w-full" type="tel" value={phone} variant="secondary" onChange={changePhone}>
                  <div className="mb-3 flex items-center gap-3">
                    <span className="flex size-9 items-center justify-center rounded-xl bg-[#fff0e5] text-[#f55a12]">
                      <Handset className="size-5" />
                    </span>
                    <Label className="font-semibold text-[#303747]">Số điện thoại người nhận</Label>
                  </div>
                  <Input
                    autoComplete="off"
                    className="h-14 rounded-xl text-lg font-semibold tracking-wide"
                    enterKeyHint="done"
                    inputMode="numeric"
                    maxLength={14}
                    placeholder="0901 234 567"
                  />
                </TextField>

                {ocrPhones.length > 1 ? (
                  <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Các số đọc được từ vận đơn">
                    {ocrPhones.map((candidate) => (
                      <Button
                        className={`h-9 rounded-full px-3 text-sm font-semibold ${phoneDigits(phone) === candidate ? "bg-[#ff5b16] text-white" : "border border-[#f1ded1] bg-white text-[#172033]"}`}
                        key={candidate}
                        size="sm"
                        variant="outline"
                        onPress={() => changePhone(candidate)}
                      >
                        {formatPhone(candidate)}
                      </Button>
                    ))}
                  </div>
                ) : null}

                <div aria-live="polite" className="mt-3 text-sm">
                  {scanStatus === "scanning" && digits.length === 0 ? (
                    <p className="text-muted">Đang đọc số điện thoại từ vận đơn, bạn có thể nhập tay ngay.</p>
                  ) : ocrNotice && recipientStatus === "idle" ? (
                    <p className={ocrNotice === "success" ? "text-[#20a555]" : "text-[#b45309]"}>{OCR_NOTICES[ocrNotice]}</p>
                  ) : null}
                  {recipientStatus === "idle" && digits.length > 0 && digits.length < 10 ? (
                    <p className="text-muted">Nhập đủ 10 số để hiện tên người nhận.</p>
                  ) : null}
                  {recipientStatus === "loading" ? (
                    <p className="flex items-center gap-2 text-muted"><Spinner color="current" size="sm" /> Đang tìm người nhận...</p>
                  ) : null}
                  {recipientStatus === "not-found" ? (
                    <p className="font-medium text-[#e5484d]">Số này chưa đăng ký nhận hàng tại tủ này. Kiểm tra lại số trên vận đơn.</p>
                  ) : null}
                  {recipientStatus === "cannot-receive" ? (
                    <p className="font-medium text-[#e5484d]">Cư dân này tạm thời không thể nhận thêm kiện hàng. Vui lòng liên hệ cư dân hoặc ban quản lý.</p>
                  ) : null}
                  {recipientStatus === "limit" ? (
                    <p className="font-medium text-[#e5484d]">Đã hết số lần tra cứu của phiên này. Vui lòng báo sự cố hoặc bắt đầu phiên gửi mới.</p>
                  ) : null}
                  {recipientStatus === "error" ? (
                    <p className="flex flex-wrap items-center gap-2 font-medium text-[#e5484d]">
                      {recipientMessage}
                      <Button className="h-8 px-2" size="sm" variant="ghost" onPress={() => setLookupTick((tick) => tick + 1)}>Thử lại</Button>
                    </p>
                  ) : null}
                </div>

                {recipientStatus === "found" ? (
                  <div className="mt-3 flex items-center gap-3 rounded-2xl bg-[#eaf9ef] p-4 ring-1 ring-[#c9efd6]">
                    <CircleCheckFill className="size-7 shrink-0 text-[#20a555]" />
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-[#2f7d4f]">Người nhận (đối chiếu với vận đơn)</p>
                      <p className="text-xl font-extrabold tracking-[-0.02em] text-[#172033] [overflow-wrap:anywhere]">{recipientName}</p>
                    </div>
                  </div>
                ) : null}
              </Card.Content>
            </Card>

            {scanStatus !== "error" && apiError ? <div className="mt-4"><ApiErrorCard message={apiError} /></div> : null}

            <div className="mt-auto pt-5">
              <Button
                fullWidth
                isDisabled={!canSend}
                isPending={isSendingRequest}
                className={PRIMARY_BUTTON_CLASS}
                size="lg"
                onPress={sendDeliveryRequest}
              >
                {isSendingRequest ? <><Spinner color="current" size="sm" /> Đang gửi yêu cầu...</> : "Gửi yêu cầu cho cư dân"}
              </Button>
              {scanStatus === "scanning" ? <p className="mt-2 text-center text-xs text-muted">Đang tải ảnh lên, nút gửi sẽ sáng khi xong.</p> : null}
            </div>
          </div>
        );
      }

      case "waiting":
        return (
          <div className="flex flex-1 flex-col">
            <ApprovalCountdown seconds={approvalSeconds} totalSeconds={approvalTotalSeconds} />

            <Card className="mx-auto mt-5 w-fit rounded-full border border-[#f8e1d2] bg-[#fff7f1] px-1 py-0 shadow-[0_10px_28px_rgba(103,44,10,.08)]">
              <Card.Content className="flex-row items-center gap-2.5 px-3 py-2.5">
                <span className="flex size-9 items-center justify-center rounded-full bg-[#ffe2d0] text-[#ff5b16]">
                  <Bell className="size-4.5" />
                </span>
                <p className="text-sm font-semibold text-[#303747]">Đã gửi yêu cầu đến cư dân</p>
              </Card.Content>
            </Card>

            <Card className="mt-5 rounded-[1.6rem] border border-[#f2e7df] bg-white p-0 shadow-[0_14px_38px_rgba(91,40,10,.09)]">
              <Card.Content className="p-3">
                <Link
                  aria-label={`Gọi người nhận theo số ${formatPhone(phone)}`}
                  className="group flex w-full items-center gap-3 no-underline"
                  href={`tel:${phoneDigits(phone)}`}
                >
                  <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-[#fff0e7] text-[#ff5b16]">
                    <Handset className="size-6" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs text-muted">Số điện thoại người nhận</span>
                    <span className="block text-sm font-semibold text-[#ff5b16]">{formatPhone(phone)}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-[#fff2e9] px-3 py-2 text-sm font-semibold text-[#f55a12] transition-colors group-hover:bg-[#ffe4d3]">
                    <Handset className="size-4" />
                    Gọi ngay
                    <ArrowChevronRight className="size-4" />
                  </span>
                </Link>
              </Card.Content>
            </Card>

            <div className="mt-auto pt-6">
              <Button fullWidth className={SECONDARY_BUTTON_CLASS} variant="outline" onPress={reset}>Về trang đầu</Button>
            </div>
          </div>
        );

      case "searching":
        return (
          <div className="flex flex-1 flex-col items-center justify-center text-center" aria-live="polite">
            <span className="relative flex size-24 items-center justify-center rounded-[1.8rem] bg-[#fff0e5] text-[#ff5b16] shadow-[0_16px_38px_rgba(255,91,22,.14)] ring-1 ring-[#ffd7bf]">
              <Box className="size-11" />
              <span className="absolute -bottom-2 -right-2 flex size-10 items-center justify-center rounded-full bg-white text-[#ff5b16] shadow-[0_8px_20px_rgba(91,40,10,.12)]">
                <Spinner color="current" size="sm" />
              </span>
            </span>
            <h1 className="mt-7 text-[1.9rem] font-extrabold tracking-[-0.05em] text-[#172033]">Đang tìm ngăn trống</h1>
            <p className="mt-2 max-w-xs text-sm leading-6 text-muted">Hệ thống đang kiểm tra các ngăn khả dụng tại Locker {lockerCode}.</p>
          </div>
        );

      case "compartment":
        return (
          <StatusScreen
            tone="success"
            icon={<LockOpen className="size-10" />}
            title="Ngăn đã mở"
            description="Đặt kiện hàng vào ngăn được chỉ định rồi đóng chặt cửa."
            details={
              <>
                <Card className={`gap-0 p-0 ${SURFACE_CARD_CLASS}`}>
                  <Card.Content className="p-6">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-muted">Ngăn tủ</p>
                        <p className="mt-1 text-[4.2rem] font-black leading-none tracking-[-0.08em] text-[#ff5b16]">{compartmentCode}</p>
                      </div>
                      <Chip className="shrink-0" color="success" size="sm" variant="soft">
                        <LockOpen className="size-3.5" /> Đang mở
                      </Chip>
                    </div>
                    <div className="mt-4 flex items-center gap-2 text-sm font-medium text-muted">
                      <MapPin className="size-5 shrink-0 text-[#ff5b16]" />
                      <span>Tủ Boxora · {lockerCode}</span>
                    </div>
                  </Card.Content>
                </Card>
                <HintCard icon={<Box className="size-5" />}>
                  <strong>Đặt kiện hàng vào ngăn {compartmentCode}</strong>, sau đó đóng cửa để hoàn tất.
                </HintCard>
              </>
            }
            actions={
              <Button fullWidth className={PRIMARY_BUTTON_CLASS} size="lg" onPress={() => setScreen("closing")}>
                <Check className="size-5" /> Đã đặt kiện hàng
              </Button>
            }
          />
        );

      case "closing":
        return (
          <div className="flex flex-1 flex-col">
            <div className="text-center">
              <h1 className="text-[1.9rem] font-extrabold tracking-[-0.05em] text-[#172033]">Hãy đóng cửa ngăn {compartmentCode}</h1>
              <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted">
                Lượt gửi chỉ hoàn tất khi cảm biến xác nhận cửa đã đóng.
              </p>
            </div>
            <div className="mt-6">
              <CountdownRing
                ariaLabel={(time) => `Còn ${time} để đóng cửa ngăn`}
                label="Thời gian còn lại để đóng cửa"
                pendingLabel="Đang đồng bộ thời hạn..."
                seconds={doorSeconds}
                size="md"
                totalSeconds={doorTotalSeconds}
              />
            </div>
            <div className="mt-6">
              <HintCard icon={<Lock className="size-5" />}>
                <strong>Cửa ngăn vẫn đang mở.</strong> Đẩy cửa đóng chặt trước khi rời đi.
              </HintCard>
            </div>
            {apiError ? <div className="pt-4"><ApiErrorCard message={apiError} /></div> : null}
            <div className="mt-auto pt-6">
              <Button fullWidth className={PRIMARY_BUTTON_CLASS} isPending={checkingDoor} size="lg" onPress={verifyDoor}>
                {checkingDoor ? <><Spinner color="current" size="sm" /> Đang kiểm tra cửa...</> : "Tôi đã đóng cửa"}
              </Button>
              <p className="mt-3 text-center text-xs leading-5 text-muted">Nút này chỉ yêu cầu hệ thống kiểm tra lại; trạng thái cảm biến cửa mới là xác nhận cuối cùng.</p>
              {reportIncidentLink}
            </div>
          </div>
        );

      case "success":
        return (
          <StatusScreen
            tone="success"
            icon={<CircleCheckFill className="size-11" />}
            title="Gửi hàng thành công"
            description={`Kiện hàng đã được lưu tại Locker ${lockerCode} và người nhận đã được thông báo.`}
            details={
              <>
                <InfoRows
                  rows={[["Locker", lockerCode], ["Ngăn", compartmentCode], ["Người nhận", formatPhone(phone)], ["Trạng thái", "Đã lưu an toàn"]]}
                  subtitle={parcelId || "Đã tạo kiện hàng"}
                  title="Biên nhận gửi hàng"
                />
                <HintCard icon={<Bell className="size-5" />}>Đã gửi thông báo cho người nhận.</HintCard>
              </>
            }
            actions={
              <>
                <Button fullWidth className={PRIMARY_BUTTON_CLASS} size="lg" onPress={reset}>Hoàn tất</Button>
                <Button fullWidth className={SECONDARY_BUTTON_CLASS} size="lg" variant="outline" onPress={() => { reset(); beginSend(); }}>Gửi kiện khác</Button>
              </>
            }
          />
        );

      case "not-found":
        return (
          <StatusScreen
            tone="danger"
            icon={<Xmark className="size-10" />}
            title="Không tìm thấy người nhận"
            description="Số điện thoại chưa thuộc cư dân đã đăng ký tại tủ này. Kiểm tra lại trước khi tiếp tục."
            actions={<Button fullWidth className={PRIMARY_BUTTON_CLASS} size="lg" onPress={() => setScreen("recipient")}>Kiểm tra lại số điện thoại</Button>}
          />
        );

      case "rejected":
        return (
          <StatusScreen
            tone="danger"
            icon={<Xmark className="size-10" />}
            title="Người nhận đã từ chối"
            description="Yêu cầu gửi hàng không được chấp nhận. Lượt gửi này đã kết thúc."
            actions={<Button fullWidth className={PRIMARY_BUTTON_CLASS} size="lg" onPress={reset}>Về trang đầu</Button>}
          />
        );

      case "expired":
        return (
          <StatusScreen
            tone="warning"
            icon={<Clock className="size-10" />}
            title="Yêu cầu đã hết hạn"
            description="Người nhận chưa phản hồi trong thời gian quy định. Lượt gửi đã được hủy."
            actions={<Button fullWidth className={PRIMARY_BUTTON_CLASS} size="lg" onPress={reset}>Về trang đầu</Button>}
          />
        );

      case "full":
        return (
          <StatusScreen
            tone="warning"
            icon={<Box className="size-10" />}
            title="Locker đã hết ngăn trống"
            description={`Hiện tại ${lockerCode} không còn ngăn khả dụng. Vui lòng thử lại sau.`}
            actions={<><Button fullWidth className={PRIMARY_BUTTON_CLASS} size="lg" onPress={reset}>Về trang đầu</Button>{reportIncidentLink}</>}
          />
        );

      case "door-timeout":
        return (
          <StatusScreen
            tone="danger"
            icon={<TriangleExclamation className="size-10" />}
            title="Lượt gửi chưa hoàn tất"
            description={`Cửa ngăn chưa được đóng trong thời gian cho phép hoặc tủ gặp sự cố. Cảnh báo vận hành đã được tạo cho Locker ${lockerCode}.`}
            actions={<><Button fullWidth className={PRIMARY_BUTTON_CLASS} size="lg" onPress={reset}>Về trang đầu</Button>{reportIncidentLink}</>}
          />
        );

      case "invalid-locker":
        return (
          <StatusScreen
            tone="danger"
            icon={<TriangleExclamation className="size-10" />}
            title="Link tủ không hợp lệ"
            description="Không xác định được tủ từ đường dẫn này. Hãy quét lại mã QR dán trên tủ Boxora để bắt đầu."
            actions={<Button fullWidth className={SECONDARY_BUTTON_CLASS} size="lg" variant="outline" onPress={() => window.location.reload()}>Tải lại trang</Button>}
          />
        );

      case "incident":
        return (
          <Form className="flex flex-1 flex-col" onSubmit={(event) => { event.preventDefault(); void submitIncident(); }}>
            <div className="mb-5">
              <h1 className="text-[1.75rem] font-bold tracking-[-0.045em] text-[#172033]">Báo sự cố tại tủ</h1>
              <p className="mt-1 text-sm leading-6 text-muted">Bộ phận vận hành của Locker {lockerCode} sẽ nhận và xử lý báo cáo này.</p>
            </div>

            <Card className={`gap-0 p-0 ${SURFACE_CARD_CLASS}`}>
              <Card.Content className="p-4">
                <RadioGroup
                  aria-label="Loại sự cố"
                  className="gap-2"
                  value={incidentType}
                  onChange={(value) => { setIncidentType(value as GuestIncidentType); setIncidentError(""); }}
                >
                  <Label className="mb-1 font-semibold text-[#303747]">Loại sự cố</Label>
                  {INCIDENT_TYPES.map((item) => (
                    <Radio
                      className="w-full rounded-2xl border border-[#f1e6de] px-3 py-3 has-[[data-selected=true]]:border-[#ff5b16] has-[[data-selected=true]]:bg-[#fff5ed]"
                      key={item.value}
                      value={item.value}
                    >
                      <Radio.Content>
                        <Radio.Control>
                          <Radio.Indicator />
                        </Radio.Control>
                        <Label className="font-semibold text-[#172033]">{item.label}</Label>
                      </Radio.Content>
                      <Description className="text-xs">{item.hint}</Description>
                    </Radio>
                  ))}
                </RadioGroup>
              </Card.Content>
            </Card>

            <Card className={`mt-4 gap-0 p-0 ${SURFACE_CARD_CLASS}`}>
              <Card.Content className="p-4">
                <TextField
                  className="w-full"
                  isInvalid={Boolean(incidentError) && incidentDescription.trim().length < INCIDENT_DESCRIPTION_MIN}
                  value={incidentDescription}
                  onChange={(value) => { setIncidentDescription(value.slice(0, INCIDENT_DESCRIPTION_MAX)); setIncidentError(""); }}
                >
                  <Label className="font-semibold text-[#303747]">Mô tả sự cố</Label>
                  <TextArea className="mt-2 min-h-28 rounded-xl" placeholder="Ví dụ: Ngăn A03 không mở sau khi bấm mở, cửa vẫn khóa." rows={4} />
                  <Description className="mt-1 text-xs">{incidentDescription.trim().length}/{INCIDENT_DESCRIPTION_MAX} ký tự</Description>
                </TextField>
              </Card.Content>
            </Card>

            {incidentError ? <div className="pt-4"><ApiErrorCard message={incidentError} /></div> : null}

            <div className="mt-auto space-y-3 pt-6">
              <Button fullWidth className={PRIMARY_BUTTON_CLASS} isPending={isSubmittingIncident} size="lg" type="submit">
                {isSubmittingIncident ? <><Spinner color="current" size="sm" /> Đang gửi báo cáo...</> : "Gửi báo cáo sự cố"}
              </Button>
              <Button fullWidth className={SECONDARY_BUTTON_CLASS} size="lg" variant="outline" onPress={() => setScreen(incidentOrigin)}>Quay lại</Button>
            </div>
          </Form>
        );

      case "incident-success":
        return (
          <StatusScreen
            tone="success"
            icon={<CircleCheckFill className="size-11" />}
            title="Đã gửi báo cáo sự cố"
            description="Bộ phận vận hành đã nhận báo cáo. Dùng mã tham chiếu dưới đây khi cần liên hệ theo dõi."
            details={<InfoRows rows={[["Mã tham chiếu", incidentReference], ["Locker", lockerCode]]} />}
            actions={<Button fullWidth className={PRIMARY_BUTTON_CLASS} size="lg" onPress={reset}>Về trang đầu</Button>}
          />
        );

      case "locker-unavailable":
        return (
          <StatusScreen
            tone="warning"
            icon={<Lock className="size-10" />}
            title="Tủ tạm ngưng phục vụ"
            description={`Locker ${lockerCode} hiện không nhận gửi hàng. Vui lòng thử lại sau hoặc dùng tủ khác.`}
            actions={<Button fullWidth className={PRIMARY_BUTTON_CLASS} size="lg" onPress={reset}>Về trang đầu</Button>}
          />
        );
    }
  })();

  const photoInputs = (
    <>
      <input ref={fileInput} hidden accept="image/*" capture="environment" type="file" onChange={choosePhoto} />
      <input ref={galleryInput} hidden accept="image/*" type="file" onChange={choosePhoto} />
    </>
  );

  if (screen === "welcome") {
    return (
      <>
        <WelcomeScreen
          onReceive={() => setScreen("receive-otp")}
          onReport={openIncidentReport}
          onSend={beginSend}
        />
        {photoInputs}
      </>
    );
  }

  return (
    <div className="min-h-dvh bg-surface-secondary sm:py-8">
      <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col bg-background sm:min-h-[calc(100dvh-4rem)] sm:overflow-hidden sm:rounded-3xl sm:border sm:border-border sm:shadow-sm">
        <AppHeader isBackDisabled={openingDoor || ["receive-opened", "waiting", "searching", "compartment", "closing", "invalid-locker"].includes(screen)} lockerCode={lockerCode} goBack={goBack} />
        <main className={`safe-bottom flex flex-1 flex-col px-5 pb-6 sm:px-7 ${screen === "receive-otp" ? "bg-[#fffaf6] pt-0" : ["receive-details", "receive-open-failed", "receive-opened", "receive-success"].includes(screen) ? "bg-[#fffaf6] pt-5" : screen === "recipient" ? "pt-4" : "pt-7"}`}>
          {content}
        </main>
      </div>
      {photoInputs}
      {isPhotoZoomed && imageUrl ? (
        <div
          aria-label="Ảnh kiện hàng phóng to"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-3"
          role="dialog"
          onClick={() => setIsPhotoZoomed(false)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img alt="Ảnh kiện hàng phóng to" className="max-h-full max-w-full object-contain" src={imageUrl} />
          <Button isIconOnly aria-label="Đóng ảnh" className="absolute right-3 top-3 size-11 bg-white/90 text-[#172033]" onPress={() => setIsPhotoZoomed(false)}>
            <Xmark className="size-6" />
          </Button>
        </div>
      ) : null}
    </div>
  );
}
