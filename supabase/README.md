# Supabase 数据库接入

Web 端的数据层由 Supabase（Postgres + PostgREST）提供，包含两张表：

| 表 | 用途 | 代码位置 |
| --- | --- | --- |
| `public.users` | 注册用户（邮箱、bcrypt 密码哈希） | `lib/db.ts` |
| `public.analyses` | 每次视频分析记录（含时间轴、评分、难度、收藏下标） | `lib/supabase/analysis-repo.ts` |

RLS 默认全部关闭给外部角色，只有服务端用 `service_role` 读写；浏览器端不直连数据库，
所有请求都经过 `/api/auth/*` 与 `/api/analyses/*`。

## 一、创建项目

1. 打开 <https://supabase.com/dashboard>，注册 / 登录。
2. **New project**：填写名称（如 `crux-bouldering-ai`）、数据库密码（记下来）、区域（国内用户建议选新加坡 `ap-southeast-1`）。
3. 等待项目初始化完成（约 1–2 分钟）。

## 二、建表

1. 左侧 **SQL Editor** → **New query**。
2. 粘贴 `supabase/migrations/0001_init.sql` 全部内容 → **Run**。
3. 在 **Table Editor** 中确认出现 `users`、`analyses` 两张表。

> 也可以用 Supabase CLI：`supabase link --project-ref <你的项目ref>` 后执行 `supabase db push`。

## 三、拿密钥并写入环境变量

**Project Settings → API**：

| 控制台字段 | 环境变量 | 说明 |
| --- | --- | --- |
| Project URL | `NEXT_PUBLIC_SUPABASE_URL` | 形如 `https://xxxx.supabase.co` |
| `anon` `public` | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 公开密钥，配合 RLS 使用 |
| `service_role` `secret` | `SUPABASE_SERVICE_ROLE_KEY` | **绝不能暴露到浏览器** |

**Project Settings → Database → Connection string → URI**（仅迁移/脚本用，可选）：

```env
SUPABASE_DB_URL=postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres
```

把以上变量写进本地 `.env.local`，部署时写进 Vercel 的环境变量（Production / Preview / Development 都要）。
登录功能还需要 `AUTH_SECRET`（≥16 位随机字符串）。

## 四、验证

```bash
npm run dev
```

1. 打开 `/auth/register` 注册一个账号 → 应该在 `users` 表看到新行。
2. 打开 `/analyze` 完成一次分析 → 登录状态下会在 `analyses` 表看到新行；未登录时只存本地 IndexedDB。

## 五、可选：命令行访问

需要 `psql` 或 Supabase CLI。设置好 `SUPABASE_DB_URL` 后：

```bash
psql "$SUPABASE_DB_URL" -f supabase/migrations/0001_init.sql
```

## 数据流

```
/analyze          本地 IndexedDB 写入（含视频 Blob）
                  └─ 已登录 → POST /api/analyses ──► Supabase analyses
/analysis/[id]    本地读取；本地没有则 GET /api/analyses/:id 回源并缓存
/auth/*           Supabase users（service_role）+ JWT 会话 Cookie
```

视频文件本身仍存在浏览器本地 / Vercel Blob，不入库；云端只同步分析文本、缩略图与元数据。
