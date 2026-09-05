# Messenger & notifications on Supabase (no Firebase)

## Architecture

- **Transport:** Supabase Realtime = WebSockets (not REST polling).
- **Typing indicators:** Realtime **broadcast** channels (`typing:{chatId}`) — no DB writes → lower cost.
- **Messages / chat list / notifications:** Postgres tables + `postgres_changes` WebSocket subscriptions.
- **Media:** Prefer Cloudflare R2 (`uploadToR2`); fallback Supabase Storage bucket `uploads`.
- **Auth:** Supabase Auth (email + Google OAuth). Login/SignUp already call `supabaseAuthService.signInWithGoogle()`.

## One-time setup

1. Run SQL in Supabase SQL editor:
   - `supabase/migrations/20260905_messenger_notifications.sql`
2. Create Storage bucket **`uploads`** (public read if you use public URLs).
3. Auth → Providers → **Google**: client ID/secret + redirect `https://avelut.xyz/**`.
4. Database → Replication: ensure `messages`, `chat_members`, `notifications`, `profiles` are in `supabase_realtime` publication (SQL migration tries to add them).

## Packages removed

- `firebase`
- `@capacitor-firebase/authentication`

Vite aliases map any leftover `firebase/*` imports to `lib/shims/*` and `lib/database.ts`.

## Cost notes

True peer-to-peer WebSockets between browsers still need a relay (NAT). Supabase Realtime is that relay, billed on concurrent connections + messages — far cheaper than polling. Typing uses broadcast only (no row writes).

## Android push

Continue using `@capacitor/push-notifications`. Store device tokens on `profiles` (add column `push_token` if needed) and send via your own server/Edge Function — do not depend on Firebase Cloud Messaging client SDK.
