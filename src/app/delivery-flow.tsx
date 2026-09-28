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
  REGEXP_ONLY_DIGITS,
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
  attachParcelImage,
  DeliveryApiError,
  initiateDelivery,
  submitRecipient,
  uploadParcelFile,
} from "./delivery-api";
import type { DeliverySession } from "./delivery-api";

type Screen =
  | "welcome"
  | "home"
  | "receive-otp"
  | "receive-details"
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

const MOCK_OTP = "123456";
const APPROVAL_DURATION_SECONDS = 10 * 60;

const formatTime = (seconds: number) =>
  `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;

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

function AppHeader({ screen, lockerCode, goBack }: { screen: Screen; lockerCode: string; goBack: () => void }) {
  return (
    <header className="safe-top sticky top-0 z-20 border-b border-border bg-background/95 px-4 pb-3 backdrop-blur">
      <div className="mx-auto flex w-full max-w-lg items-center justify-between">
        <div className="flex min-w-0 items-center gap-2">
          {screen !== "welcome" ? (
            <Button isIconOnly aria-label="Quay lại" className="size-11" variant="ghost" onPress={goBack}>
              <ArrowLeft className="size-5" />
            </Button>
          ) : (
            <Image alt="Logo Boxora" height={36} priority src="/boxora-logo.svg" width={36} />
          )}
          <div className="min-w-0">
            <p className="truncate text-base font-bold text-[#f55a12]">BOXORA</p>
            <p className="truncate text-xs text-muted">Tủ {lockerCode} · Nguyễn Huệ</p>
          </div>
        </div>
        <Chip color="success" size="sm" variant="soft">
          <span aria-hidden="true" className="size-1.5 rounded-full bg-current" /> Đang hoạt động
        </Chip>
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
          aria-label="Bắt đầu nhận hàng"
          className="group h-[5.75rem] justify-between rounded-[1.8rem] border border-white/70 bg-white/92 px-5 text-[#172033] shadow-[0_20px_45px_rgba(61,26,7,.24)] backdrop-blur-md transition-transform active:scale-[.985]"
          size="lg"
          variant="secondary"
          onPress={onReceive}
        >
          <span className="flex items-center gap-4">
            <span className="flex size-13 items-center justify-center rounded-2xl bg-[#fff0e6] text-[#ef560f] ring-1 ring-[#f6c8ad]">
              <Lock className="size-8" />
            </span>
            <span className="text-[1.65rem] font-bold tracking-[-0.035em]">Nhận hàng</span>
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
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const preview = searchParams.get("preview") as Screen | null;
    const previewPhone = searchParams.get("phone");
    const scannedLockerCode = searchParams.get("locker")?.trim();
    const available: Screen[] = ["welcome", "home", "receive-otp", "receive-details", "receive-opened", "recipient", "parcel", "confirm", "waiting", "searching", "compartment", "closing", "success", "not-found", "rejected", "expired", "full", "door-timeout"];
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
    if (screen !== "searching") return;
    const timer = window.setTimeout(() => setScreen("compartment"), 1400);
    return () => window.clearTimeout(timer);
  }, [screen]);

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
  };

  const verifyPickupCode = () => {
    if (otp !== MOCK_OTP) {
      setOtpError("Mã OTP không đúng. Vui lòng kiểm tra và nhập lại.");
      return;
    }

    setOtpError("");
    setScreen("receive-details");
  };

  const openPickupCompartment = () => {
    setOpeningDoor(true);
    window.setTimeout(() => {
      setOpeningDoor(false);
      setScreen("receive-opened");
    }, 900);
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
      await attachParcelImage(deliverySession.id, deliverySession.guestSessionToken, parcelImageUrl);
      await submitRecipient(
        deliverySession.id,
        deliverySession.guestSessionToken,
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

  const verifyDoor = () => {
    setCheckingDoor(true);
    window.setTimeout(() => {
      setCheckingDoor(false);
      setScreen("success");
    }, 1100);
  };

  const goBack = () => {
    const previous: Partial<Record<Screen, Screen>> = {
      home: "welcome",
      "receive-otp": "welcome",
      "receive-details": "receive-otp",
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
          <>
            <PageIntro
              icon={<Lock className="size-7" />}
              title="Nhập mã nhận hàng"
              description="Nhập mã OTP 6 số của đơn trả hàng để xác thực và tìm đúng ngăn tủ."
            />
            <Form className="flex flex-col gap-5" onSubmit={(event) => { event.preventDefault(); verifyPickupCode(); }}>
              <div className="flex flex-col gap-2">
                <Label>Mã OTP 6 số</Label>
                <InputOTP
                  aria-describedby={otpError ? "otp-error" : undefined}
                  autoFocus
                  className="justify-center"
                  isInvalid={Boolean(otpError)}
                  maxLength={6}
                  name="pickup-code"
                  pattern={REGEXP_ONLY_DIGITS}
                  value={otp}
                  onChange={(value) => { setOtp(value); setOtpError(""); }}
                >
                  <InputOTP.Group>
                    <InputOTP.Slot index={0} />
                    <InputOTP.Slot index={1} />
                    <InputOTP.Slot index={2} />
                  </InputOTP.Group>
                  <InputOTP.Separator />
                  <InputOTP.Group>
                    <InputOTP.Slot index={3} />
                    <InputOTP.Slot index={4} />
                    <InputOTP.Slot index={5} />
                  </InputOTP.Group>
                </InputOTP>
                <span className="field-error" data-visible={Boolean(otpError)} id="otp-error">
                  {otpError}
                </span>
              </div>
              <Card variant="secondary">
                <Card.Content className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-muted">Mã dùng thử</span>
                  <span className="font-mono text-base font-semibold tracking-[0.18em]">123456</span>
                </Card.Content>
              </Card>
              <Button fullWidth isDisabled={otp.length !== 6} size="lg" type="submit">
                Xác nhận mã OTP
              </Button>
            </Form>
          </>
        );

      case "receive-details":
        return (
          <>
            <PageIntro
              icon={<CircleCheckFill className="size-7" />}
              title="Đã tìm thấy đơn trả hàng"
              description="Kiểm tra người gửi và ngăn tủ trước khi mở cửa."
            />
            <Card>
              <Card.Header className="flex-row items-start justify-between gap-3">
                <div>
                  <Card.Title>Ngăn N06</Card.Title>
                <Card.Description>Tủ Boxora Nguyễn Huệ · LK-01</Card.Description>
                </div>
                <Chip color="success" size="sm" variant="soft">Đã xác thực</Chip>
              </Card.Header>
              <Card.Content className="space-y-4">
                <div className="flex items-center gap-3">
                  <Avatar color="accent" size="lg"><Avatar.Fallback>NH</Avatar.Fallback></Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-muted">Người gửi trả</p>
                    <p className="font-semibold">Nguyễn Thị H.</p>
                    <p className="text-sm text-muted">0901 *** 567</p>
                  </div>
                </div>
                <div className="h-px bg-border" />
                <div className="grid grid-cols-2 divide-x divide-border text-center">
                  <div className="py-1">
                    <p className="text-xs text-muted">Mã đơn trả</p>
                    <p className="mt-1 font-semibold">RTN-0182</p>
                  </div>
                  <div className="py-1">
                    <p className="text-xs text-muted">Ngăn tủ</p>
                    <p className="mt-1 text-lg font-semibold">N06</p>
                  </div>
                </div>
              </Card.Content>
            </Card>
            <div className="pt-5">
              <Button fullWidth isPending={openingDoor} size="lg" onPress={openPickupCompartment}>
                {openingDoor ? <><Spinner color="current" size="sm" /> Đang mở ngăn...</> : <><Lock className="size-5" /> Mở ngăn N06</>}
              </Button>
            </div>
          </>
        );

      case "receive-opened":
        return (
          <StatusScreen
            tone="success"
            icon={<CircleCheckFill className="size-12" />}
            title="Ngăn N06 đã mở"
            description="Lấy kiện hàng trả ra khỏi ngăn và đóng cửa tủ sau khi hoàn tất."
          >
            <Card variant="secondary">
              <Card.Content className="space-y-3">
                <div className="flex items-center gap-3">
                  <span className="flex size-12 items-center justify-center rounded-xl bg-success-soft text-success-soft-foreground">
                    <Box className="size-6" />
                  </span>
                  <div>
                    <p className="font-semibold">Cửa ngăn đang mở</p>
                    <p className="text-sm text-muted">Nhận kiện từ Nguyễn Thị H.</p>
                  </div>
                </div>
                <div className="h-px bg-border" />
                <div className="flex justify-between text-sm">
                  <span className="text-muted">Tủ / Ngăn</span>
                  <span className="font-semibold">LK-01 / N06</span>
                </div>
              </Card.Content>
            </Card>
            <Button fullWidth size="lg" onPress={reset}>Hoàn tất nhận hàng</Button>
          </StatusScreen>
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
            <p className="mt-2 max-w-xs text-sm leading-6 text-muted">Hệ thống đang kiểm tra các ngăn khả dụng tại Locker LK-01.</p>
          </div>
        );

      case "compartment":
        return (
          <>
            <StatusScreen
              tone="success"
              icon={<CircleCheckFill className="size-11" />}
              title="Ngăn N06 đã sẵn sàng"
              description="Cửa ngăn đã mở. Hãy đặt kiện hàng vào ngăn rồi đóng cửa."
            >
              <Card variant="secondary">
                <Card.Content className="space-y-4">
                  <div className="grid grid-cols-2 divide-x divide-border text-center">
                    <div className="py-1">
                      <p className="text-xs text-muted">Locker</p>
                      <p className="mt-1 text-lg font-semibold">LK-01</p>
                    </div>
                    <div className="py-1">
                      <p className="text-xs text-muted">Ngăn</p>
                      <p className="mt-1 text-lg font-semibold">N06</p>
                    </div>
                  </div>
                  <div className="h-px bg-border" />
                  <div className="flex items-center gap-3">
                    <CircleCheckFill className="size-6 shrink-0 text-success" />
                    <div>
                      <p className="font-semibold">Cửa đã mở</p>
                      <p className="text-sm text-muted">Đặt kiện hàng vào ngăn N06</p>
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
              description="Hệ thống chỉ hoàn tất khi phần cứng xác nhận cửa N06 đã đóng."
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
            description="Kiện hàng đã được lưu tại Locker LK-01 và người nhận đã được thông báo."
          >
            <Card>
              <Card.Header>
                <Card.Title className="flex items-center gap-2"><Receipt className="size-5" /> Biên nhận gửi hàng</Card.Title>
                <Card.Description>PRC-20260920-0182</Card.Description>
              </Card.Header>
              <Card.Content className="space-y-3 text-sm">
                {[['Locker', 'LK-01'], ['Ngăn', 'N06'], ['Người nhận', 'Nguyễn Thị H. · 0901 *** 567'], ['Thời gian', '20/09/2026 · 23:42']].map(([label, value]) => (
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
        <AppHeader lockerCode={lockerCode} screen={screen} goBack={goBack} />
        <main className={`safe-bottom flex flex-1 flex-col px-5 pb-6 sm:px-7 ${screen === "recipient" ? "pt-4" : "pt-7"}`}>
          {content}
        </main>
      </div>
    </div>
  );
}
