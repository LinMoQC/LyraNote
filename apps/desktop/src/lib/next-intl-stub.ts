/**
 * Stub for next-intl in the desktop (Vite/Tauri) context.
 * All labels are hardcoded to Chinese, matching zh.json from the web app.
 */

type TFn = (key: string, params?: Record<string, unknown>) => string

const TRANSLATIONS: Record<string, Record<string, string>> = {
  genui: {
    kanbanStreaming: "正在生成看板...",
    diffStreaming: "正在生成对比...",
    diffBefore: "原文",
    diffAfter: "修改后",
    matrixStreaming: "正在生成评估矩阵...",
    matrixOption: "方案",
    matrixTotal: "综合分",
    quizStreaming: "正在生成测验...",
    "quizScore": "得分：{correct}/{total}",
    quizAllCorrect: "全部正确！",
    quizKeepGoing: "继续加油！",
    diagramTitle: "架构图",
    diagramEdit: "✏️ 编辑",
    diagramEditDone: "完成编辑",
    diagramLoading: "加载图表中…",
    artifactTitle: "交互预览",
    artifactHint: "点击打开侧边面板查看",
    artifactPreview: "预览",
    artifactSource: "源码",
    artifactLoadingPreview: "正在加载预览…",
    "mcpResultLabel": "{tool} 返回结果",
    mcpCollapse: "收起",
    mcpExpand: "展开",
    approvalHeader: "AI 请求调用 MCP 工具",
    allow: "允许",
    deny: "拒绝",
    processingAction: "处理中…",
    allowed: "已允许",
    denied: "已拒绝",
    excalidrawTitle: "🎨 Excalidraw 图表",
    "excalidrawElements": "({count} 个元素)",
    excalidrawLoading: "加载 Excalidraw 中…",
    mermaidStreaming: "正在生成图表...",
    wordcloudStreaming: "正在生成词云...",
    timelineStreaming: "正在生成时间轴...",
    tableStreaming: "正在生成表格...",
    stepsStreaming: "正在生成步骤...",
    paperCardStreaming: "正在生成论文卡片...",
    heatmapStreaming: "正在生成热力图...",
    graphStreaming: "正在生成关系图...",
    formulaStreaming: "正在渲染公式...",
    chartStreaming: "正在生成图表...",
    cardStreaming: "正在生成卡片...",
    agentViewReasoning: "查看推理过程",
    "timeCost": "用时 {label}",
    "tokenCost": "{count} tokens",
    rendering: "正在渲染思维导图…",
    "mindMapBranches": "{count} 个分支",
    "citationSources": "引用来源 · {count}",
  },
  copilot: {
    "steps.searchKnowledge": "正在检索知识库",
    "steps.generateSummary": "正在生成摘要",
    "steps.createNote": "正在创建笔记",
    "steps.savePreference": "正在保存偏好",
    "steps.searchWeb": "正在搜索网络",
    "steps.createTask": "正在创建定时任务",
    "steps.generateMindMap": "正在生成思维导图",
    "steps.generateDiagram": "正在生成架构图",
    "steps.deepRead": "正在深度阅读",
    "steps.compareSources": "正在对比来源",
    "steps.updateMemory": "正在更新记忆",
    "steps.toolCall": "工具调用",
    "steps.done": "完成",
    "steps.thinking": "思考中",
    "citationSources": "引用来源 · {count}",
    rendering: "正在渲染思维导图…",
    "mindMapBranches": "{count} 个分支",
  },
  chat: {
    reasoning: "显示思路",
    thinkingInProgress: "思考中",
    copied: "已复制",
    copy: "复制",
    like: "点赞",
    dislike: "点踩",
    regenerate: "重新生成",
    "timeCost": "用时 {label}",
    "tokenCost": "{count} tokens",
    "citationSources": "引用来源 · {count}",
  },
  common: {
    loading: "加载中…",
    cancel: "取消",
    close: "关闭",
    expand: "展开",
    collapse: "收起",
  },
}

function interpolate(template: string, params: Record<string, unknown>): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => String(params[k] ?? `{${k}}`))
}

export function useTranslations(namespace: string): TFn {
  const ns = TRANSLATIONS[namespace] ?? {}
  return function t(key: string, params?: Record<string, unknown>): string {
    const template = ns[key] ?? key
    return params ? interpolate(template, params) : template
  }
}
