# VBox — Resend Email Inbox

A modern, fast, production-ready web application for receiving and managing emails on your custom domain via **Resend's Receiving / Inbound Emails API and Webhooks**.

![VBox Architecture](https://resend.com/static/docs/inbound-email-flow.png)

---

## 🚀 Features

- **Resend Inbound Webhook**: Real-time receipt of `email.received` events with **Svix signature verification** using raw HTTP request body.
- **Webhook Idempotency**: Prevents duplicate emails using unique constraints on Resend Email IDs (`resendEmailId`).
- **Initial API Synchronization**: Manual & automated sync endpoint (`POST /api/emails/sync`) to fetch pre-existing received emails directly from Resend's API.
- **Sandboxed HTML Email Reader**: Safe rendering of HTML emails sanitized with DOMPurify to prevent XSS and CSS pollution.
- **Attachments Support**: Metadata storage in PostgreSQL and single-click downloading/streaming via backend attachment routes.
- **Real-Time UI Updates**: Live new-email notifications and auto-refreshing inbox using **Server-Sent Events (SSE)**.
- **Keyboard Shortcuts**: Supercharged navigation (`/` search, `r` refresh, `e` archive, `Delete` trash, `s` star, `Esc` back).
- **Dark / Light Mode**: Elegant UI design inspired by Linear, Raycast, and Gmail.
- **Authentication**: Secure password hashing with bcryptjs and session management via HTTP-only cookies & JWT tokens.

---

## 🛠 Tech Stack

### Backend
- **Node.js + Express + TypeScript**
- **Resend Node.js SDK**
- **Prisma ORM** + **PostgreSQL**
- **Svix Webhook Verification**
- **Zod & Pino Logger**
- **Vitest & Supertest**

### Frontend
- **React + Vite + TypeScript**
- **Tailwind CSS**
- **TanStack Query (React Query)**
- **Lucide Icons & DOMPurify**

---

## 📦 Project Structure

```text
vbox/
├── server/
│   ├── prisma/
│   │   └── schema.prisma
│   ├── src/
│   │   ├── config/          # Zod environment variable parsing
│   │   ├── controllers/     # Auth & Email controllers
│   │   ├── middleware/      # Auth & Error middlewares
│   │   ├── routes/          # REST API endpoints
│   │   ├── services/        # Resend SDK integration service
│   │   ├── utils/           # Prisma client, Pino logger, SSE manager
│   │   ├── webhooks/        # Raw-body Svix signature handler
│   │   ├── scripts/         # Webhook automated setup CLI
│   │   ├── app.ts
│   │   └── server.ts
│   └── package.json
│
├── client/
│   ├── src/
│   │   ├── components/      # EmailList, EmailReader, Header, Sidebar, Settings
│   │   ├── hooks/           # useRealtime (SSE hook)
│   │   ├── lib/             # Utilities and formatting
│   │   ├── types/           # TypeScript definitions
│   │   └── App.tsx
│   └── package.json
│
├── docker-compose.yml
├── .env.example
└── README.md
```

---

## ⚙️ Environment Variables

Copy `.env.example` to `.env`:

```env
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/vbox_email?schema=public
RESEND_API_KEY=re_xxxxxxxxx
RESEND_WEBHOOK_SECRET=whsec_xxxxxxxxx
JWT_SECRET=super-secret-jwt-key-at-least-32-characters-long
APP_URL=http://localhost:3000
WEBHOOK_URL=https://avelut.xyz/api/webhooks/resend
```

---

## ⚡ Quick Start & Local Development

### 1. Install Dependencies
```bash
pnpm install
```

### 2. Run Database & Migrations
```bash
cd vbox/server
pnpm prisma db push
```

### 3. Start Server & Client
In terminal 1 (Server):
```bash
cd vbox/server
pnpm dev
```

In terminal 2 (Client):
```bash
cd vbox/client
pnpm dev
```

---

## 🌐 Resend Webhook & Domain Setup

1. **Verify Domain in Resend**:
   Add your domain (e.g., `avelut.xyz`) in your Resend Dashboard under **Domains**.

2. **Configure Inbound Email**:
   Set up MX records pointing to Resend as instructed in the Resend Inbound Documentation.

3. **Expose Local Server for Testing (ngrok)**:
   ```bash
   ngrok http 3000
   ```
   Copy your ngrok HTTPS URL (e.g. `https://xxxx.ngrok-free.app/api/webhooks/resend`).

4. **Register Webhook in Resend**:
   Run the setup script or add it manually in the Resend Webhooks Dashboard:
   ```bash
   cd vbox/server
   pnpm setup:webhook
   ```
   Event type required: `email.received`.

5. **Set Webhook Secret**:
   Copy the `whsec_...` secret provided by Resend to your `.env` file as `RESEND_WEBHOOK_SECRET`.

---

## 🐳 Docker Deployment

To run the entire stack with PostgreSQL in Docker:

```bash
docker-compose up -d --build
```

---

## 🧪 Testing

Run backend tests:

```bash
cd vbox/server
pnpm test
```
