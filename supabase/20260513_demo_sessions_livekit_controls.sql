alter table if exists public.offers
  add column if not exists redeem_once_per_account boolean not null default true;

alter table if exists public.class_sessions
  add column if not exists session_kind text not null default 'class',
  add column if not exists started_at timestamptz,
  add column if not exists livekit_controls jsonb not null default '{
    "waiting_room_enabled": true,
    "private_participants_enabled": true,
    "cohost_user_ids": [],
    "admitted_user_ids": [],
    "waiting_user_ids": [],
    "room_locked": false
  }'::jsonb;

create table if not exists public.class_session_join_requests (
  id bigserial primary key,
  session_id bigint not null references public.class_sessions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'waiting',
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references public.profiles(id),
  unique(session_id, user_id)
);

alter table public.class_session_join_requests enable row level security;

drop policy if exists "Staff can manage class session join requests" on public.class_session_join_requests;
create policy "Staff can manage class session join requests"
on public.class_session_join_requests
for all
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role in ('admin', 'teacher')
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role in ('admin', 'teacher')
  )
);

drop policy if exists "Students can read own class join requests" on public.class_session_join_requests;
create policy "Students can read own class join requests"
on public.class_session_join_requests
for select
to authenticated
using (user_id = auth.uid());

create unique index if not exists offer_redemptions_once_per_account
on public.offer_redemptions(offer_id, user_id)
where status = 'redeemed';

create table if not exists public.class_session_live_polls (
  id bigserial primary key,
  session_id bigint not null references public.class_sessions(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  question text not null,
  options jsonb not null default '[]'::jsonb,
  allow_multiple boolean not null default false,
  status text not null default 'live',
  started_at timestamptz not null default now(),
  ends_at timestamptz,
  correct_option_index integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.class_session_live_poll_votes (
  id bigserial primary key,
  poll_id bigint not null references public.class_session_live_polls(id) on delete cascade,
  session_id bigint not null references public.class_sessions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  option_index integer not null,
  created_at timestamptz not null default now()
);

create unique index if not exists class_session_live_poll_votes_single_choice
on public.class_session_live_poll_votes(poll_id, user_id, option_index);

create table if not exists public.class_session_live_questions (
  id bigserial primary key,
  session_id bigint not null references public.class_sessions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  question text not null,
  answer text,
  status text not null default 'open',
  is_pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.class_session_live_question_votes (
  id bigserial primary key,
  question_id bigint not null references public.class_session_live_questions(id) on delete cascade,
  session_id bigint not null references public.class_sessions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(question_id, user_id)
);

create table if not exists public.class_session_live_activity_events (
  id bigserial primary key,
  session_id bigint not null references public.class_sessions(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.class_session_live_participant_stats (
  id bigserial primary key,
  session_id bigint not null references public.class_sessions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz,
  last_seen_at timestamptz,
  left_at timestamptz,
  speaking_seconds integer not null default 0,
  screen_share_seconds integer not null default 0,
  hand_raise_count integer not null default 0,
  chat_messages_count integer not null default 0,
  private_messages_count integer not null default 0,
  reactions_count integer not null default 0,
  focus_loss_count integer not null default 0,
  updated_at timestamptz not null default now(),
  unique(session_id, user_id)
);

create table if not exists public.class_session_recordings (
  id bigserial primary key,
  session_id bigint not null references public.class_sessions(id) on delete cascade,
  started_by uuid references public.profiles(id) on delete set null,
  status text not null default 'recording',
  recording_mode text,
  started_at timestamptz,
  stopped_at timestamptz,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.class_session_live_polls enable row level security;
alter table public.class_session_live_poll_votes enable row level security;
alter table public.class_session_live_questions enable row level security;
alter table public.class_session_live_question_votes enable row level security;
alter table public.class_session_live_activity_events enable row level security;
alter table public.class_session_live_participant_stats enable row level security;
alter table public.class_session_recordings enable row level security;

drop policy if exists "Authenticated users can use class live polls" on public.class_session_live_polls;
create policy "Authenticated users can use class live polls" on public.class_session_live_polls for all to authenticated using (true) with check (true);

drop policy if exists "Authenticated users can use class live poll votes" on public.class_session_live_poll_votes;
create policy "Authenticated users can use class live poll votes" on public.class_session_live_poll_votes for all to authenticated using (true) with check (true);

drop policy if exists "Authenticated users can use class live questions" on public.class_session_live_questions;
create policy "Authenticated users can use class live questions" on public.class_session_live_questions for all to authenticated using (true) with check (true);

drop policy if exists "Authenticated users can use class live question votes" on public.class_session_live_question_votes;
create policy "Authenticated users can use class live question votes" on public.class_session_live_question_votes for all to authenticated using (true) with check (true);

drop policy if exists "Authenticated users can use class live activity events" on public.class_session_live_activity_events;
create policy "Authenticated users can use class live activity events" on public.class_session_live_activity_events for all to authenticated using (true) with check (true);

drop policy if exists "Authenticated users can use class live participant stats" on public.class_session_live_participant_stats;
create policy "Authenticated users can use class live participant stats" on public.class_session_live_participant_stats for all to authenticated using (true) with check (true);

drop policy if exists "Authenticated users can use class session recordings" on public.class_session_recordings;
create policy "Authenticated users can use class session recordings" on public.class_session_recordings for all to authenticated using (true) with check (true);

do $$
begin
  alter publication supabase_realtime add table public.class_session_live_polls;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.class_session_live_poll_votes;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.class_session_live_questions;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.class_session_live_question_votes;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.class_session_live_participant_stats;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.class_session_recordings;
exception when duplicate_object then null;
end $$;
