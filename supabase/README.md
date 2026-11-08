# Supabase 接入（Auth + Postgres + Storage）

网页版以 Supabase 为唯一事实来源：

| 能力 | 用途 | 代码位置 |
| --- | --- | --- |
| Supabase Auth | 注册、登录、邮箱验证、会话刷新 | `lib/use-auth.ts`、`components/auth-form.tsx` |
| `public.analyses` | 每次视频分析记录（时间轴、评分、难度、收藏下标） | `lib/analysis-store.ts` |
| `public.agent_memory` | 每个用户的 Agent 长期记忆 | `lib/agent/memory/supabase-persistence.ts` |
| Storage `media` | 私有视频与缩略图，路径 `{userId}/{analysisId}/...` | `lib/analysis-store.ts` |

浏览器用 publishable / anon key 直连 PostgREST 与 Storage，RLS 保证每个用户只能读写自己的行；
`service_role` 只留给服务端后台任务，绝不能出现在浏览器代码里。

## 一、创建项目

1. 打开 <https://supabase.com/dashboard>，注册 / 登录。
2. **New project**：填写名称、数据库密码、区域（国内用户建议新加坡 `ap-southeast-1`）。
3. 等待项目初始化完成（约 1–2 分钟）。

## 二、执行迁移

打开 **SQL Editor** → **New query**，执行下面这个文件：

- `supabase/migrations/0003_supabase_auth.sql`

> 0003 会重建 `analyses` / `agent_memory`，删除旧的 `public.users`。
> 本项目此前没有真实用户，所以这是安全的一次性切换；如果以后有真实用户，需要改为增量迁移。
> `0001_init.sql` / `0002_agent_memory.sql` 是旧版自建账号方案，仅用于历史参考。

迁移会同时完成：

- `analyses.user_id` / `agent_memory.user_id` 改为 `uuid references auth.users(id)`；
- 打开 RLS，只允许 `auth.uid() = user_id` 的读写；
- 创建私有 Storage bucket `media`，限制单文件 50MB，并按用户目录隔离。

## 三、开启 Auth

**Authentication → Providers → Email**：

1. 确认 Email provider 已启用。
2. 本地开发想跳过邮箱验证时，关闭 **Confirm email**；生产环境建议保持开启。
3. 如果保持开启，需要在 **Authentication → Emails** 配置 SMTP，否则验证邮件可能发不出去。

**Authentication → URL Configuration**：

- **Site URL** 填本地或生产地址，例如 `http://localhost:3000`。
- **Redirect URLs** 加入 `http://localhost:3000/**` 和线上域名 `https://your-domain/**`，
  否则注册确认邮件里的回跳链接会被 Supabase 拒绝。

## 四、环境变量

**Project Settings → API**：

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_publishable_or_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

- `NEXT_PUBLIC_SUPABASE_ANON_KEY`：给浏览器用，受 RLS 约束。
- `SUPABASE_SERVICE_ROLE_KEY`：只给服务端 Agent 记忆等后台任务用，不能加 `NEXT_PUBLIC_` 前缀。
- `AUTH_SECRET`、`POSTGRES_URL`、`DATABASE_URL` 已不再需要。

部署到 Vercel 时，三项都要在 Production / Preview / Development 配置。

## 五、验证

```bash
npm run dev
```

1. 打开 `/auth/register` 注册账号。
2. 在 Supabase **Authentication → Users** 看到新用户。
3. 登录后打开 `/analyze` 完成一次分析。
4. 在 **Table Editor → analyses** 看到一行，`user_id` 是当前用户的 uuid。
5. 在 **Storage → media** 看到 `{userId}/{analysisId}/thumb.jpg` 和（50MB 以内的）视频文件。
6. 换一个浏览器或设备登录同一个账号，历史记录、缩略图和视频都能看到。

## 数据流

```
/auth/*            Supabase Auth（邮箱 + 密码，浏览器端会话）
/analyze           浏览器抽帧 → POST /api/analyze（Bearer token）
                   → DeepSeek / Agent → 报告
                   → Storage 上传缩略图/视频 → analyses 入库
/analysis/[id]     直连 PostgREST 读记录，Storage 签名 URL 播放视频
/favorites         读 analyses，按 bookmarked_segment_indices 汇总
/progress          读 analyses，按 created_at 聚合
```

原视频超过 50MB 时只保存报告和缩略图；需要保留大视频时，建议把原片放到 Cloudflare R2/B2，
数据库只存对象路径，避免 Supabase Storage 配额和流量成本快速上升。
