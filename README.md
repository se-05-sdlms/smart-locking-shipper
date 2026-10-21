# SmartLock Shipper Mobile Web

Mobile-first guest flow for shippers delivering parcels to and collecting return parcels from Smart Delivery Lockers.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with a locker code, for example `?locker=LK-01`. The application uses the backend configured by `BACKEND_URL` (default: `http://127.0.0.1:5005/api`).

The locker QR code must link to the Guest Web with `?locker=<locker code>`. Without a valid code, or when the backend reports the locker as unknown, the app shows the invalid-link screen instead of falling back to a default locker.

Approval and door-close countdowns come from the backend (`approvalExpiresAt`, `reservationExpiresAt`), so they follow the active System Policy.

In development only, `?preview=<screen>` opens a screen directly for design review; it is ignored in production builds.

## Stack

- Next.js App Router + TypeScript
- Tailwind CSS v4
- HeroUI v3 with its default theme
- Gravity UI Icons
