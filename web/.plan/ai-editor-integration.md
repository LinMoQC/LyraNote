# AI 与笔记编辑器深度融合方案

## 现状分析（差距）

```
NotebookWorkspace
├── NoteEditor          ← Tiptap 编辑器，完全自治，与 AI 零连接
│   └── SelectionActionMenu  ← "Ask AI" 按钮已有但未接线
└── CopilotPanel        ← 聊天面板，与编辑器完全隔离
```

两侧没有任何通信。本方案打通以下四个断点。

---

## 功能一：幽灵文字续写（Ghost Text 内联补全）

用户写完一句话、停顿约 800ms 后，光标后方出现灰色淡显的 AI 续写建议。按 **Tab** 接受，按 **Esc** 或继续打字则忽略。

### 实现原理（ProseMirror Decoration 方案）

```
用户输入
   └─ editor.on('update') 防抖 800ms
         └─ getInlineSuggestion(光标前 300 字符)
               └─ AI 返回续写文本
                     └─ DecorationSet.create → 在光标处插入幽灵 span
                           ├─ Tab 键  → insertContent(续写内容) + 清除 decoration
                           └─ 其他键  → 清除 decoration
```

**新建文件：`src/lib/tiptap-ghost-text.ts`** — 自定义 Tiptap Extension

核心细节：

- `PluginKey('ghostText')` 存储 `{ suggestion: string, pos: number }`
- `Decoration.widget(pos, dom)` 渲染 `<span class="ghost-text opacity-35 pointer-events-none">{续写内容}</span>`
- `handleKeyDown` 拦截 `Tab` → 执行 `editor.commands.insertGhostSuggestion()`，`Escape` → 清除
- 对外暴露命令：`setGhostSuggestion(text, pos)` / `clearGhostSuggestion()`

**修改：`src/lib/tiptap.ts`** — 将 `GhostText` 注册到 `tiptapExtensions`

**修改：`src/features/editor/note-editor.tsx`** — 添加防抖触发 Hook：

```ts
useEffect(() => {
  const handler = debounce(async () => {
    const { from } = editor.state.selection;
    const context = editor.state.doc.textBetween(Math.max(0, from - 300), from);
    if (context.trim().length < 20) return; // 内容太短不触发
    const suggestion = await getInlineSuggestion(context);
    editor.commands.setGhostSuggestion(suggestion, from);
  }, 800);
  editor.on('update', handler);
  return () => editor.off('update', handler);
}, [editor]);
```

**新增 API：`getInlineSuggestion(context)` 在 `src/services/ai-service.ts`**

- Mock 模式：延迟 600ms，返回固定续写示例文本
- 真实模式：`POST /api/ai/suggest { context }`，返回 `{ suggestion: string }`

### 加载状态

等待 API 期间，通过 widget decoration 在光标处显示一个小脉冲点 `•`，收到结果后替换为幽灵文字。

---

## 功能二：选中文字 AI 操作（BubbleMenu 扩展）

接线现有的 **"Ask AI"** 按钮，并新增 3 个快捷 AI 动作。

**修改：`src/features/editor/selection-action-menu.tsx`**

新版 BubbleMenu 布局：

```
B | I | S  |  Ask AI  |  优化表达  |  精简  |  引用
```

每个 AI 按钮通过 `onAskAI(selectedText, action)` 回调触发：

- **Ask AI** → 发送 `"解释或讨论：{选中文字}"` 到 CopilotPanel
- **优化表达** → 发送 `"把这段话改写得更清晰：{选中文字}"`，并提供"插回编辑器"选项
- **精简** → 发送 `"把这段话变短：{选中文字}"`

**架构关键变更：NotebookWorkspace 作为通信桥梁**

`NotebookWorkspace` 需要在 NoteEditor ↔ CopilotPanel 之间传递回调：

```
NotebookWorkspace
  editorRef: MutableRefObject<Editor | null>
  handleAskAI(text, action) → 提交到 CopilotPanel
  handleInsertToEditor(markdown) → editorRef.current.insertContent(markdown)

NoteEditor
  props: { onEditorReady(editor), onAskAI(text, action) }

CopilotPanel
  props: { onInsertToEditor(markdown), ...已有 props }
```

**修改：`src/features/notebook/notebook-workspace.tsx`** — 新增 `editorRef`、`handleAskAI`、`handleInsertToEditor`

**修改：`src/features/editor/note-editor.tsx`** — 接收 `onEditorReady` + `onAskAI` props，在 `useEffect` 中调用 `onEditorReady(editor)`

---

## 功能三：AI 回答插入编辑器

CopilotPanel 中每条 AI 助手消息增加 **"插入"** 按钮，一键将内容写入编辑器光标位置。

**修改：`src/features/copilot/chat-message-bubble.tsx`**

- 接收可选 `onInsert?: (content: string) => void` prop
- 在 assistant 气泡底部（hover 时显示）加一个小"插入"按钮

**修改：`src/features/copilot/copilot-panel.tsx`**

- 接收 `onInsertToEditor?: (content: string) => void` prop
- 将其传递给每个 `ChatMessageBubble`

**修改：`src/features/notebook/notebook-workspace.tsx`**

- `handleInsertToEditor` 调用 `editorRef.current?.chain().focus().insertContent(htmlFromMarkdown).run()`

---

## 功能四：上下文感知 Copilot

目前 CopilotPanel 发送消息时对编辑器内容一无所知。改为随每次提问附带当前笔记内容。

**修改：`src/features/notebook/notebook-workspace.tsx`**

- 每次 Copilot 提交时，快照 `editorRef.current?.getText()` 并注入 prompt payload

**修改：`src/services/ai-service.ts`** — `sendMessageStream` 新增可选参数 `editorContext?: string`

---

## 涉及文件汇总

- **新建**：`src/lib/tiptap-ghost-text.ts` — ProseMirror 幽灵文字插件 + Tiptap Extension
- **修改**：`src/lib/tiptap.ts` — 注册 GhostText 扩展
- **修改**：`src/features/editor/note-editor.tsx` — 防抖触发逻辑、新增 onEditorReady/onAskAI props
- **修改**：`src/features/editor/selection-action-menu.tsx` — 接线 Ask AI + 优化/精简按钮
- **修改**：`src/features/notebook/notebook-workspace.tsx` — editorRef 桥接、handleAskAI、handleInsertToEditor
- **修改**：`src/features/copilot/copilot-panel.tsx` — 新增 onInsertToEditor prop
- **修改**：`src/features/copilot/chat-message-bubble.tsx` — AI 回答气泡增加插入按钮
- **修改**：`src/services/ai-service.ts` — 新增 getInlineSuggestion、editorContext 参数

---

## 实施顺序

1. **NotebookWorkspace 通信桥接**（editorRef + 回调）— 这是所有功能的前置依赖
2. **Ghost Text Extension**（tiptap-ghost-text.ts + note-editor 防抖触发）
3. **选中文字 AI 操作**（接线 BubbleMenu）
4. **AI 回答插入编辑器**（Insert 按钮）
5. **编辑器内容传给 Copilot**（上下文感知）
