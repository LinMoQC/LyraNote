# LyraNote 单用户化改造 + 引导初始化

> 目标：移除 Clerk 外部依赖，替换为本地密码认证（bcrypt + HS256 JWT），并新增首次启动引导初始化向导，实现真正的个人自托管部署。

---

## 一、背景与现状

### 当前认证架构（多用户 + Clerk）

LyraNote 目前依赖 [Clerk](https://clerk.com) 作为唯一认证提供商：

- **前端**：`ClerkProvider` 包裹全局，`<SignIn />`/`<SignUp />` 使用 Clerk 托管 UI，`clerkMiddleware` 保护路由
- **后端**：通过 Clerk JWKS 端点拉取公钥，使用 RS256 验签 JWT
- **开发旁路**：`DEBUG=true` 时完全跳过认证，自动使用 `dev_user`（目前生产也依赖此旁路，因为 axios 未传 Token）

### 存在的问题

| 问题 | 影响 |
|------|------|
| 依赖 Clerk 外部 SaaS | 个人部署需要 Clerk 账号、网络访问 Clerk 服务器 |
| axios 无 Authorization 头 | 所有 API 请求依赖 `DEBUG=true` 旁路，生产不可用 |
| 没有引导初始化流程 | 部署后需手动修改 `.env` 才能使用 |
| 多用户设计（`clerk_id` + 注册页） | 个人部署无需多用户 |

---

## 二、改造目标

1. **零外部认证依赖**：本地密码（bcrypt）+ 本地签发 JWT（HS256），不需要网络
2. **单用户**：无注册页，只通过首次引导向导创建唯一管理员账户
3. **引导初始化**：首次打开浏览器时，自动检测未初始化状态，进入三步骤引导向导
4. **Session 安全**：JWT 存于 `httpOnly; SameSite=Strict` Cookie，防 XSS

---

## 三、架构变化

### 改造前后对比

```
改造前：
  浏览器 → Clerk SaaS（颁发 JWT）→ Next.js → FastAPI（JWKS 验签）

改造后：
  浏览器 → FastAPI（本地 bcrypt 验密）→ JWT → httpOnly Cookie
         → Next.js Middleware（读 Cookie 保护路由）
         → FastAPI（HS256 本地验签）
```

### 初始化检测流程

```
用户访问任意页面
      │
      ▼
  是 /setup 或 /login？
  ├─ 是 → 放行
  └─ 否 ▼
      有 lyranote_session Cookie？
      ├─ 没有 → 重定向 /login
      └─ 有 ▼
          后端 is_configured == true？
          ├─ false → 重定向 /setup（引导向导）
          └─ true  → 正常进入 /app
```

### 完整认证序列（首次部署）

```
1. 用户首次访问 /app/chat
2. Middleware 检查：无 Cookie → 重定向 /login
3. Login 页检查后端 /setup/status → { configured: false }
4. 前端自动跳转 /setup
5. 用户完成三步骤引导（账户 + AI 配置）
6. 后端 POST /setup/init → 创建用户 + 写入配置 + 返回 JWT
7. 前端设置 Cookie → 跳转 /app/chat
```

---

## 四、数据库变更

### 新增：`app_config` 表

```sql
CREATE TABLE app_config (
    key   VARCHAR(255) PRIMARY KEY,
    value TEXT
);

-- 初始数据（迁移时写入）
INSERT INTO app_config (key, value) VALUES ('is_configured', 'false');
```

运行时存储的配置项：

| key | value 示例 | 说明 |
|-----|-----------|------|
| `is_configured` | `"true"` / `"false"` | 是否已完成初始化 |
| `openai_api_key` | `"sk-..."` | 可选：通过向导写入，优先级高于 `.env` |
| `llm_model` | `"gpt-4o-mini"` | 可选：通过向导写入 |

### 修改：`users` 表

```sql
ALTER TABLE users ADD COLUMN password_hash VARCHAR(255);
```

同时移除对 `clerk_id` 字段的强依赖（保留列向下兼容，新代码不使用）。

---

## 五、后端改造详情

### 5.1 `api/app/config.py`

**删除**：
```python
clerk_jwks_url: str = ""
```

**新增**：
```python
jwt_secret: str = ""           # 部署时在 .env 中设置，为空则启动时随机生成
jwt_expire_days: int = 30      # Token 有效期（天）
```

> `jwt_secret` 为空时，每次重启 token 失效，适合开发环境。生产部署必须在 `.env` 中固定值。

### 5.2 `api/app/auth.py`（全文替换）

```python
from datetime import datetime, timedelta, timezone
from uuid import UUID
from jose import jwt, JWTError
from passlib.context import CryptContext
from app.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def hash_password(plain: str) -> str:
    return pwd_context.hash(plain)

def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)

def create_access_token(user_id: UUID) -> str:
    expire = datetime.now(timezone.utc) + timedelta(days=settings.jwt_expire_days)
    return jwt.encode(
        {"sub": str(user_id), "exp": expire},
        settings.jwt_secret,
        algorithm="HS256",
    )

def verify_local_token(token: str) -> UUID:
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
        return UUID(payload["sub"])
    except (JWTError, KeyError, ValueError) as exc:
        raise ValueError(f"Invalid token: {exc}")
```

### 5.3 `api/app/dependencies.py`

```python
async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    if credentials is None:
        raise HTTPException(status_code=401, detail="Missing Authorization header")
    
    from app.auth import verify_local_token
    user_id = verify_local_token(credentials.credentials)  # 抛 ValueError → 401
    
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=401, detail="User not found")
    return user
```

### 5.4 新建 `api/app/domains/auth/router.py`

```
POST /api/v1/auth/login
  Body: { username, password }
  成功：返回 { access_token, token_type: "bearer" }
       Set-Cookie: lyranote_session=<jwt>; HttpOnly; Path=/; SameSite=Strict; Max-Age=2592000

POST /api/v1/auth/logout
  清除 Cookie（Set-Cookie: lyranote_session=; Max-Age=0）

GET  /api/v1/auth/me
  需鉴权，返回当前用户信息 { id, username, name }
```

### 5.5 新建 `api/app/domains/setup/router.py`

```
GET  /api/v1/setup/status   （公开，无需鉴权）
  返回: { configured: bool }
  实现: 查 app_config 表 key="is_configured"

POST /api/v1/setup/init     （公开，无需鉴权）
  仅在 configured=false 时生效，否则 403
  Body: {
    username: str,
    password: str,
    openai_api_key: str,
    openai_base_url: str,   // 可选
    llm_model: str          // 可选
  }
  执行:
    1. 创建唯一 User（username + password_hash）
    2. 写入 app_config（openai_api_key 等）
    3. 将 is_configured 设为 "true"
    4. 返回 access_token（自动登录）
```

### 5.6 Alembic 迁移 `010_single_user_auth.py`

```python
def upgrade():
    op.add_column("users", sa.Column("password_hash", sa.String(255), nullable=True))
    op.create_table(
        "app_config",
        sa.Column("key", sa.String(255), primary_key=True),
        sa.Column("value", sa.Text, nullable=True),
    )
    op.execute("INSERT INTO app_config (key, value) VALUES ('is_configured', 'false')")

def downgrade():
    op.drop_column("users", "password_hash")
    op.drop_table("app_config")
```

---

## 六、前端改造详情

### 6.1 `web/src/middleware.ts`（全文替换）

```typescript
import { NextRequest, NextResponse } from 'next/server'

const PUBLIC_ROUTES = ['/', '/login', '/setup']
const SETUP_ROUTE = '/setup'

export default function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // 静态资源放行
  if (pathname.startsWith('/_next') || pathname.includes('.')) {
    return NextResponse.next()
  }

  const isPublic = PUBLIC_ROUTES.some(r => pathname.startsWith(r))
  const session = req.cookies.get('lyranote_session')?.value

  // 已登录用户访问登录/setup 页 → 跳到 app
  if (session && (pathname.startsWith('/login') || pathname.startsWith(SETUP_ROUTE))) {
    return NextResponse.redirect(new URL('/app/chat', req.url))
  }

  // 未登录访问受保护路由 → 跳登录
  if (!session && !isPublic) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  return NextResponse.next()
}
```

> **初始化检测**不在 Middleware 里做（避免每次请求调用后端 API），而是在 `/login` 页面和 workspace layout 中通过 `GET /setup/status` 判断。

### 6.2 `web/src/app/providers.tsx`

```typescript
// 删除
import { ClerkProvider } from '@clerk/nextjs'

// 替换为自定义 AuthContext
import { AuthProvider } from '@/features/auth/auth-provider'

export function Providers({ children, ...props }) {
  return (
    <AuthProvider>         {/* 替换 ClerkProvider */}
      <NextIntlClientProvider ...>
        <QueryClientProvider ...>
          <ThemeProvider ...>
            {children}
          </ThemeProvider>
        </QueryClientProvider>
      </NextIntlClientProvider>
    </AuthProvider>
  )
}
```

`AuthProvider` 内部通过 `GET /auth/me` 获取当前用户信息，对外暴露 `useAuth()` hook：
```typescript
interface AuthContext {
  user: { id: string; username: string; name: string } | null
  isLoading: boolean
  logout: () => Promise<void>
}
```

### 6.3 新建 `web/src/app/setup/page.tsx` — 三步骤引导向导

```
步骤 1 — 创建账户
  ├─ 用户名（用于登录，不可更改）
  ├─ 密码（≥8位）
  └─ 确认密码

步骤 2 — 配置 AI
  ├─ OpenAI API Key（必填）
  ├─ Base URL（可选，默认 https://api.openai.com/v1）
  └─ 模型选择（下拉：gpt-4o-mini / gpt-4o / gpt-4-turbo / 自定义）

步骤 3 — 完成
  └─ 自动调用 POST /setup/init → 登录 → 跳转 /app/chat
```

UI 使用 Shadcn `Form` + `Progress` 步骤指示器，风格与现有 auth 布局一致。

### 6.4 `web/src/app/(auth)/sign-in/page.tsx`（替换）

```typescript
// 删除 Clerk 组件
// 替换为本地登录表单：用户名 + 密码
// 登录成功后 Cookie 由后端 Set-Cookie 自动设置
// 同时检查 /setup/status，如未初始化则跳转 /setup
```

### 6.5 `web/src/lib/axios.ts`（新增拦截器）

```typescript
import Cookies from 'js-cookie'

export const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_BASE_URL || '',
  withCredentials: true,   // 携带 Cookie（同域请求自动附带）
  headers: { 'Content-Type': 'application/json' },
})

// 请求拦截器：将 Cookie 中的 token 注入 Authorization 头
// （用于跨域场景或 SSE fetch 请求）
apiClient.interceptors.request.use((config) => {
  const token = Cookies.get('lyranote_session')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// 响应拦截器：401 → 跳转登录
apiClient.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)
```

---

## 七、依赖变更

### 后端 `api/requirements.txt`

| 操作 | 包 | 原因 |
|------|----|------|
| 删除 | `httpx` | 仅用于 Clerk JWKS 拉取，改造后不再需要 |
| 新增 | `passlib[bcrypt]` | 密码 bcrypt 哈希/验证 |

> `python-jose` 已存在，无需新增。

### 前端 `web/package.json`

| 操作 | 包 | 原因 |
|------|----|------|
| 删除 | `@clerk/nextjs` | 整体移除 |
| 新增 | `js-cookie` + `@types/js-cookie` | 前端读取 httpOnly Cookie |

---

## 八、环境变量变更

### `api/.env`

```diff
- CLERK_JWKS_URL=https://...clerk.accounts.dev/.well-known/jwks.json
+ JWT_SECRET=your-random-256-bit-secret-here   # openssl rand -hex 32

# 以下配置可由引导向导写入数据库，.env 作为备用默认值
  OPENAI_API_KEY=
  LLM_MODEL=gpt-4o-mini
```

### `web/.env.local`

```diff
- NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
- CLERK_SECRET_KEY=sk_test_...
- NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
- NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
- NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/app
- NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/app
```

---

## 九、执行顺序

| 步骤 | 内容 | 影响范围 |
|------|------|---------|
| 1 | Alembic 迁移（`010_single_user_auth.py`） | DB |
| 2 | 更新 `models.py`（`password_hash` + `AppConfig`） | 后端 |
| 3 | 替换 `auth.py`（本地 HS256 JWT） | 后端 |
| 4 | 更新 `dependencies.py`（移除 Clerk） | 后端 |
| 5 | 新建 `auth/router.py` + `setup/router.py` | 后端 |
| 6 | 更新 `config.py`（`jwt_secret`） | 后端 |
| 7 | 替换 `middleware.ts` | 前端 |
| 8 | 替换 `providers.tsx`（移除 ClerkProvider） | 前端 |
| 9 | 新建 `setup/page.tsx`（引导向导） | 前端 |
| 10 | 替换 `sign-in/page.tsx`，删除 `sign-up/` | 前端 |
| 11 | 更新 `axios.ts`（拦截器） | 前端 |
| 12 | 清理所有残余 `@clerk/nextjs` 引用 | 前端 |

---

## 十、安全说明

- **密码存储**：bcrypt（`cost=12`），不可逆哈希，即使数据库泄露也无法还原明文
- **Token**：HS256 JWT，`httpOnly` Cookie 防 XSS 读取，`SameSite=Strict` 防 CSRF
- **Setup 接口保护**：`POST /setup/init` 在 `is_configured=true` 后永久返回 403
- **JWT Secret**：生产部署必须在 `.env` 中设置固定的强随机值（`openssl rand -hex 32`），否则每次重启 token 失效
