-- Avelut: Messenger + notifications on Supabase (Realtime / WebSockets)
-- Run in Supabase SQL editor if not already applied.

-- Chats (1:1 for now; extendable to groups)
create table if not exists public.chats (
  id uuid primary key default gen_random_uuid(),
  is_group boolean default false,
  title text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.chat_members (
  chat_id uuid references public.chats(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  other_user_id uuid,
  last_message_text text,
  last_message_at timestamptz,
  last_message_sender_id uuid,
  last_message_is_read boolean default true,
  unread_count int default 0,
  created_at timestamptz default now(),
  primary key (chat_id, user_id)
);

create index if not exists chat_members_user_idx on public.chat_members(user_id);
create index if not exists chat_members_updated_idx on public.chat_members(user_id, last_message_at desc nulls last);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.chats(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  text text,
  media_url text,
  media_type text,
  reply_to uuid references public.messages(id) on delete set null,
  is_deleted boolean default false,
  created_at timestamptz default now()
);

create index if not exists messages_chat_created_idx on public.messages(chat_id, created_at desc);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text,
  body text,
  type text default 'general',
  data jsonb default '{}'::jsonb,
  is_read boolean default false,
  created_at timestamptz default now()
);

create index if not exists notifications_user_idx on public.notifications(user_id, created_at desc);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_uid uuid references auth.users(id),
  reported_uid uuid,
  chat_id uuid,
  reason text,
  created_at timestamptz default now()
);

create table if not exists public.study_partners (
  user_id uuid references auth.users(id) on delete cascade,
  partner_id uuid references auth.users(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (user_id, partner_id)
);

create table if not exists public.user_blocks (
  user_id uuid references auth.users(id) on delete cascade,
  blocked_id uuid references auth.users(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (user_id, blocked_id)
);

-- Presence columns on profiles (if table exists)
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='profiles') then
    alter table public.profiles add column if not exists is_online boolean default false;
    alter table public.profiles add column if not exists last_seen timestamptz;
  end if;
end $$;

-- RLS
alter table public.chats enable row level security;
alter table public.chat_members enable row level security;
alter table public.messages enable row level security;
alter table public.notifications enable row level security;
alter table public.reports enable row level security;
alter table public.study_partners enable row level security;
alter table public.user_blocks enable row level security;

-- Members can see chats they belong to
drop policy if exists chat_members_select on public.chat_members;
create policy chat_members_select on public.chat_members for select using (auth.uid() = user_id);

drop policy if exists chat_members_all on public.chat_members;
create policy chat_members_all on public.chat_members for all using (auth.uid() = user_id);

drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages for select using (
  exists (select 1 from public.chat_members m where m.chat_id = messages.chat_id and m.user_id = auth.uid())
);

drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages for insert with check (
  auth.uid() = sender_id and
  exists (select 1 from public.chat_members m where m.chat_id = messages.chat_id and m.user_id = auth.uid())
);

drop policy if exists messages_update on public.messages;
create policy messages_update on public.messages for update using (auth.uid() = sender_id);

drop policy if exists notifications_own on public.notifications;
create policy notifications_own on public.notifications for all using (auth.uid() = user_id);

drop policy if exists reports_insert on public.reports;
create policy reports_insert on public.reports for insert with check (auth.uid() = reporter_uid);

drop policy if exists study_partners_own on public.study_partners;
create policy study_partners_own on public.study_partners for all using (auth.uid() = user_id);

drop policy if exists user_blocks_own on public.user_blocks;
create policy user_blocks_own on public.user_blocks for all using (auth.uid() = user_id);

drop policy if exists chats_select on public.chats;
create policy chats_select on public.chats for select using (
  exists (select 1 from public.chat_members m where m.chat_id = chats.id and m.user_id = auth.uid())
);

drop policy if exists chats_insert on public.chats;
create policy chats_insert on public.chats for insert with check (true);

-- Realtime publication (ignore errors if already added)
do $$
begin
  begin
    alter publication supabase_realtime add table public.messages;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.chat_members;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.notifications;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.profiles;
  exception when duplicate_object then null;
  end;
end $$;
