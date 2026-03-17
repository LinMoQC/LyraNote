---
layout: home

hero:
  name: "LyraNote"
  text: "你的 AI 第二大脑"
  tagline: 上传文档、与知识库对话、运行深度研究、自动化周期性工作流 — 一站式搞定。
  image:
    src: /lyra.png
    alt: LyraNote
  actions:
    - theme: brand
      text: 快速上手
      link: /zh/getting-started
    - theme: alt
      text: 查看 GitHub
      link: https://github.com/LinMoQC/LyraNote

features:
  - icon: 🤖
    title: AI 知识对话
    details: 用自然语言提问，从你上传的文档、笔记和 URL 中获取基于 RAG 的精准答案。三层记忆系统随时间学习你的偏好，让每次对话都更个性化。
    link: /zh/features/ai-chat
    linkText: 了解更多

  - icon: 🕸️
    title: 知识图谱
    details: 自动从内容中提取实体和关系，以交互式力导向图可视化你的知识。你自己写的笔记也会被索引，形成完整的知识闭环。
    link: /zh/features/knowledge-graph
    linkText: 了解更多

  - icon: 🔬
    title: 深度研究 Agent
    details: 多步骤 AI Agent，同时搜索内部知识库和实时网络，评估证据强度，主动挖掘反例，最终生成带内联引用的结构化研究报告。
    link: /zh/features/deep-research
    linkText: 了解更多

  - icon: 📅
    title: 定时任务
    details: 告诉 AI "每天监控 AI 资讯发给我" — 它会创建一个永久运行的自动化工作流。基于 Celery Beat、Tavily 网络搜索和 SMTP 邮件投递。
    link: /zh/features/scheduled-tasks
    linkText: 了解更多

  - icon: 🧩
    title: 可插拔技能系统
    details: AI Agent 的工具以可插拔 Skill 形式组织，每个 Skill 可以按用户粒度启用、禁用或配置。添加新能力无需修改 Agent 核心代码。
    link: /zh/features/skills-system
    linkText: 了解更多

  - icon: ✍️
    title: AI 增强富文本编辑器
    details: 基于 Tiptap 的编辑器，支持 AI 内联幽灵文本、选中文本的润色/改写/扩写操作，以及在你写作时自动浮现相关知识库片段的写作伴侣。
---
