"use client";

import {
  Avatar,
  Button,
  Card,
  Chip,
  FieldError,
  Form,
  Input,
  InputOTP,
  Label,
  Link,
  REGEXP_ONLY_DIGITS_AND_CHARS,
  Spinner,
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
  Person,
  Receipt,
  TriangleExclamation,
  Xmark,
} from "@gravity-ui/icons";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, PointerEvent as ReactPointerEvent, ReactNode } from "react";
import {
  DeliveryApiError,
  getDeliveryStatus,
  initiateDelivery,
  openReturnPickup,
  reserveCompartment,
  submitDelivery,
  uploadParcelFile,
  validateReturnPickup,
} from "./delivery-api";
import type { DeliverySession, ReturnPickupSession } from "./delivery-api";

type Screen =
  | "welcome"
  | "home"
  | "receive-otp"
  | "receive-details"
  | "receive-open-failed"
  | "receive-opened"
  | "recipient"
  | "parcel"
  | "confirm"
  | "waiting"
  | "searching"
  | "compartment"
  | "closing"
  | "success"
  | "not-found"
  | "rejected"
  | "expired"
  | "full"
  | "door-timeout";

const APPROVAL_DURATION_SECONDS = 10 * 60;

const formatTime = (seconds: number) =>
  `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;

const normalizePickupCode = (value: string) =>
  value.replace(/\D/g, "").slice(0, 6);

function ApprovalCountdown({ seconds }: { seconds: number }) {
  const radius = 112;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.max(0, Math.min(1, seconds / APPROVAL_DURATION_SECONDS));

  return (
    <div
      aria-label={`Còn ${formatTime(seconds)} để cư dân phê duyệt`}
      className="relative mx-auto aspect-square w-full max-w-[17rem]"
      role="timer"
    >
      <svg aria-hidden="true" className="absolute inset-0 size-full -rotate-90 drop-shadow-[0_14px_28px_rgba(255,91,22,.12)]" viewBox="0 0 260 260">
        <defs>
          <linearGradient id="approval-ring" x1="0" x2="1" y1="0" y2="1">
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
          stroke="url(#approval-ring)"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - progress)}
          strokeLinecap="round"
          strokeWidth="14"
          className="transition-[stroke-dashoffset] duration-1000 ease-linear"
        />
      </svg>
      <div className="absolute inset-[2.25rem] flex flex-col items-center justify-center rounded-full bg-[radial-gradient(circle_at_50%_30%,#fff_0%,#fff9f5_58%,#fff1e9_100%)] text-center shadow-[inset_0_0_0_1px_rgba(255,120,42,.08)]">
        <Clock className="mb-2 size-8 text-[#ff5b16]" />
        <span className="font-mono text-[2.7rem] leading-none font-bold tracking-[-0.06em] text-[#172033] tabular-nums">
          {formatTime(seconds)}
        </span>
        <span className="mt-2 text-xs font-medium text-muted">Đang chờ cư dân phê duyệt</span>
      </div>
    </div>
  );
}

const phoneDigits = (value: string) => value.replace(/\D/g, "");

const formatPhone = (value: string) => {
  const digits = phoneDigits(value).slice(0, 11);
  return [digits.slice(0, 4), digits.slice(4, 7), digits.slice(7, 10), digits.slice(10)]
    .filter(Boolean)
    .join(" ");
};

async function cropImageToSquare(file: File) {
  const image = await createImageBitmap(file, { imageOrientation: "from-image" });
  const cropSize = Math.min(image.width, image.height);
  const outputSize = Math.min(cropSize, 1080);
  const canvas = document.createElement("canvas");
  canvas.width = outputSize;
  canvas.height = outputSize;

  const context = canvas.getContext("2d");
  if (!context) {
    image.close();
    throw new Error("Không thể xử lý ảnh kiện hàng.");
  }

  context.drawImage(
    image,
    (image.width - cropSize) / 2,
    (image.height - cropSize) / 2,
    cropSize,
    cropSize,
    0,
    0,
    outputSize,
    outputSize,
  );
  image.close();

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) => result ? resolve(result) : reject(new Error("Không thể xử lý ảnh kiện hàng.")),
      "image/jpeg",
      0.9,
    );
  });
  const filename = file.name.replace(/\.[^.]+$/, "") || "kien-hang";
  return new File([blob], `${filename}-square.jpg`, { type: "image/jpeg", lastModified: Date.now() });
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
          <p className="flex items-center gap-2 truncate text-sm font-medium text-[#697386]">
            <span className="truncate">Tủ {lockerCode} · Nguyễn Huệ</span>
            <span aria-label="Đang hoạt động" className="size-2.5 shrink-0 rounded-full bg-[#21c75b] shadow-[0_0_0_3px_rgba(33,199,91,.1)]" role="img" />
          </p>
        </div>
      </div>
    </header>
  );
}

function PageIntro({ icon, title, description }: { icon: ReactNode; title: string; description: string }) {
  return (
    <div className="mb-6">
      <div className="mb-3 flex size-11 items-center justify-center rounded-xl bg-accent-soft text-accent-soft-foreground">
        {icon}
      </div>
      <h1 className="text-2xl font-semibold tracking-tight text-pretty">{title}</h1>
      <p className="mt-2 text-sm leading-6 text-muted text-pretty">{description}</p>
    </div>
  );
}

function LockerCard({ lockerCode }: { lockerCode: string }) {
  return (
    <Card className="gap-0 overflow-hidden rounded-[1.6rem] border border-[#f1e9e3] bg-white p-0 shadow-[0_16px_45px_rgba(72,35,14,.08)]">
      <Card.Header className="flex-row items-center gap-3 px-4 py-4">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-[#fff2e9] text-[#f55a12]">
          <Box className="size-6" />
        </div>
        <div className="min-w-0 flex-1">
          <Card.Title className="truncate text-[15px] font-bold text-[#172033]">Tủ Boxora Nguyễn Huệ</Card.Title>
          <Card.Description className="text-xs">Mã tủ: {lockerCode}</Card.Description>
        </div>
        <Chip className="shrink-0" color="success" size="sm" variant="soft">
          <span aria-hidden="true" className="size-1.5 rounded-full bg-current" /> Online
        </Chip>
      </Card.Header>
      <Card.Content className="px-4 pb-1 pt-0">
        <div className="flex items-center gap-3 border-t border-[#eee7e1] py-3 text-[12px] font-medium text-[#303747]">
          <MapPin className="size-5 shrink-0 text-[#f55a12]" />
          <span>12 Nguyễn Huệ, Phường Bến Nghé, Quận 1, TP.HCM</span>
        </div>
        <div className="flex items-center gap-3 border-t border-[#eee7e1] py-3 text-[12px] font-medium text-[#303747]">
          <Clock className="size-5 shrink-0 text-[#f55a12]" />
          <span>24/7</span>
        </div>
      </Card.Content>
    </Card>
  );
}

const SEND_SLIDES = [
  { image: "/carousel/send-fast.png", title: "Gửi hàng nhanh chóng tại Boxora" },
  { image: "/carousel/send-simple.png", title: "Thao tác đơn giản, bỏ hàng trong tích tắc" },
  { image: "/carousel/send-convenient.png", title: "Tiện lợi hơn cho mọi lần giao nhận" },
] as const;

function SendCarousel() {
  const [active, setActive] = useState(0);
  const dragStartX = useRef<number | null>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => setActive((index) => (index + 1) % SEND_SLIDES.length), 5000);
    return () => window.clearInterval(timer);
  }, [active]);

  const finishSwipe = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragStartX.current === null) return;
    const distance = event.clientX - dragStartX.current;
    dragStartX.current = null;
    if (Math.abs(distance) < 40) return;
    setActive((index) => (index + (distance < 0 ? 1 : SEND_SLIDES.length - 1)) % SEND_SLIDES.length);
  };

  return (
    <section aria-label="Giới thiệu dịch vụ gửi hàng" aria-roledescription="carousel">
      <div
        className="relative aspect-[1.9/1] touch-pan-y overflow-hidden rounded-[1.45rem] bg-[#fff1e6] shadow-[0_12px_35px_rgba(115,49,8,.09)]"
        onPointerCancel={() => { dragStartX.current = null; }}
        onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); dragStartX.current = event.clientX; }}
        onPointerUp={finishSwipe}
      >
        {SEND_SLIDES.map((slide, index) => (
          <div
            aria-hidden={index !== active}
            className={`absolute inset-0 transition-opacity duration-500 ${index === active ? "opacity-100" : "pointer-events-none opacity-0"}`}
            key={slide.image}
          >
            <Image
              alt={index === active ? slide.title : ""}
              className="pointer-events-none object-cover select-none"
              fill
              priority={index === 0}
              sizes="(max-width: 640px) calc(100vw - 40px), 456px"
              src={slide.image}
            />
            <div aria-hidden="true" className="absolute inset-y-0 left-0 w-[55%] bg-linear-to-r from-[#fff8f1]/96 via-[#fff7ef]/75 to-transparent" />
            <p className="absolute left-6 top-1/2 z-10 w-[40%] -translate-y-1/2 text-[clamp(.95rem,4vw,1.15rem)] leading-[1.25] font-bold tracking-[-0.035em] text-[#172033]">
              {slide.title}
            </p>
          </div>
        ))}
        <div className="absolute bottom-4 left-6 z-20 flex gap-1.5">
          {SEND_SLIDES.map((slide, index) => (
            <button
              aria-label={`Chuyển đến slide ${index + 1}: ${slide.title}`}
              aria-pressed={index === active}
              className={`h-1.5 rounded-full transition-all ${index === active ? "w-7 bg-[#ff5b16]" : "w-1.5 bg-[#f7bc94]"}`}
              key={slide.image}
              type="button"
              onClick={() => setActive(index)}
            />
          ))}
        </div>
      </div>
      <span aria-live="polite" className="sr-only">{SEND_SLIDES[active].title}</span>
    </section>
  );
}

function WelcomeScreen({
  onSend,
  onReceive,
}: {
  onSend: () => void;
  onReceive: () => void;
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
      </div>
    </main>
  );
}

function RecipientCard({ phone }: { phone: string }) {
  return (
    <Card className="rounded-[1.6rem] border border-[#f4dfd0] bg-white shadow-[0_14px_38px_rgba(101,45,12,.09)]">
      <Card.Content className="flex-row items-center gap-4">
        <Avatar className="size-14" size="lg" color="accent" variant="soft">
          <Avatar.Fallback className="bg-[#fff0e5] font-bold text-[#f55a12]">NH</Avatar.Fallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-bold text-[#172033]">Nguyễn Thị Hằng</p>
          <p className="text-sm text-muted">{formatPhone(phone)}</p>
        </div>
        <Chip color="success" size="sm" variant="soft">
          <Check className="size-3" /> Đã tìm thấy
        </Chip>
      </Card.Content>
    </Card>
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

function ParcelPreview({ imageUrl }: { imageUrl: string | null }) {
  return (
    <Card className="overflow-hidden rounded-[1.7rem] border border-[#f2e4da] bg-white p-0 shadow-[0_16px_42px_rgba(85,38,9,.1)]">
      <Card.Content className="p-0">
        <div className="relative flex aspect-square items-center justify-center overflow-hidden bg-[#fff6ed]">
          {imageUrl?.startsWith("blob:") ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img alt="Ảnh kiện hàng đã chọn" className="h-full w-full object-cover" src={imageUrl} />
          ) : (
            <Image alt="Ảnh kiện hàng đã chọn" className="object-cover" fill src={imageUrl ?? "/illustrations/parcel-photo-guide.png"} />
          )}
          <div aria-hidden="true" className="absolute inset-0 ring-1 ring-inset ring-black/5" />
          <Chip className="absolute right-3 top-3 shadow-sm" color="success" size="sm" variant="primary">
            <Check className="size-3" /> Đã sẵn sàng
          </Chip>
        </div>
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
        Đặt toàn bộ kiện hàng trong khung
      </div>
    </div>
  );
}

function StatusScreen({
  tone,
  icon,
  title,
  description,
  children,
}: {
  tone: "danger" | "warning" | "success";
  icon: ReactNode;
  title: string;
  description: string;
  children: ReactNode;
}) {
  const toneClass = {
    danger: "bg-danger-soft text-danger-soft-foreground",
    warning: "bg-warning-soft text-warning-soft-foreground",
    success: "bg-success-soft text-success-soft-foreground",
  }[tone];

  return (
    <div className="flex flex-1 flex-col justify-center py-6 text-center">
      <div className={`mx-auto mb-5 flex size-20 items-center justify-center rounded-full ${toneClass}`}>
        {icon}
      </div>
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="mx-auto mt-2 max-w-xs text-sm leading-6 text-muted">{description}</p>
      <div className="mt-7 space-y-3 text-left">{children}</div>
    </div>
  );
}

export function DeliveryFlow() {
  const [screen, setScreen] = useState<Screen>("welcome");
  const [lockerCode, setLockerCode] = useState("LK-01");
  const [phone, setPhone] = useState("");
  const [found, setFound] = useState(false);
  const [phoneError, setPhoneError] = useState("");
  const [apiError, setApiError] = useState("");
  const [deliverySession, setDeliverySession] = useState<DeliverySession | null>(null);
  const [compartmentCode, setCompartmentCode] = useState("");
  const [parcelId, setParcelId] = useState("");
  const [approvalDeadline, setApprovalDeadline] = useState<number | null>(null);
  const [approvalSeconds, setApprovalSeconds] = useState(APPROVAL_DURATION_SECONDS);
  const [isStartingDelivery, setIsStartingDelivery] = useState(false);
  const [isSearchingRecipient, setIsSearchingRecipient] = useState(false);
  const [isSendingRequest, setIsSendingRequest] = useState(false);
  const [otp, setOtp] = useState("");
  const [otpError, setOtpError] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [doorSeconds, setDoorSeconds] = useState(298);
  const [checkingDoor, setCheckingDoor] = useState(false);
  const [openingDoor, setOpeningDoor] = useState(false);
  const [pickupSession, setPickupSession] = useState<ReturnPickupSession | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const preview = searchParams.get("preview") as Screen | null;
    const previewPhone = searchParams.get("phone");
    const scannedLockerCode = searchParams.get("locker")?.trim();
    const available: Screen[] = ["welcome", "home", "receive-otp", "receive-details", "receive-open-failed", "receive-opened", "recipient", "parcel", "confirm", "waiting", "searching", "compartment", "closing", "success", "not-found", "rejected", "expired", "full", "door-timeout"];
    const timer = window.setTimeout(() => {
      if (scannedLockerCode) setLockerCode(scannedLockerCode);
      if (previewPhone) setPhone(formatPhone(previewPhone));
      if (preview === "waiting") {
        setApprovalDeadline(Date.now() + APPROVAL_DURATION_SECONDS * 1000);
        setApprovalSeconds(APPROVAL_DURATION_SECONDS);
      }
      if (preview && available.includes(preview)) setScreen(preview);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (screen !== "closing" || doorSeconds <= 0) return;
    const timer = window.setInterval(() => setDoorSeconds((time) => time - 1), 1000);
    return () => window.clearInterval(timer);
  }, [screen, doorSeconds]);

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
          setApprovalDeadline(deadline);
          setApprovalSeconds(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
        }
        if (status.status === "Approved") {
          const reservation = await reserveCompartment(deliverySession.id, deliverySession.guestSessionToken);
          if (cancelled) return;
          setCompartmentCode(reservation.compartmentCode);
          setScreen("compartment");
          return;
        }
        if (status.status === "Allocated" && status.compartmentCode) {
          setCompartmentCode(status.compartmentCode);
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
      const remaining = Math.max(0, Math.ceil((approvalDeadline - Date.now()) / 1000));
      setApprovalSeconds(remaining);
      if (remaining === 0) setScreen("expired");
    };

    updateCountdown();
    const timer = window.setInterval(updateCountdown, 250);
    return () => window.clearInterval(timer);
  }, [approvalDeadline, screen]);

  useEffect(() => {
    if (!imageUrl?.startsWith("blob:")) return;
    return () => URL.revokeObjectURL(imageUrl);
  }, [imageUrl]);

  const reset = () => {
    setScreen("welcome");
    setPhone("");
    setFound(false);
    setPhoneError("");
    setApiError("");
    setDeliverySession(null);
    setCompartmentCode("");
    setParcelId("");
    setApprovalDeadline(null);
    setApprovalSeconds(APPROVAL_DURATION_SECONDS);
    setIsStartingDelivery(false);
    setIsSearchingRecipient(false);
    setIsSendingRequest(false);
    setOtp("");
    setOtpError("");
    setImageUrl(null);
    setImageFile(null);
    setDoorSeconds(298);
    setCheckingDoor(false);
    setOpeningDoor(false);
    setPickupSession(null);
  };

  const verifyPickupCode = async () => {
    setOtpError("");
    try {
      const session = await validateReturnPickup(lockerCode, otp);
      setPickupSession(session);
      setScreen("receive-details");
    } catch (error) {
      setOtpError(error instanceof Error ? error.message : "Mã lấy hàng không hợp lệ.");
    }
  };

  const openPickupCompartment = async () => {
    if (!pickupSession) return;
    setOpeningDoor(true);
    try {
      setPickupSession(await openReturnPickup(pickupSession));
      setScreen("receive-opened");
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Không thể mở ngăn tủ.");
      setScreen("receive-open-failed");
    } finally { setOpeningDoor(false); }
  };

  const completePickup = () => {
    if (!pickupSession) return;
    reset();
  };

  const searchRecipient = () => {
    const normalized = phoneDigits(phone);
    if (!/^0\d{9}$/.test(normalized)) {
      setPhoneError("Nhập số điện thoại Việt Nam gồm 10 chữ số.");
      setFound(false);
      return;
    }

    setPhone(formatPhone(normalized));
    setPhoneError("");
    setIsSearchingRecipient(true);
    window.setTimeout(() => {
      setFound(true);
      setIsSearchingRecipient(false);
    }, 800);
  };

  const choosePhoto = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const squareImage = await cropImageToSquare(file);
      setImageFile(squareImage);
      setImageUrl(URL.createObjectURL(squareImage));
      setApiError("");
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Không thể xử lý ảnh kiện hàng.");
    } finally {
      event.target.value = "";
    }
  };

  const startDelivery = async () => {
    if (deliverySession) {
      setScreen("recipient");
      return;
    }

    setApiError("");
    setIsStartingDelivery(true);
    try {
      const session = await initiateDelivery(lockerCode);
      setDeliverySession(session);
      setScreen("recipient");
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Không thể khởi tạo phiên gửi hàng.");
    } finally {
      setIsStartingDelivery(false);
    }
  };

  const sendDeliveryRequest = async () => {
    if (!deliverySession || !imageFile) {
      setApiError("Phiên gửi hàng hoặc ảnh kiện hàng chưa sẵn sàng.");
      return;
    }

    setApiError("");
    setIsSendingRequest(true);
    try {
      const parcelImageUrl = await uploadParcelFile(imageFile);
      await submitDelivery(
        deliverySession.id,
        deliverySession.guestSessionToken,
        parcelImageUrl,
        phoneDigits(phone),
      );
      setApprovalDeadline(Date.now() + APPROVAL_DURATION_SECONDS * 1000);
      setApprovalSeconds(APPROVAL_DURATION_SECONDS);
      setScreen("waiting");
    } catch (error) {
      if (error instanceof DeliveryApiError && error.status === 404) {
        setScreen("not-found");
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
      home: "welcome",
      "receive-otp": "welcome",
      "receive-details": "receive-otp",
      "receive-open-failed": "receive-details",
      "receive-opened": "receive-details",
      recipient: "home",
      "not-found": "recipient",
      parcel: "recipient",
      confirm: "parcel",
      waiting: "confirm",
      searching: "confirm",
      compartment: "searching",
      closing: "compartment",
      rejected: "home",
      expired: "home",
      full: "home",
      "door-timeout": "home",
      success: "home",
    };
    setScreen(previous[screen] ?? "home");
  };

  const content = (() => {
    switch (screen) {
      case "welcome":
        return null;

      case "home":
        return (
          <div className="flex flex-1 flex-col">
            <div className="mb-5">
              <h1 className="text-[1.75rem] font-bold tracking-[-0.045em] text-[#172033]">Gửi hàng tại locker</h1>
              <p className="mt-1 text-sm text-muted">Xác nhận thông tin điểm gửi và tiếp tục.</p>
            </div>
            <SendCarousel />
            <div className="mt-4"><LockerCard lockerCode={lockerCode} /></div>
            <div className="mt-4">
              <Button
                fullWidth
                isPending={isStartingDelivery}
                className="h-14 justify-between rounded-2xl bg-[#ff5b16] px-5 text-base font-semibold text-white shadow-[0_12px_28px_rgba(255,91,22,.24)]"
                size="lg"
                onPress={startDelivery}
              >
                {({ isPending }) => (
                  <>
                    <span className="size-5" />
                    <span className="flex items-center gap-2">
                      {isPending ? <Spinner color="current" size="sm" /> : null}
                      {isPending ? "Đang kết nối..." : "Tiếp tục gửi hàng"}
                    </span>
                    <ArrowChevronRight className={`size-5 ${isPending ? "invisible" : ""}`} />
                  </>
                )}
              </Button>
              {apiError ? <div className="mt-3"><ApiErrorCard message={apiError} /></div> : null}
              <Button isDisabled fullWidth className="mt-2 opacity-100" size="sm" variant="ghost">
                <span className="font-semibold text-[#f55a12]">Chọn locker khác</span>
                <ArrowChevronRight className="size-4 text-[#f55a12]" />
              </Button>
              <p className="mt-2 text-center text-xs text-muted">Không cần tài khoản · Chỉ mất khoảng 2 phút</p>
            </div>
          </div>
        );

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
                  inputMode="text"
                  isInvalid={Boolean(otpError)}
                  maxLength={6}
                  name="pickup-code"
                  pasteTransformer={normalizePickupCode}
                  pattern={REGEXP_ONLY_DIGITS_AND_CHARS}
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
                className="h-16 justify-between rounded-[1.4rem] bg-[#ff5b16] px-6 text-lg font-bold text-white shadow-[0_16px_34px_rgba(255,91,22,.25)]"
                size="lg"
                type="submit"
              >
                <span className="size-5" />
                Tiếp tục
                <ArrowChevronRight className="size-6" />
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
                {pickupSession ? <img alt="Ảnh kiện hàng cư dân gửi" className="size-full object-cover object-center" src={pickupSession.imageUrl} /> : null}
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
                  <Avatar className="size-16" color="accent" size="lg" variant="soft">
                    <Avatar.Fallback className="bg-[#fff0e5] text-lg font-bold text-[#ff5b16]">NH</Avatar.Fallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="text-sm text-[#697386]">Kiện hàng gửi qua tủ</p>
                    <p className="truncate text-lg font-bold text-[#171717]">Ảnh đã được cư dân xác nhận</p>
                    <p className="text-base text-[#697386]">Chỉ mở đúng ngăn được hệ thống chỉ định</p>
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
                  {pickupSession ? <img alt="Ảnh kiện hàng cần lấy" className="size-full object-cover object-center" src={pickupSession.imageUrl} /> : null}
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

            <div className="mt-auto pt-6">
              <Button
                fullWidth
                className="h-16 rounded-[1.4rem] bg-[#ff5b16] text-lg font-bold text-white shadow-[0_16px_34px_rgba(255,91,22,.25)]"
                size="lg"
                isPending={openingDoor}
                onPress={completePickup}
              >
                 <Check className="size-6" /> Tôi đã lấy hàng và đóng cửa
              </Button>
            </div>
          </div>
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
              <Button fullWidth size="lg" variant="ghost" onPress={reset}>Về trang đầu</Button>
            </div>
          </div>
        );

      case "recipient":
        return (
          <div className="relative flex flex-1 flex-col">
            <div className="relative mx-auto aspect-[3/2] w-full max-w-md overflow-hidden rounded-[2rem] bg-[#fff7ef]">
              <Image
                alt="Nhân viên giao hàng nhập thông tin người nhận"
                className="object-cover"
                fill
                priority
                sizes="(max-width: 640px) calc(100vw - 40px), 456px"
                src="/illustrations/recipient-phone-entry.png"
              />
            </div>

            <div className="mt-4 text-center">
              <h1 className="text-[1.8rem] font-bold tracking-[-0.05em] text-[#172033]">
                {found ? "Đã tìm thấy người nhận" : "Nhập người nhận"}
              </h1>
              <p className="mt-1 text-sm text-muted">
                {found ? "Kiểm tra đúng thông tin trước khi tiếp tục." : "Nhập số điện thoại người nhận để tiếp tục."}
              </p>
            </div>

            {!found ? (
              <Form className="mt-5 flex flex-col gap-4" onSubmit={(event) => { event.preventDefault(); searchRecipient(); }}>
                <Card className="rounded-[1.6rem] border border-[#f4ebe5] bg-white shadow-[0_14px_38px_rgba(101,45,12,.07)]">
                  <Card.Content>
                    <TextField
                      className="w-full"
                      isInvalid={Boolean(phoneError)}
                      type="tel"
                      value={phone}
                      variant="secondary"
                      onChange={(value) => {
                        const digits = phoneDigits(value);
                        setPhone(formatPhone(digits));
                        setPhoneError(
                          digits.length > 10
                            ? "Số điện thoại không được quá 10 chữ số."
                            : digits.length === 10 && !digits.startsWith("0")
                              ? "Số điện thoại phải bắt đầu bằng số 0."
                              : "",
                        );
                      }}
                    >
                      <div className="mb-3 flex items-center gap-3">
                        <span className="flex size-9 items-center justify-center rounded-xl bg-[#fff0e5] text-[#f55a12]">
                          <Handset className="size-5" />
                        </span>
                        <Label className="font-semibold text-[#303747]">Số điện thoại người nhận</Label>
                      </div>
                      <Input className="h-12 rounded-xl" inputMode="numeric" maxLength={14} placeholder="0901 234 567" />
                      <FieldError>{phoneError}</FieldError>
                    </TextField>
                  </Card.Content>
                </Card>
                <Button
                  fullWidth
                  isDisabled={phoneDigits(phone).length !== 10 || Boolean(phoneError)}
                  isPending={isSearchingRecipient}
                  className="h-14 justify-between rounded-2xl bg-[#ff5b16] px-5 text-base font-semibold text-white shadow-[0_12px_28px_rgba(255,91,22,.24)]"
                  size="lg"
                  type="submit"
                >
                  {({ isPending }) => (
                    <>
                      <span className="size-5" />
                      <span className="flex items-center gap-2">
                        {isPending ? <Spinner color="current" size="sm" /> : null}
                        {isPending ? "Đang tìm người nhận..." : "Tiếp tục"}
                      </span>
                      <ArrowChevronRight className={`size-5 ${isPending ? "invisible" : ""}`} />
                    </>
                  )}
                </Button>
              </Form>
            ) : (
              <div className="mt-5 space-y-3">
                <RecipientCard phone={phone} />
                <Button
                  fullWidth
                  className="h-14 justify-between rounded-2xl bg-[#ff5b16] px-5 text-base font-semibold text-white shadow-[0_12px_28px_rgba(255,91,22,.24)]"
                  size="lg"
                  onPress={() => setScreen("parcel")}
                >
                  <span className="size-5" />
                  Tiếp tục chụp kiện hàng
                  <ArrowChevronRight className="size-5" />
                </Button>
                <Button fullWidth size="sm" variant="ghost" onPress={() => setFound(false)}>
                  <span className="font-semibold text-[#f55a12]">Nhập số điện thoại khác</span>
                </Button>
              </div>
            )}
          </div>
        );

      case "parcel":
        return (
          <div className="flex flex-1 flex-col">
            <div className="mb-5">
              <h1 className="text-[1.75rem] font-bold tracking-[-0.045em] text-[#172033]">Chụp ảnh kiện hàng</h1>
              <p className="mt-1 text-sm leading-6 text-muted">Giữ kiện hàng đủ sáng và nằm trọn trong khung hình.</p>
            </div>
            {imageUrl ? (
              <ParcelPreview imageUrl={imageUrl} />
            ) : (
              <ParcelPhotoGuide />
            )}
            <input ref={fileInput} hidden accept="image/*" capture="environment" type="file" onChange={choosePhoto} />
            {!imageUrl ? (
              <div className="mt-4">
                <div className="mb-4 grid grid-cols-3 gap-2">
                  {["Đủ sáng", "Không bị che", "Rõ toàn bộ"].map((tip) => (
                    <div className="flex items-center justify-center gap-1.5 rounded-xl bg-[#fff4eb] px-2 py-2 text-[11px] font-semibold text-[#8b3c0d]" key={tip}>
                      <Check className="size-3.5 text-[#f55a12]" /> {tip}
                    </div>
                  ))}
                </div>
                <Button
                  fullWidth
                  className="h-14 rounded-2xl bg-[#ff5b16] text-base font-semibold text-white shadow-[0_12px_28px_rgba(255,91,22,.24)]"
                  size="lg"
                  onPress={() => fileInput.current?.click()}
                >
                  <Camera className="size-5" /> Chụp ảnh kiện hàng
                </Button>
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                <Button fullWidth className="h-12 rounded-2xl" size="lg" variant="outline" onPress={() => fileInput.current?.click()}>
                  <FileArrowUp className="size-5" /> Chụp hoặc chọn lại
                </Button>
                <Button
                  fullWidth
                  className="h-14 rounded-2xl bg-[#ff5b16] text-base font-semibold text-white shadow-[0_12px_28px_rgba(255,91,22,.24)]"
                  size="lg"
                  onPress={() => setScreen("confirm")}
                >
                  <Check className="size-5" /> Tiếp tục
                </Button>
              </div>
            )}
          </div>
        );

      case "confirm":
        return (
          <div className="flex flex-1 flex-col">
            <div className="mx-auto w-48 overflow-hidden rounded-[1.5rem] bg-[#fff2e8] shadow-[0_16px_38px_rgba(92,40,11,.16)] ring-1 ring-[#f4dfd0]">
              <div className="relative aspect-square">
                {imageUrl?.startsWith("blob:") ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img alt="Kiện hàng cần xác nhận" className="h-full w-full object-cover" src={imageUrl} />
                ) : (
                  <Image
                    alt="Kiện hàng cần xác nhận"
                    className="object-cover"
                    fill
                    sizes="192px"
                    src={imageUrl ?? "/illustrations/parcel-photo-guide.png"}
                  />
                )}
              </div>
            </div>

            <div className="mb-5 mt-5 text-center">
              <h1 className="text-[1.75rem] font-bold tracking-[-0.045em] text-[#172033]">Xác nhận thông tin</h1>
              <p className="mt-1 text-sm text-muted">Kiểm tra lại trước khi gửi yêu cầu.</p>
            </div>

            <Card className="gap-0 rounded-[1.6rem] border border-[#f2e7df] bg-white p-0 shadow-[0_14px_38px_rgba(91,40,10,.08)]">
              <Card.Content className="px-4 py-1">
                <div className="flex items-center gap-3 py-3.5">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-[#fff0e7] text-[#f55a12]">
                    <Person className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-muted">Người nhận</p>
                    <p className="truncate font-bold text-[#172033]">Nguyễn Thị Hằng</p>
                    <p className="text-sm text-muted">{formatPhone(phone)}</p>
                  </div>
                </div>
                <div className="h-px bg-[#eee7e1]" />
                <div className="flex items-center gap-3 py-3.5">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-[#fff0e7] text-[#f55a12]">
                    <MapPin className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-muted">Điểm gửi</p>
                    <p className="font-bold text-[#172033]">Locker {lockerCode}</p>
                    <p className="truncate text-sm text-muted">12 Nguyễn Huệ, Quận 1</p>
                  </div>
                </div>
              </Card.Content>
            </Card>
            {apiError ? <div className="pt-4"><ApiErrorCard message={apiError} /></div> : null}
            <div className="mt-auto pt-5">
              <Button
                fullWidth
                isPending={isSendingRequest}
                className="h-14 rounded-2xl bg-[#ff5b16] text-base font-semibold text-white shadow-[0_12px_28px_rgba(255,91,22,.24)]"
                size="lg"
                onPress={sendDeliveryRequest}
              >
                {isSendingRequest ? <><Spinner color="current" size="sm" /> Đang gửi yêu cầu...</> : "Gửi yêu cầu"}
              </Button>
            </div>
          </div>
        );

      case "waiting":
        return (
          <div className="flex flex-1 flex-col">
            <ApprovalCountdown seconds={approvalSeconds} />

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
                  aria-label={`Gọi cho Nguyễn Thị Hằng theo số ${formatPhone(phone)}`}
                  className="group flex w-full items-center gap-3 no-underline"
                  href={`tel:${phoneDigits(phone)}`}
                >
                  <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-[#fff0e7] text-[#ff5b16]">
                    <Handset className="size-6" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs text-muted">Cư dân</span>
                    <span className="block truncate text-sm font-bold text-[#172033]">Nguyễn Thị Hằng</span>
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
              <Button fullWidth variant="outline" onPress={reset}>Về trang đầu</Button>
            </div>
          </div>
        );

      case "searching":
        return (
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <Spinner size="xl" />
            <h1 className="mt-6 text-2xl font-semibold tracking-tight">Đang tìm ngăn trống</h1>
            <p className="mt-2 max-w-xs text-sm leading-6 text-muted">Hệ thống đang kiểm tra các ngăn khả dụng tại Locker {lockerCode}.</p>
          </div>
        );

      case "compartment":
        return (
          <>
            <StatusScreen
              tone="success"
              icon={<CircleCheckFill className="size-11" />}
              title={`Ngăn ${compartmentCode} đã sẵn sàng`}
              description="Cửa ngăn đã mở. Hãy đặt kiện hàng vào ngăn rồi đóng cửa."
            >
              <Card variant="secondary">
                <Card.Content className="space-y-4">
                  <div className="grid grid-cols-2 divide-x divide-border text-center">
                    <div className="py-1">
                      <p className="text-xs text-muted">Locker</p>
                      <p className="mt-1 text-lg font-semibold">{lockerCode}</p>
                    </div>
                    <div className="py-1">
                      <p className="text-xs text-muted">Ngăn</p>
                      <p className="mt-1 text-lg font-semibold">{compartmentCode}</p>
                    </div>
                  </div>
                  <div className="h-px bg-border" />
                  <div className="flex items-center gap-3">
                    <CircleCheckFill className="size-6 shrink-0 text-success" />
                    <div>
                      <p className="font-semibold">Cửa đã mở</p>
                      <p className="text-sm text-muted">Đặt kiện hàng vào ngăn {compartmentCode}</p>
                    </div>
                  </div>
                </Card.Content>
              </Card>
              <Button fullWidth size="lg" onPress={() => setScreen("closing")}>Đã đặt kiện hàng</Button>
            </StatusScreen>
          </>
        );

      case "closing":
        return (
          <>
            <PageIntro
              icon={<TriangleExclamation className="size-7" />}
              title="Hãy đóng cửa ngăn"
              description={`Hệ thống chỉ hoàn tất khi phần cứng xác nhận cửa ${compartmentCode} đã đóng.`}
            />
            <Card variant="secondary">
              <Card.Content className="space-y-5">
                <div className="flex items-start gap-3">
                  <TriangleExclamation className="mt-0.5 size-6 shrink-0 text-danger" />
                  <div>
                    <p className="font-semibold text-danger">Cửa vẫn đang mở</p>
                    <p className="mt-1 text-sm text-muted">Vui lòng đóng cửa ngăn trước khi rời đi.</p>
                  </div>
                </div>
                <div className="h-px bg-border" />
                <div className="text-center">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted">Thời gian còn lại</p>
                  <p className="mt-1 font-mono text-4xl font-semibold text-danger">{formatTime(doorSeconds)}</p>
                </div>
              </Card.Content>
            </Card>
            <p className="mt-4 text-center text-xs leading-5 text-muted">Nút bên dưới chỉ yêu cầu hệ thống kiểm tra; trạng thái cảm biến cửa mới là xác nhận cuối cùng.</p>
            {apiError ? <div className="pt-4"><ApiErrorCard message={apiError} /></div> : null}
            <div className="pt-5">
              <Button fullWidth isPending={checkingDoor} size="lg" onPress={verifyDoor}>
                {checkingDoor ? <><Spinner color="current" size="sm" /> Đang kiểm tra cửa...</> : "Tôi đã đóng cửa"}
              </Button>
            </div>
          </>
        );

      case "success":
        return (
          <StatusScreen
            tone="success"
            icon={<CircleCheckFill className="size-12" />}
            title="Gửi hàng thành công"
            description={`Kiện hàng đã được lưu tại Locker ${lockerCode} và người nhận đã được thông báo.`}
          >
            <Card>
              <Card.Header>
                <Card.Title className="flex items-center gap-2"><Receipt className="size-5" /> Biên nhận gửi hàng</Card.Title>
                <Card.Description>{parcelId || "Đã tạo kiện hàng"}</Card.Description>
              </Card.Header>
              <Card.Content className="space-y-3 text-sm">
                {[["Locker", lockerCode], ["Ngăn", compartmentCode], ["Người nhận", formatPhone(phone)], ["Trạng thái", "Đã lưu an toàn"]].map(([label, value]) => (
                  <div className="flex justify-between gap-4 border-b border-border pb-3 last:border-0 last:pb-0" key={label}>
                    <span className="text-muted">{label}</span><span className="text-right font-medium">{value}</span>
                  </div>
                ))}
              </Card.Content>
            </Card>
            <Card variant="secondary">
              <Card.Content className="flex items-center gap-3 text-sm">
                <Bell className="size-5 shrink-0 text-success" /> Đã gửi thông báo cho người nhận
              </Card.Content>
            </Card>
            <Button fullWidth size="lg" onPress={reset}>Hoàn tất</Button>
            <Button fullWidth size="lg" variant="outline" onPress={() => { reset(); setScreen("recipient"); }}>Gửi kiện khác</Button>
          </StatusScreen>
        );

      case "not-found":
        return (
          <StatusScreen tone="danger" icon={<Xmark className="size-11" />} title="Không tìm thấy người nhận trên hệ thống" description="Số điện thoại chưa thuộc Resident đã đăng ký. Kiểm tra lại trước khi tiếp tục.">
            <Button fullWidth size="lg" onPress={() => { setFound(false); setScreen("recipient"); }}>Kiểm tra lại SĐT</Button>
          </StatusScreen>
        );

      case "rejected":
        return (
          <StatusScreen tone="danger" icon={<Xmark className="size-11" />} title="Người nhận đã từ chối" description="Yêu cầu gửi hàng không được chấp nhận. Lượt gửi này đã kết thúc.">
            <Button fullWidth size="lg" onPress={reset}>Về trang đầu</Button>
          </StatusScreen>
        );

      case "expired":
        return (
          <StatusScreen tone="warning" icon={<Clock className="size-11" />} title="Yêu cầu đã hết hạn" description="Người nhận chưa phản hồi trong thời gian quy định. Lượt gửi đã được hủy.">
            <Button fullWidth size="lg" onPress={reset}>Về trang đầu</Button>
          </StatusScreen>
        );

      case "full":
        return (
          <StatusScreen tone="warning" icon={<Box className="size-11" />} title="Locker đã hết ngăn trống" description="Hiện tại LK-01 không còn ngăn khả dụng. Vui lòng thử lại sau.">
            <Button fullWidth size="lg" onPress={reset}>Về trang đầu</Button>
          </StatusScreen>
        );

      case "door-timeout":
        return (
          <StatusScreen tone="danger" icon={<TriangleExclamation className="size-11" />} title="Quá 5 phút cửa chưa đóng" description="Lượt gửi không hoàn tất và cảnh báo vận hành đã được tạo cho Locker LK-01.">
            <Button fullWidth size="lg" onPress={reset}>Về trang đầu</Button>
          </StatusScreen>
        );
    }
  })();

  if (screen === "welcome") {
    return (
      <WelcomeScreen
        onReceive={() => setScreen("receive-otp")}
        onSend={() => setScreen("home")}
      />
    );
  }

  return (
    <div className="min-h-dvh bg-surface-secondary sm:py-8">
      <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col bg-background sm:min-h-[calc(100dvh-4rem)] sm:overflow-hidden sm:rounded-3xl sm:border sm:border-border sm:shadow-sm">
        <AppHeader isBackDisabled={openingDoor} lockerCode={lockerCode} goBack={goBack} />
        <main className={`safe-bottom flex flex-1 flex-col px-5 pb-6 sm:px-7 ${screen === "receive-otp" ? "bg-[#fffaf6] pt-0" : screen === "receive-details" || screen === "receive-open-failed" || screen === "receive-opened" ? "bg-[#fffaf6] pt-5" : screen === "recipient" ? "pt-4" : "pt-7"}`}>
          {content}
        </main>
      </div>
    </div>
  );
}
