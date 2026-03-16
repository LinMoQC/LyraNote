# i18n 未翻译文本扫描报告

> 生成时间：2026/3/11 19:24:27
> 扫描目录：`/Users/kaihuang/Desktop/毕业设计/LyraNote/web/src`

## 统计摘要

| 指标 | 数量 |
|------|------|
| 包含中文的文件数 | 33 |
| **未使用翻译 Hook（需处理）** | **30** |
| 已有翻译 Hook 但有中文行 | 3 |
| 中文字符串总行数 | 421 |

---

## 优先级 🔴 — 未使用翻译 Hook 的文件

> 这些文件完全没有接入 i18n，所有中文文本都是硬编码。

### `src/app/(auth)/login/page.tsx`

| 行号 | 内容 |
|------|------|
| 18 | `username: z.string().min(1, "请输入用户名"),` |
| 19 | `password: z.string().min(1, "请输入密码"),` |
| 48 | `setError("用户名或密码错误，请重试")` |
| 72 | `<p className="text-xs text-muted-foreground/60">个人知识库助手</p>` |
| 84 | `<h1 className="text-xl font-semibold text-foreground">欢迎回来</h1>` |
| 85 | `<p className="mt-0.5 text-sm text-muted-foreground">登录以继续使用你的知识库</p>` |
| 92 | `用户名` |
| 96 | `placeholder="输入用户名"` |
| 113 | `密码` |
| 119 | `placeholder="输入密码"` |
| 171 | `登录` |
| 184 | `私有化部署 · 数据由你掌控` |

### `src/app/(marketing)/page.tsx`

| 行号 | 内容 |
|------|------|
| 9 | `title: "多源聚合",` |
| 10 | `description: "PDF、网页、音频、文档，一键导入，统一索引，在同一个笔记本内跨源阅读与引用。",` |
| 16 | `title: "沉浸式编辑",` |
| 17 | `description: "富文本编辑器与来源面板并排呈现，写作时随时跳转引用原文，保持上下文不中断。",` |
| 24 | `description: "基于你导入的来源回答问题、生成摘要、提炼洞察，每条回复附带原文索引。",` |
| 29 | `{ value: "3×", label: "研究效率提升" },` |
| 30 | `{ value: "∞", label: "来源数量上限" },` |
| 31 | `{ value: "< 1s", label: "向量检索延迟" },` |
| 79 | `进入工作台` |
| 89 | `向量检索 · 多模态来源 · AI Copilot` |
| 94 | `让研究与写作{" "}` |
| 99 | `真正融为一体` |
| 104 | `LyraNote 将来源管理、笔记编写与 AI 助手整合到同一个工作台——不再在标签页之间切换，专注于思考本身。` |
| 113 | `免费开始使用` |
| 120 | `查看 Demo 笔记本` |
| 145 | `<p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-white/30">来源</p>` |
| 147 | `{ name: "季度报告.pdf", active: true, type: "PDF" },` |
| 148 | `{ name: "用户访谈录音", active: false, type: "Audio" },` |
| 149 | `{ name: "竞品分析文档", active: false, type: "Doc" },` |
| 150 | `{ name: "技术白皮书", active: false, type: "PDF" },` |
| 164 | `<p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-white/30">笔记</p>` |
| 166 | `<p className="font-semibold text-white/90 text-base">AI 产品研究综合报告</p>` |
| 168 | `根据季度报告的数据，市场对 AI 写作工具的需求在 Q3 同比增长 <span className="rounded bg-indigo-500/20 px-1 text-indigo-300">142%</span>，但用户留存率普遍低于` |
| 171 | `核心瓶颈在于工具碎片化——用户需要在阅读、笔记、AI 三个独立工具间频繁切换，造成上下文丢失。` |
| 174 | `继续输入...` |
| 184 | `总结来源中的核心风险点` |
| 187 | `根据季度报告 [1] 和竞品文档 [3]，主要风险集中在用户留存与功能定价两个维度...` |
| 211 | `核心能力` |
| 213 | `<h2 className="text-3xl font-bold text-white">专为深度研究而生</h2>` |
| 214 | `<p className="mt-3 text-white/40">三个能力模块，覆盖从信息摄入到知识输出的完整链路</p>` |
| 241 | `毕业设计演示版本` |
| 243 | `<h2 className="text-2xl font-bold text-white">准备好开始了吗？</h2>` |
| 244 | `<p className="mt-2 text-white/45 text-sm">直接进入工作台，或先打开 Demo 笔记本体验完整功能。</p>` |
| 250 | `进入工作台` |
| 257 | `Demo 笔记本` |
| 264 | `LyraNote · 毕业设计项目 · 向量增强知识管理系统` |

### `src/app/setup/page.tsx`

| 行号 | 内容 |
|------|------|
| 34 | `username: z.string().min(2, "用户名至少 2 位"),` |
| 35 | `password: z.string().min(6, "密码至少 6 位"),` |
| 37 | `avatar_url: z.string().url("请输入有效的图片链接").optional().or(z.literal("")),` |
| 40 | `message: "两次密码不一致",` |
| 45 | `openai_api_key: z.string().min(1, "API Key 不能为空"),` |
| 46 | `openai_base_url: z.string().url("请输入有效的 URL").optional().or(z.literal("")),` |
| 53 | `ai_name: z.string().min(1, "名称不能为空").max(20, "最多 20 字"),` |
| 73 | `ctx.addIssue({ code: "custom", path: ["storage_s3_endpoint_url"], message: "端点地址不能为空" })` |
| 75 | `ctx.addIssue({ code: "custom", path: ["storage_region"], message: "地域不能为空" })` |
| 77 | `ctx.addIssue({ code: "custom", path: ["storage_s3_bucket"], message: "Bucket 不能为空" })` |
| 79 | `ctx.addIssue({ code: "custom", path: ["storage_s3_access_key"], message: "Access Key 不能为空" })` |
| 81 | `ctx.addIssue({ code: "custom", path: ["storage_s3_secret_key"], message: "Secret Key 不能为空" })` |
| 124 | `{ value: "local", label: "本地存储", desc: "无需配置" },` |
| 125 | `{ value: "minio", label: "MinIO",    desc: "自托管" },` |
| 126 | `{ value: "s3",    label: "AWS S3",   desc: "亚马逊云" },` |
| 127 | `{ value: "oss",   label: "阿里云 OSS", desc: "国内高速" },` |
| 128 | `{ value: "cos",   label: "腾讯 COS",  desc: "国内高速" },` |
| 134 | `{ icon: User,         label: "账户",    desc: "登录凭据与头像" },` |
| 135 | `{ icon: KeyRound,     label: "AI 配置", desc: "OpenAI 接口与模型" },` |
| 136 | `{ icon: Database,     label: "存储",    desc: "文件存储方式" },` |
| 137 | `{ icon: Sparkles,     label: "个性化",  desc: "助手偏好与职业" },` |
| 138 | `{ icon: CheckCircle2, label: "完成",    desc: "" },` |
| 305 | `"初始化失败，请重试"` |
| 333 | `<p className="text-2xl font-bold leading-snug text-foreground">初始化<br />设置向导</p>` |
| 334 | `<p className="mt-2 text-sm text-muted-foreground">完成以下步骤以开始使用 LyraNote</p>` |
| 341 | `<p className="text-[11px] text-muted-foreground/40">LyraNote · 个人知识库</p>` |
| 375 | `<p className="font-semibold text-foreground">创建管理员账户</p>` |
| 376 | `<p className="mt-0.5 text-xs text-muted-foreground">设置您的登录凭据</p>` |
| 379 | `<Field label="用户名" error={accountForm.formState.errors.username?.message}>` |
| 383 | `<Field label="密码" error={accountForm.formState.errors.password?.message}>` |
| 387 | `<Field label="确认密码" error={accountForm.formState.errors.confirmPassword?.message}>` |
| 392 | `label="头像链接（可选）"` |
| 410 | `onError={() => accountForm.setError("avatar_url", { message: "图片加载失败" })}` |
| 423 | `下一步` |
| 440 | `<p className="font-semibold text-foreground">配置 AI</p>` |
| 441 | `<p className="mt-0.5 text-xs text-muted-foreground">OpenAI 兼容接口 · 对话 · Embedding</p>` |
| 449 | `label="Base URL（可选）"` |
| 450 | `hint="官方接口无需修改；国内代理填入完整 URL"` |
| 457 | `<Field label="对话模型" error={aiForm.formState.errors.llm_model?.message}>` |
| 468 | `<Field label="Embedding 模型" error={aiForm.formState.errors.embedding_model?.message}>` |
| 479 | `<Field label="Tavily API Key（可选）" hint="用于联网搜索，不填则禁用搜索工具">` |
| 495 | `下一步` |
| 513 | `<p className="font-semibold text-foreground">配置文件存储</p>` |
| 514 | `<p className="mt-0.5 text-xs text-muted-foreground">选择上传资料的存储方式</p>` |
| 560 | `label={storageBackend === "minio" ? "MinIO 端点地址" : "OSS Endpoint"}` |
| 574 | `label="地域 Region"` |
| 587 | `label={storageBackend === "cos" ? "Bucket（含 AppID）" : "Bucket 名称"}` |
| 631 | `下一步 <ChevronRight size={15} className="transition-transform duration-200 group-hover:translate-x-0.5" />` |
| 648 | `<p className="font-semibold text-foreground">个性化设置</p>` |
| 649 | `<p className="mt-0.5 text-xs text-muted-foreground">告诉 AI 关于你的信息，获得更精准的帮助</p>` |
| 653 | `<Field label="AI 助手名称" error={personalityForm.formState.errors.ai_name?.message} hint="这是你的 AI 助手的称呼">` |
| 657 | `<Field label="您的职业（可选）" hint="帮助 AI 理解你的专业背景">` |
| 658 | `<Input placeholder="e.g. 研究员、工程师、学生、产品经理" {...personalityForm.register("user_occupation")} />` |
| 661 | `<Field label="兴趣与偏好（可选）" hint="AI 会在回答中优先考虑这些领域">` |
| 663 | `placeholder="e.g. 机器学习、产品设计、投资研究、前端开发…"` |
| 679 | `<span>高级：自定义 System Prompt</span>` |
| 680 | `<span className="opacity-50">展开 ↓</span>` |
| 684 | `placeholder={"你是一位专业的 AI 助手，请以严谨、简洁的方式回答问题…"}` |
| 689 | `<p className="mt-1 text-[11px] text-muted-foreground/60">留空则使用默认 System Prompt</p>` |
| 711 | `? <><Loader2 size={14} className="animate-spin" /> 初始化中…</>` |
| 712 | `: <>完成设置 <CheckCircle2 size={14} className="opacity-70" /></>` |
| 738 | `<p className="text-lg font-semibold text-foreground">设置完成！</p>` |
| 739 | `<p className="mt-1 text-sm text-muted-foreground">正在跳转到 LyraNote…</p>` |

### `src/components/home/notebook-list.tsx`

| 行号 | 内容 |
|------|------|
| 61 | `{formatDate(notebook.updatedAt)} · {notebook.sourceCount} 个来源` |

### `src/components/settings/settings-modal.tsx`

| 行号 | 内容 |
|------|------|
| 52 | `general: "通用",` |
| 53 | `appearance: "外观",` |
| 54 | `account: "账号",` |
| 55 | `ai: "AI 配置",` |
| 56 | `personality: "AI 个性化",` |
| 57 | `memory: "AI 记忆",` |
| 58 | `storage: "存储",` |
| 59 | `notify: "通知",` |
| 60 | `security: "安全",` |
| 71 | `placeholder = "请选择…",` |
| 219 | `{saving ? "保存中…" : saved ? "已保存" : "保存"}` |
| 256 | `<SettingRow label="语言" description="选择界面显示语言">` |
| 259 | `options={[{ value: "zh", label: "中文" }, { value: "en", label: "English" }]}` |
| 263 | `<SettingRow label="编辑器字体大小" description="笔记编辑区域的基础字号">` |
| 270 | `<SettingRow label="自动保存" description="离开编辑区时自动保存草稿">` |
| 283 | `<SettingRow label="主题" description="选择界面配色方案">` |
| 296 | `{th === "light" ? "浅色" : "深色"}` |
| 328 | `} catch { setProfileError("保存失败，请重试"); }` |
| 334 | `if (newPw !== confirmPw) { setPwError("两次密码不一致"); return; }` |
| 335 | `if (newPw.length < 6) { setPwError("新密码至少 6 位"); return; }` |
| 344 | `setPwError(detail ?? "修改失败，请检查旧密码");` |
| 361 | `<p className="text-xs text-muted-foreground">{user?.email ?? "本地账户"}</p>` |
| 366 | `<p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">编辑资料</p>` |
| 367 | `<FieldInput label="显示名称" value={name} onChange={setName} placeholder={user?.username ?? "输入名称"} />` |
| 369 | `<p className="text-sm font-medium">头像 URL</p>` |
| 389 | `<p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">修改密码</p>` |
| 390 | `<FieldInput label="当前密码" type="password" value={oldPw} onChange={setOldPw} placeholder="输入当前密码" />` |
| 391 | `<FieldInput label="新密码" type="password" value={newPw} onChange={setNewPw} placeholder="至少 6 位" />` |
| 392 | `<FieldInput label="确认新密码" type="password" value={confirmPw} onChange={setConfirmPw} placeholder="再次输入新密码" />` |
| 420 | `} catch { setError("保存失败，请重试"); }` |
| 428 | `<FieldInput label="OpenAI API Key" description="用于访问 LLM 和 Embedding 服务" type="password"` |
| 431 | `placeholder={form.openai_api_key === "••••••••" ? "已设置（留空不修改）" : "sk-..."} />` |
| 432 | `<FieldInput label="API Base URL" description="OpenAI 兼容代理地址，留空使用官方接口"` |
| 435 | `<FieldSelectRow label="LLM 模型" description="用于对话和推理的主模型"` |
| 439 | `<FieldSelectRow label="Embedding 模型" description="用于知识库向量化"` |
| 443 | `<FieldInput label="Tavily API Key" description="联网搜索功能，留空则禁用" type="password"` |
| 446 | `placeholder={form.tavily_api_key === "••••••••" ? "已设置（留空不修改）" : "tvly-..."} />` |
| 473 | `} catch { setError("保存失败，请重试"); }` |
| 485 | `<p className="text-sm font-medium">自定义 System Prompt</p>` |
| 486 | `<p className="text-xs text-muted-foreground">追加到默认系统提示词末尾，用于定制 AI 行为风格</p>` |
| 488 | `placeholder="例：请保持简洁，用列表回答，避免长篇大论。" rows={5}` |
| 507 | `{ value: "local", label: "本地存储",   desc: "无需配置" },` |
| 508 | `{ value: "minio", label: "MinIO",      desc: "自托管" },` |
| 509 | `{ value: "s3",    label: "AWS S3",     desc: "亚马逊云" },` |
| 510 | `{ value: "oss",   label: "阿里云 OSS", desc: "国内高速" },` |
| 511 | `{ value: "cos",   label: "腾讯 COS",   desc: "国内高速" },` |
| 533 | `} catch { setError("保存失败，请重试"); }` |
| 542 | `<p className="text-sm font-medium">存储后端</p>` |
| 563 | `<FieldInput label="端点地址 (Endpoint)" description={backend === "minio" ? "MinIO 服务地址" : "OSS 域名"}` |
| 568 | `<FieldInput label="地域 (Region)" description={backend === "s3" ? "AWS 地域" : "腾讯 COS 地域"}` |
| 578 | `placeholder={form.storage_s3_access_key === "••••••••" ? "已设置（留空不修改）" : "Access Key ID"} />` |
| 582 | `placeholder={form.storage_s3_secret_key === "••••••••" ? "已设置（留空不修改）" : "Secret Access Key"} />` |
| 613 | `} catch { setError("保存失败，请重试"); }` |
| 621 | `<FieldInput label="通知邮箱" description="接收系统通知的邮箱地址"` |
| 625 | `<p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">SMTP 发件服务器</p>` |
| 629 | `<FieldInput label="密码" type="password"` |
| 632 | `placeholder={form.smtp_password === "••••••••" ? "已设置（留空不修改）" : "SMTP 密码或授权码"} />` |
| 633 | `<FieldInput label="发件人地址" description="邮件显示的 From 地址"` |
| 650 | `setTestMsg("✓ 测试邮件发送成功（功能待接入）");` |
| 657 | `发送测试邮件` |
| 667 | `{ id: "github",  label: "GitHub",  icon: "https://github.githubassets.com/favicons/favicon.svg",     desc: "使用 GitHub 账号` |
| 668 | `{ id: "google",  label: "Google",  icon: "https://www.google.com/favicon.ico",                        desc: "使用 Google 账` |
| 679 | `<p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">第三方登录</p>` |
| 680 | `<p className="mt-1 text-xs text-muted-foreground/70">绑定第三方账号后可快速登录（功能开发中）</p>` |
| 697 | `即将支持` |
| 705 | `<p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">会话管理</p>` |
| 706 | `<SettingRow label="当前会话" description="基于 JWT cookie，有效期 30 天">` |
| 712 | `退出登录` |
| 742 | `} catch { setError("保存失败，请重试"); }` |
| 751 | `<p className="font-medium text-foreground/80">什么是 AI 记忆？</p>` |
| 752 | `<p>这是 AI 对你的长期了解，每次对话时都会读取这份文档。你可以写入个人背景、研究方向、重要偏好等信息，也可以让 AI 在对话中自动更新它。</p>` |
| 753 | `{updatedAt && <p className="pt-1 opacity-60">上次更新：{new Date(updatedAt).toLocaleString("zh-CN")}</p>}` |
| 757 | `<p className="text-sm font-medium">全局记忆文档</p>` |
| 758 | `<p className="text-xs text-muted-foreground">Markdown 格式，AI 每次对话都会读取</p>` |
| 762 | `placeholder={"例：\n## 关于我\n- 软件工程师，专注 AI 方向\n- 正在研究大语言模型在知识管理中的应用\n\n## 偏好\n- 回答请简洁，使用列表格式\n- 中文为主"}` |
| 826 | `<p className="mb-2 px-3 text-base font-semibold">设置</p>` |

### `src/components/ui/select.tsx`

| 行号 | 内容 |
|------|------|
| 45 | `placeholder = "请选择…",` |

### `src/components/ui/theme-toggle.tsx`

| 行号 | 内容 |
|------|------|
| 40 | `title={isDark ? "切换亮色模式" : "切换暗色模式"}` |
| 52 | `{isDark ? "亮色模式" : "暗色模式"}` |

### `src/features/chat/chat-view.tsx`

| 行号 | 内容 |
|------|------|
| 68 | `if (days === 1) return "昨天";` |
| 69 | `if (days < 7) return '${days}天前';` |
| 102 | `const CITATION_RE = /\[来源(\d+)\]\|\[\[(\d+)\]\]\|\[(\d+)\]/g` |
| 188 | `<span>引用来源 · {citations.length}</span>` |
| 225 | `{ icon: Lightbulb, text: "帮我分析知识库中的核心主题" },` |
| 226 | `{ icon: FileText,  text: "为我的研究生成一份结构化摘要" },` |
| 227 | `{ icon: Globe,     text: "对比不同来源中的相似观点" },` |
| 228 | `{ icon: BookOpen,  text: "根据笔记内容生成学习计划" },` |
| 496 | `createConversation(globalNotebookId, '深度研究：${text.slice(0, 40)}')` |
| 573 | `title: event.note_title ?? "AI 草稿",` |
| 588 | `prev.map((m) => m.id === assistantId ? { ...m, content: "请求失败，请重试。" } : m)` |
| 643 | `新建对话` |
| 649 | `{[{ label: "今天", items: today }, { label: "昨天", items: yesterday }, { label: "更早", items: older }]` |
| 682 | `<span className="flex-1 truncate pr-1">{conv.title ?? "新对话"}</span>` |
| 720 | `重命名` |
| 733 | `删除对话` |
| 756 | `发送第一条消息<br />开始对话` |
| 797 | `删除对话？` |
| 800 | `将删除{" "}` |
| 802 | `&ldquo;{deleteTargetConv.title ?? "新对话"}&rdquo;` |
| 806 | `此操作无法撤销。` |
| 819 | `取消` |
| 829 | `: "删除"` |
| 853 | `<span className="flex-1">已创建笔记《{noteCreatedAlert.title}》</span>` |
| 863 | `前往查看` |
| 1044 | `需要我为你做些什么？` |
| 1052 | `基于你的全局知识库进行检索与分析` |
| 1102 | `placeholder={isDeepResearch ? "描述你想深入研究的课题…" : "向你的知识库提问…"}` |
| 1120 | `全局知识库` |
| 1131 | `title={isDeepResearch ? "切换为普通提问" : "切换为深度研究模式"}` |
| 1134 | `深度研究` |
| 1169 | `按 Enter 发送 · Shift+Enter 换行` |

### `src/features/chat/deep-research-progress.tsx`

| 行号 | 内容 |
|------|------|
| 155 | `{c.title \|\| "内部来源"}` |
| 161 | `<p className="text-[10px] text-cyan-400/50">来自网络搜索</p>` |
| 192 | `{isDone ? "深度研究完成" : "深度研究中…"}` |
| 198 | `{mode === "quick" ? "快速模式" : "深度模式"}` |
| 220 | `<span className="text-xs font-medium text-foreground/70">规划研究方向</span>` |
| 308 | `{isDone ? "报告已生成" : "正在撰写报告…"}` |
| 330 | `<span className="text-xs font-semibold text-foreground/80">研究报告</span>` |
| 333 | `{doneCitations.length} 个来源` |
| 347 | `网络来源` |

### `src/features/copilot/agent-steps.tsx`

| 行号 | 内容 |
|------|------|
| 22 | `label: "正在检索知识库",` |
| 27 | `label: "正在生成摘要",` |
| 32 | `label: "正在创建笔记",` |
| 37 | `label: "正在保存偏好",` |
| 42 | `label: "正在搜索网络",` |
| 80 | `label: step.tool ?? "工具调用",` |
| 186 | `{content.slice(0, 80) \|\| "完成"}` |
| 266 | `查看推理过程` |
| 362 | `<span className="py-1.5 text-[11px] text-muted-foreground/40">思考中…</span>` |

### `src/features/copilot/chat-message-bubble.tsx`

| 行号 | 内容 |
|------|------|
| 17 | `const CITATION_RE = /【来源(\d+)】\|【(\d+)】\|\[来源(\d+)\]\|\[\[(\d+)\]\]\|\[(\d+)\]/g` |
| 22 | `.replace(/【来源\d+】\|【\d+】\|\[来源\d+\]\|\[\[\d+\]\]\|\[\d+\]/g, "")` |
| 33 | `return '\n\n**参考来源**\n\n${lines.join("\n\n")}'` |
| 82 | `<span>引用来源 · {citations.length}</span>` |
| 272 | `title="插入文字内容到编辑器"` |
| 281 | `{insertState === "done" ? "已插入" : "插入文字"}` |
| 294 | `title="将思维导图嵌入编辑器"` |
| 307 | `{insertMindMapState === "done" ? "已嵌入" : "插入导图"}` |

### `src/features/copilot/citation-chip.tsx`

| 行号 | 内容 |
|------|------|
| 100 | `{citation.excerpt \|\| "暂无摘要"}` |
| 133 | `引用来源` |

### `src/features/copilot/copilot-panel.tsx`

| 行号 | 内容 |
|------|------|
| 20 | `label: "总结关键洞察",` |
| 25 | `label: "生成演示大纲",` |
| 30 | `label: "提炼核心论点",` |
| 199 | `const apiPrompt = quote ? '参考以下内容：\n\n"${quote}"\n\n${prompt}' : prompt;` |
| 264 | `m.id === assistantId ? { ...m, content: "抱歉，出现了错误，请重试。" } : m` |
| 363 | `title="关闭"` |
| 377 | `基于你的笔记内容提问，AI 会结合来源给出有引用依据的回答。` |
| 475 | `placeholder="向笔记本提问…"` |
| 482 | `笔记本` |
| 500 | `Enter 发送 · Shift+Enter 换行` |

### `src/features/copilot/floating-orb.tsx`

| 行号 | 内容 |
|------|------|
| 11 | `title="打开 AI Copilot"` |

### `src/features/copilot/mind-map-view.tsx`

| 行号 | 内容 |
|------|------|
| 174 | `<span className="text-[10px] text-muted-foreground/40">{data.branches.length} 个分支</span>` |
| 180 | `title={collapsed ? "展开" : "收起"}` |
| 195 | `<span className="text-[11px] text-muted-foreground/40">正在渲染思维导图…</span>` |

### `src/features/editor/note-editor.tsx`

| 行号 | 内容 |
|------|------|
| 125 | `title: titleRef.current.trim() \|\| "无标题",` |
| 212 | `<ToolbarButton disabled={!editor?.can().undo()} label="撤销" onClick={() => editor?.chain().focus().undo().run()}>` |
| 215 | `<ToolbarButton disabled={!editor?.can().redo()} label="重做" onClick={() => editor?.chain().focus().redo().run()}>` |
| 224 | `label="标题 1"` |
| 231 | `label="标题 2"` |
| 238 | `label="标题 3"` |
| 247 | `<ToolbarButton active={editor?.isActive("bold")} label="粗体" onClick={() => editor?.chain().focus().toggleBold().run()}>` |
| 250 | `<ToolbarButton active={editor?.isActive("italic")} label="斜体" onClick={() => editor?.chain().focus().toggleItalic().run(` |
| 253 | `<ToolbarButton active={editor?.isActive("underline")} label="下划线" onClick={() => editor?.chain().focus().toggleUnderline` |
| 256 | `<ToolbarButton active={editor?.isActive("strike")} label="删除线" onClick={() => editor?.chain().focus().toggleStrike().run` |
| 259 | `<ToolbarButton active={editor?.isActive("highlight")} label="高亮" onClick={() => editor?.chain().focus().toggleHighlight(` |
| 262 | `<ToolbarButton active={editor?.isActive("code")} label="行内代码" onClick={() => editor?.chain().focus().toggleCode().run()}` |
| 269 | `<ToolbarButton active={editor?.isActive("bulletList")} label="无序列表" onClick={() => editor?.chain().focus().toggleBulletL` |
| 272 | `<ToolbarButton active={editor?.isActive("orderedList")} label="有序列表" onClick={() => editor?.chain().focus().toggleOrdere` |
| 275 | `<ToolbarButton active={editor?.isActive("blockquote")} label="引用" onClick={() => editor?.chain().focus().toggleBlockquot` |
| 278 | `<ToolbarButton active={editor?.isActive("link")} label="链接" onClick={() => {` |
| 289 | `<ToolbarButton active={editor?.isActive({ textAlign: "left" })} label="左对齐" onClick={() => editor?.chain().focus().setTe` |
| 292 | `<ToolbarButton active={editor?.isActive({ textAlign: "center" })} label="居中" onClick={() => editor?.chain().focus().setT` |
| 295 | `<ToolbarButton active={editor?.isActive({ textAlign: "right" })} label="右对齐" onClick={() => editor?.chain().focus().setT` |
| 304 | `保存中…` |
| 310 | `已保存` |
| 314 | `<span className="text-[11px] text-red-400/70">保存失败</span>` |
| 325 | `placeholder="笔记标题"` |

### `src/features/editor/selection-action-menu.tsx`

| 行号 | 内容 |
|------|------|
| 87 | `title="停止优化"` |
| 90 | `<span className="tabular-nums">优化中</span>` |
| 98 | `title="AI 直接在文中优化选中内容"` |
| 101 | `优化` |
| 115 | `引用` |

### `src/features/notebook/notebook-card.tsx`

| 行号 | 内容 |
|------|------|
| 115 | `重命名` |
| 124 | `删除` |
| 181 | `<Dialog open={open} title="编辑笔记本" onClose={onClose} className="max-w-md">` |
| 195 | `placeholder="笔记本名称"` |
| 208 | `图标` |
| 232 | `颜色` |
| 253 | `<Button disabled={loading} variant="ghost" onClick={onClose}>取消</Button>` |
| 255 | `{loading ? "保存中…" : "保存"}` |
| 290 | `<Dialog open={open} title="删除笔记本" onClose={onClose} className="max-w-sm">` |
| 293 | `确定要删除笔记本{" "}` |
| 295 | `吗？删除后所有内容将无法恢复。` |
| 299 | `<Button disabled={loading} variant="ghost" onClick={onClose}>取消</Button>` |
| 304 | `{loading ? "删除中…" : "确认删除"}` |
| 348 | `摘要` |
| 361 | `<span>{notebook.sourceCount} 个来源</span>` |
| 367 | `? '${(notebook.wordCount / 1000).toFixed(1)}k 字'` |
| 368 | `: '${notebook.wordCount} 字'}` |
| 420 | `<span>{notebook.sourceCount} 个来源</span>` |
| 426 | `? '${(notebook.wordCount / 1000).toFixed(1)}k 字'` |
| 427 | `: '${notebook.wordCount} 字'}` |
| 470 | `新建笔记本` |

### `src/features/notebook/notebook-header.tsx`

| 行号 | 内容 |
|------|------|
| 24 | `title="返回笔记本列表"` |
| 35 | `<p className="mt-0.5 text-[11px] leading-none text-muted-foreground/35">笔记本</p>` |
| 42 | `title="来源面板"` |
| 52 | `<span>来源</span>` |
| 63 | `分享` |
| 71 | `生成` |

### `src/features/notebook/notebook-toc.tsx`

| 行号 | 内容 |
|------|------|
| 125 | `添加标题后自动生成目录` |
| 139 | `目录` |

### `src/features/notebook/notebook-workspace.tsx`

| 行号 | 内容 |
|------|------|
| 23 | `ask: (text) => '解释或讨论以下内容：\n\n${text}',` |
| 24 | `polish: (text) => '把这段话改写得更清晰流畅，保持原意：\n\n${text}',` |
| 25 | `shorten: (text) => '把这段话精简缩短，保留核心信息：\n\n${text}',` |

### `src/features/notebook/notebooks-view.tsx`

| 行号 | 内容 |
|------|------|
| 59 | `<h1 className="text-2xl font-semibold tracking-tight">我的笔记本</h1>` |
| 68 | `最近` |
| 106 | `新建笔记本` |
| 149 | `description="新建一个笔记本开始整理你的知识。"` |
| 151 | `title="新建笔记本"` |
| 156 | `placeholder="笔记本名称"` |
| 167 | `取消` |
| 173 | `{creating ? "创建中…" : "创建"}` |

### `src/features/source/import-source-dialog.tsx`

| 行号 | 内容 |
|------|------|
| 106 | `setUploadError("上传失败，请检查网络后重试")` |
| 119 | `title={notebookIdProp ? "添加来源" : "添加到全局知识库"}` |
| 122 | `? "为笔记本添加学习材料，AI 将基于这些内容为你解答。"` |
| 123 | `: "来源将保存至全局知识库，可跨所有笔记本被 AI 引用。"` |
| 132 | `网页搜索` |
| 136 | `本地文件` |
| 146 | `placeholder="粘贴网址，例如 https://example.com"` |
| 159 | `添加` |
| 184 | `支持网页、文章、在线文档等链接` |
| 211 | `<p className="text-sm font-medium">拖放文件到此处</p>` |
| 213 | `支持 PDF、Word、TXT、MP3、MP4` |
| 221 | `浏览文件` |
| 272 | `取消` |
| 278 | `上传中…` |
| 283 | `已导入` |
| 286 | `"导入来源"` |

### `src/features/source/source-detail-drawer.tsx`

| 行号 | 内容 |
|------|------|
| 38 | `coarse:   { label: "粗粒度", desc: "每段约 600 字符，适合长文档概览", size: 600, overlap: 100 },` |
| 39 | `standard: { label: "标准",   desc: "每段约 512 字符，通用场景（默认）", size: 512, overlap: 64 },` |
| 40 | `fine:     { label: "精细",   desc: "每段约 256 字符，适合精准问答",    size: 256, overlap: 32 },` |
| 75 | `{chunk.token_count} 词` |
| 90 | `{expanded ? "收起" : "展开"}` |
| 197 | `<CheckCircle2 size={10} /> 已索引` |
| 201 | `<X size={10} /> 处理失败` |
| 205 | `<Loader2 size={10} className="animate-spin" /> 处理中` |
| 209 | `<span className="text-[11px] text-muted-foreground/60">{chunks.length} 个片段</span>` |
| 239 | `{t === "chunks" ? "切割片段" : "设置"}` |
| 258 | `<p className="mt-3 text-sm text-muted-foreground">正在处理，稍后自动刷新…</p>` |
| 267 | `<p className="mb-1 text-sm font-medium text-red-400">文件处理失败</p>` |
| 269 | `{source.summary ?? "无法提取文本内容，请检查文件格式。"}` |
| 275 | `<p className="py-12 text-center text-sm text-muted-foreground">暂无片段</p>` |
| 294 | `<span className="text-[13px] font-semibold text-foreground/90">切割方案</span>` |
| 296 | `选择后点击应用` |
| 337 | `重叠 {info.overlap}` |
| 360 | `? <><Loader2 size={13} className="animate-spin" />切割中…</>` |
| 361 | `: <><RefreshCw size={13} />应用并重新切割</>}` |
| 371 | `<CheckCircle2 size={12} /> 已加入队列，片段将很快更新` |
| 384 | `<span className="text-[13px] font-semibold text-foreground/90">绑定到笔记本</span>` |
| 388 | `绑定后，此来源将成为该笔记本专属知识，AI 问答时优先检索。` |
| 397 | `<option value="">选择笔记本…</option>` |
| 410 | `? <><Loader2 size={13} className="animate-spin" />绑定中…</>` |
| 411 | `: <><BookOpen size={13} />确认绑定</>}` |
| 421 | `<CheckCircle2 size={12} /> 已成功绑定到笔记本` |
| 434 | `<span className="text-[13px] font-semibold text-red-400/80">危险操作</span>` |
| 438 | `删除后将同步清除所有切割片段与向量索引，此操作` |
| 439 | `<span className="text-red-400/70"> 无法撤销</span>。` |
| 453 | `<Trash2 size={13} /> 删除此来源` |
| 466 | `<p className="mb-1 text-[13px] font-semibold text-foreground">确认删除？</p>` |
| 469 | `{" "}及其所有切割片段将被永久清除。` |
| 477 | `取消` |
| 487 | `: <><Trash2 size={11} />永久删除</>}` |

### `src/features/source/sources-panel.tsx`

| 行号 | 内容 |
|------|------|
| 29 | `processing: { label: "正在导入…", className: "text-blue-400 bg-blue-400/10", icon: Loader2 },` |
| 30 | `pending:    { label: "等待处理", className: "text-amber-400 bg-amber-400/10" },` |
| 31 | `indexed:    { label: "已就绪", className: "text-emerald-400 bg-emerald-400/10", icon: CheckCircle2 },` |
| 32 | `failed:     { label: "导入失败", className: "text-red-400 bg-red-400/10", icon: AlertCircle },` |
| 137 | `来源 · {sources.length}` |
| 144 | `title="添加来源"` |
| 153 | `title="关闭面板"` |
| 167 | `正在处理` |
| 178 | `处理失败` |
| 189 | `已就绪` |
| 199 | `<p className="text-sm text-muted-foreground">暂无来源</p>` |
| 205 | `添加第一个来源` |

### `src/lib/tiptap-mind-map.tsx`

| 行号 | 内容 |
|------|------|
| 155 | `<span className="text-[10px] text-muted-foreground/40">{data.branches.length} 个分支</span>` |
| 160 | `title="删除"` |
| 174 | `<span className="text-[11px] text-muted-foreground/40">正在渲染…</span>` |

### `src/lib/tiptap.ts`

| 行号 | 内容 |
|------|------|
| 20 | `placeholder: "开始写作……",` |

### `src/services/ai-service.ts`

| 行号 | 内容 |
|------|------|
| 32 | `'这是针对「**${prompt}**」的 AI 分析结果。\n\n**关键发现：**\n\n1. 第一个重要观点，基于来源 [1] 的深度分析\n2. 第二个核心论点，与 [2] 中的数据相印证\n3. 综合来看，该话题呈现出多维度的复杂` |
| 61 | `return '，进一步探讨与「${tail}」相关的核心概念及其应用价值。';` |
| 95 | `editorContext ? '（笔记：${editorContext.slice(0, 100)}）\n\n${prompt}' : prompt` |
| 161 | `source_title: c.source_title ?? '来源 ${i + 1}',` |

### `src/services/notebook-service.ts`

| 行号 | 内容 |
|------|------|
| 67 | `title: "全局知识库",` |
| 68 | `description: "系统全局知识库",` |

### `src/services/source-service.ts`

| 行号 | 内容 |
|------|------|
| 6 | `{ id: "source-1", notebookId: "demo-notebook", title: "季度战略报告.pdf", type: "pdf", summary: "产品扩张机会、风险集群与战略布局的深度分析。", stat` |
| 7 | `{ id: "source-2", notebookId: "demo-notebook", title: "竞品功能对比.md", type: "doc", summary: "六个核心竞品在协作、AI 辅助和定价维度的横向比较。", s` |
| 8 | `{ id: "source-3", notebookId: "demo-notebook", title: "用户访谈纪要.txt", type: "doc", summary: "12 位用户对知识管理痛点的原声反馈。", status:` |
| 9 | `{ id: "source-4", notebookId: "meeting-brief", title: "Q1 战略会议录音.mp3", type: "audio", summary: "Q1 目标对齐与资源重新分配决策摘要。", st` |
| 10 | `{ id: "source-5", notebookId: "meeting-brief", title: "产品路线图草案.pdf", type: "pdf", summary: "覆盖未来两个季度的功能优先级与里程碑。", status` |
| 11 | `{ id: "source-6", notebookId: "meeting-brief", title: "部门 OKR 文档.docx", type: "doc", summary: "各团队目标与关键结果对齐概览。", status:` |
| 12 | `{ id: "source-7", notebookId: "market-landscape", title: "行业分析报告 2026.pdf", type: "pdf", summary: "AI 工具链在知识工作者市场的渗透率与增长` |
| 13 | `{ id: "source-8", notebookId: "market-landscape", title: "竞品官网截图集合", type: "web", summary: "NotebookLM、ima、语雀的功能页面与定价对比。` |
| 14 | `{ id: "source-9", notebookId: "market-landscape", title: "技术趋势速览 2026", type: "web", summary: "RAG、多模态与 Agent 编排在知识管理领域的` |

---

## 参考 🟡 — 已有翻译 Hook 但仍含中文行

> 这些文件已部分翻译，中文可能是动态内容、占位符或待迁移的文本。

### `src/components/layout/sidebar.tsx`

| 行号 | 内容 |
|------|------|
| 269 | `退出登录` |

### `src/components/ui/language-switcher.tsx`

| 行号 | 内容 |
|------|------|
| 27 | `title={locale === "zh" ? "Switch to English" : "切换为中文"}` |
| 34 | `{locale === "zh" ? "EN" : "中"}` |
| 42 | `{locale === "zh" ? "中" : "EN"}` |

### `src/features/knowledge/knowledge-view.tsx`

| 行号 | 内容 |
|------|------|
| 30 | `"demo-notebook": "AI 产品研究综合",` |
| 31 | `"meeting-brief": "会议纪要生成器",` |
| 32 | `"market-landscape": "市场格局扫描"` |

---
*由 `scripts/scan-i18n.js` 自动生成*