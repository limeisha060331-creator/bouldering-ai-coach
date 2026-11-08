-- CRUX 抱石 · 切换到 Supabase Auth + RLS + Storage
--
-- 前置条件：本项目此前没有真实用户数据，因此直接重建业务表。
-- 执行位置：Supabase 控制台 → SQL Editor → 粘贴全文 → Run。
--
-- 变更内容：
--   1. 删除自建 public.users，账号统一由 auth.users 管理；
--   2. analyses / agent_memory 的 user_id 改为 uuid，引用 auth.users(id)；
--   3. 打开 RLS，只允许用户读写自己的数据；
--   4. 新建私有 Storage bucket `media`，按 {userId}/... 目录隔离视频和缩略图。

-- ---------------------------------------------------------------------------
-- 1. 重建业务表（旧表没有真实用户，直接删掉）
-- ---------------------------------------------------------------------------
drop table if exists public.agent_memory cascade;
drop table if exists public.analyses cascade;
drop table if exists public.users cascade;

create table public.analyses (
  id                         text primary key,
  user_id                    uuid not null references auth.users (id) on delete cascade,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  file_name                  text not null default '',
  thumbnail_path             text,
  video_path                 text,
  analysis                   text not null default '',
  score                      numeric,
  highlight                  text,
  segments                   jsonb not null default '[]'::jsonb,
  prompt_version             text,
  depth                      text check (depth in ('light', 'deep')),
  locale                     text check (locale in ('zh', 'en')),
  bookmarked_segment_indices integer[] not null default '{}',
  ascent_meters              numeric,
  grade                      text,
  session_note               text,
  record                     jsonb not null default '{}'::jsonb
);

create index analyses_user_created_idx
  on public.analyses (user_id, created_at desc);
create index analyses_user_grade_idx
  on public.analyses (user_id, grade);
create index analyses_segments_gin_idx
  on public.analyses using gin (segments);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists analyses_set_updated_at on public.analyses;
create trigger analyses_set_updated_at
  before update on public.analyses
  for each row execute function public.set_updated_at();

create table public.agent_memory (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  data       jsonb not null default '{"version":1,"profiles":{},"episodes":[],"preferences":[]}'::jsonb,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 2. RLS：用户只能读写自己的行
-- ---------------------------------------------------------------------------
alter table public.analyses enable row level security;
alter table public.agent_memory enable row level security;

drop policy if exists "analyses_select_own" on public.analyses;
create policy "analyses_select_own"
  on public.analyses for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "analyses_insert_own" on public.analyses;
create policy "analyses_insert_own"
  on public.analyses for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "analyses_update_own" on public.analyses;
create policy "analyses_update_own"
  on public.analyses for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "analyses_delete_own" on public.analyses;
create policy "analyses_delete_own"
  on public.analyses for delete
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "agent_memory_own" on public.agent_memory;
create policy "agent_memory_own"
  on public.agent_memory for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 3. Storage：私有 bucket，路径必须是 {auth.uid()}/...
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'media',
  'media',
  false,
  52428800,
  array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm', 'video/quicktime']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "media_select_own" on storage.objects;
create policy "media_select_own"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "media_insert_own" on storage.objects;
create policy "media_insert_own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "media_update_own" on storage.objects;
create policy "media_update_own"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "media_delete_own" on storage.objects;
create policy "media_delete_own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
