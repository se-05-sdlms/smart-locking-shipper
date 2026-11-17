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

## Deploy to Cloudflare Pages

1. Run `npx wrangler login`, then create the Direct Upload project once with
   `npx wrangler pages project create smart-locking-shipper --production-branch main`.
2. In the Shipper GitHub repository, open **Settings → Secrets and variables →
   Actions** and add the following entries.

   | Type | Name | Value |
   | --- | --- | --- |
   | Repository secret | `CLOUDFLARE_API_TOKEN` | Cloudflare token with Account / Cloudflare Pages / Edit for the deployment account |
   | Repository variable | `CLOUDFLARE_ACCOUNT_ID` | ID of the Cloudflare account that owns the Pages project |
   | Repository variable | `NEXT_PUBLIC_API_BASE_URL` | Public HTTPS API base ending in `/api`, for example `https://13.54.103.163/api` |

3. On EC2, add the Pages origin (usually `https://smart-locking-shipper.pages.dev`)
   to the existing `Cors__AllowedOrigins__<index>` entries in
   `/opt/smart-locking-be/.env`, using the next unused index. Set
   `ShipperWeb__BaseUrl` to the Pages URL so locker QR links open Shipper.
   Run the backend **CI** workflow on `main` to reload its environment.
4. Merge the workflow into `dev`, then promote `dev` to `main`. Pull requests
   and pushes to `dev` run lint, tests and the Next.js static build. On `main`,
   the workflow also uploads `out/` to Pages.

Next.js embeds `NEXT_PUBLIC_API_BASE_URL` in the browser bundle during the build.
After changing it, rerun **Cloudflare Pages** on `main` to publish a new build.
Verify the deployment by opening a locker QR link with a valid locker code and
checking that the browser requests the configured API host.
