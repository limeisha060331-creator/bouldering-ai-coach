-- CRUX 抱石 · Agent 长期记忆
--
-- 一条用户一行，data 里保存 MemoryStore 的完整结构：
-- { version, profiles, episodes, preferences }。
-- 项目不使用 Supabase Auth，所有读写都走服务端 service_role。

create table if not exists public.agent_memory (
  user_id    text primary key references public.users (id) on delete cascade,
  data       jsonb not null default '{"version":1,"profiles":{},"episodes":[],"preferences":[]}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.agent_memory enable row level security;

-- 只有 service_role 能访问；与 analyses 表保持同一策略。
