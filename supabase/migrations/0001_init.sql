-- CRUX 抱石 · Supabase 数据库初始化
--
-- 用法一（推荐，零依赖）：Supabase 控制台 → SQL Editor → New query → 粘贴全文 → Run
-- 用法二：安装 Supabase CLI 后在项目根目录执行  supabase db push
--
-- 说明：项目保留自带的 bcrypt + JWT 会话（不使用 Supabase Auth），
--      因此这里自建 public.users；所有读写都走服务端 service_role，
--      service_role 会绕过 RLS，anon / authenticated 默认无法直接访问。

-- ---------------------------------------------------------------------------
-- 1. 用户表（与 lib/db.ts 的字段一一对应）
-- ---------------------------------------------------------------------------
create table if not exists public.users (
  id            text primary key,
  email         text unique not null,
  password_hash text not null,
  display_name  text,
  created_at    timestamptz not null default now()
);

create index if not exists users_created_at_idx on public.users (created_at desc);

-- ---------------------------------------------------------------------------
-- 2. 分析记录
--    record 存完整 AnalysisRecord（前向兼容：以后加字段不用改表结构），
--    其余列是从 record 中拆出的关键字段，用于筛选、排序与统计。
-- ---------------------------------------------------------------------------
create table if not exists public.analyses (
  id                         text primary key,
  user_id                    text references public.users (id) on delete cascade,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  file_name                  text not null default '',
  thumbnail                  text,
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

create index if not exists analyses_user_created_idx
  on public.analyses (user_id, created_at desc);
create index if not exists analyses_user_grade_idx
  on public.analyses (user_id, grade);
create index if not exists analyses_segments_gin_idx
  on public.analyses using gin (segments);

-- updated_at 自动维护
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

-- ---------------------------------------------------------------------------
-- 3. 行级安全（RLS）
--    默认只允许服务端 service_role 访问；anon / authenticated 无任何策略。
--    若将来改用 Supabase Auth，可放开下面注释的「仅本人数据」策略。
-- ---------------------------------------------------------------------------
alter table public.users enable row level security;
alter table public.analyses enable row level security;

-- create policy "users_select_self" on public.users
--   for select to authenticated using (auth.uid()::text = id);
-- create policy "analyses_select_own" on public.analyses
--   for select to authenticated using (auth.uid()::text = user_id);
-- create policy "analyses_insert_own" on public.analyses
--   for insert to authenticated with check (auth.uid()::text = user_id);
-- create policy "analyses_update_own" on public.analyses
--   for update to authenticated using (auth.uid()::text = user_id);
-- create policy "analyses_delete_own" on public.analyses
--   for delete to authenticated using (auth.uid()::text = user_id);
