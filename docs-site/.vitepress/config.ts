import { defineConfig } from 'vitepress'
import { withMermaid } from 'vitepress-plugin-mermaid'

const enNav = [
  { text: 'Home', link: '/en/' },
  { text: 'Getting Started', link: '/en/getting-started' },
  {
    text: 'Features',
    items: [
      { text: 'AI Chat', link: '/en/features/ai-chat' },
      { text: 'Agentic RAG', link: '/en/features/agentic-rag' },
      { text: 'Memory System', link: '/en/features/memory-system' },
      { text: 'Knowledge Graph', link: '/en/features/knowledge-graph' },
      { text: 'Deep Research', link: '/en/features/deep-research' },
      { text: 'Scheduled Tasks', link: '/en/features/scheduled-tasks' },
      { text: 'Skills System', link: '/en/features/skills-system' },
    ],
  },
  { text: 'Deployment', link: '/en/deployment' },
]

const zhNav = [
  { text: '首页', link: '/zh/' },
  { text: '快速上手', link: '/zh/getting-started' },
  {
    text: '功能介绍',
    items: [
      { text: 'AI 对话', link: '/zh/features/ai-chat' },
      { text: 'Agentic RAG', link: '/zh/features/agentic-rag' },
      { text: '记忆系统', link: '/zh/features/memory-system' },
      { text: '知识图谱', link: '/zh/features/knowledge-graph' },
      { text: '深度研究', link: '/zh/features/deep-research' },
      { text: '定时任务', link: '/zh/features/scheduled-tasks' },
      { text: '技能系统', link: '/zh/features/skills-system' },
    ],
  },
  { text: '部署指南', link: '/zh/deployment' },
]

const enSidebar = {
  '/en/': [
    {
      text: 'Introduction',
      items: [
        { text: 'What is LyraNote?', link: '/en/' },
        { text: 'Getting Started', link: '/en/getting-started' },
      ],
    },
    {
      text: 'Features',
      items: [
        { text: 'AI Chat', link: '/en/features/ai-chat' },
        { text: 'Agentic RAG', link: '/en/features/agentic-rag' },
        { text: 'Memory System', link: '/en/features/memory-system' },
        { text: 'Knowledge Graph', link: '/en/features/knowledge-graph' },
        { text: 'Deep Research', link: '/en/features/deep-research' },
        { text: 'Scheduled Tasks', link: '/en/features/scheduled-tasks' },
        { text: 'Skills System', link: '/en/features/skills-system' },
      ],
    },
    {
      text: 'Deployment',
      items: [{ text: 'Self-Hosting Guide', link: '/en/deployment' }],
    },
  ],
}

const zhSidebar = {
  '/zh/': [
    {
      text: '介绍',
      items: [
        { text: '什么是 LyraNote？', link: '/zh/' },
        { text: '快速上手', link: '/zh/getting-started' },
      ],
    },
    {
      text: '功能介绍',
      items: [
        { text: 'AI 对话', link: '/zh/features/ai-chat' },
        { text: 'Agentic RAG', link: '/zh/features/agentic-rag' },
        { text: '记忆系统', link: '/zh/features/memory-system' },
        { text: '知识图谱', link: '/zh/features/knowledge-graph' },
        { text: '深度研究', link: '/zh/features/deep-research' },
        { text: '定时任务', link: '/zh/features/scheduled-tasks' },
        { text: '技能系统', link: '/zh/features/skills-system' },
      ],
    },
    {
      text: '部署',
      items: [{ text: '自托管部署指南', link: '/zh/deployment' }],
    },
  ],
}

export default withMermaid(defineConfig({
  title: 'LyraNote',
  description: 'AI-powered personal knowledge management system',
  ignoreDeadLinks: true,

  locales: {
    root: {
      label: 'English',
      lang: 'en-US',
      link: '/en/',
    },
    zh: {
      label: '中文',
      lang: 'zh-CN',
      link: '/zh/',
      themeConfig: {
        nav: zhNav,
        sidebar: zhSidebar,
        outline: { label: '本页目录' },
        docFooter: { prev: '上一页', next: '下一页' },
        darkModeSwitchLabel: '主题',
        sidebarMenuLabel: '菜单',
        returnToTopLabel: '回到顶部',
        langMenuLabel: '切换语言',
        search: { provider: 'local', options: { locales: { zh: { translations: { button: { buttonText: '搜索文档', buttonAriaLabel: '搜索文档' }, modal: { noResultsText: '无法找到相关结果', resetButtonTitle: '清除查询条件', footer: { selectText: '选择', navigateText: '切换' } } } } } } },
      },
    },
  },

  themeConfig: {
    logo: '/lyra.png',
    nav: enNav,
    sidebar: enSidebar,

    socialLinks: [
      { icon: 'github', link: 'https://github.com/LinMoQC/LyraNote' },
    ],

    search: {
      provider: 'local',
    },

    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2025 LyraNote',
    },
  },

  head: [
    ['link', { rel: 'icon', href: '/lyra.png' }],
  ],

  mermaid: {
    theme: 'neutral',
  },
}))
