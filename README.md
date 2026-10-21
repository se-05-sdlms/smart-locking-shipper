# SmartLock Shipper Mobile Web

Mobile-first guest flow for shippers delivering parcels to and collecting return parcels from Smart Delivery Lockers.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with a locker code, for example `?locker=LK-01`. The application uses the backend configured by `BACKEND_URL` (default: `http://127.0.0.1:5005/api`).

## Stack

- Next.js App Router + TypeScript
- Tailwind CSS v4
- HeroUI v3 with its default theme
- Gravity UI Icons
