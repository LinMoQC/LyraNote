---
layout: home

hero:
  name: "LyraNote"
  text: "Your AI-Powered Second Brain"
  tagline: Upload documents, chat with your knowledge base, run deep research, and automate recurring workflows — all in one place.
  image:
    src: /lyra.png
    alt: LyraNote
  actions:
    - theme: brand
      text: Get Started
      link: /en/getting-started
    - theme: alt
      text: View on GitHub
      link: https://github.com/LinMoQC/LyraNote

features:
  - icon: 🤖
    title: AI Chat with Your Knowledge
    details: Ask questions in natural language and get answers grounded in your own uploaded documents, notes, and URLs — powered by RAG with pgvector and a three-layer memory system that learns your preferences over time.
    link: /en/features/ai-chat
    linkText: Learn more

  - icon: 🕸️
    title: Knowledge Graph
    details: Automatically extract entities and relationships from your content. Visualize your knowledge as an interactive force-directed graph. Your own notes are indexed too, creating a complete knowledge loop.
    link: /en/features/knowledge-graph
    linkText: Learn more

  - icon: 🔬
    title: Deep Research Agent
    details: A multi-step AI agent that searches your knowledge base and the live web, evaluates evidence strength, surfaces counterpoints, and delivers a structured report with inline citations.
    link: /en/features/deep-research
    linkText: Learn more

  - icon: 📅
    title: Scheduled Tasks
    details: Tell the AI "monitor AI news daily and email me a digest" — it creates an automated workflow that runs forever. Powered by Celery Beat, Tavily web search, and SMTP delivery.
    link: /en/features/scheduled-tasks
    linkText: Learn more

  - icon: 🧩
    title: Pluggable Skills System
    details: The AI Agent's tools are organized as pluggable Skills — each can be enabled, disabled, or configured per user. Add new capabilities without touching core agent code.
    link: /en/features/skills-system
    linkText: Learn more

  - icon: ✍️
    title: Rich Text Editor with AI
    details: A Tiptap-based editor with inline AI ghost text, polish/rewrite/expand selection actions, and a writing companion that surfaces relevant knowledge base fragments as you type.
---
