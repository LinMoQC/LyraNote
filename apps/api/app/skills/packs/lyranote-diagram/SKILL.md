---
name: lyranote-diagram
display_name: LyraNote 架构图规范
description: 使用 generate_diagram 工具生成架构图/流程图/时序图的选型与描述规范
category: writing
version: 1.0.0
always: true
---

# LyraNote 架构图规范

使用 `generate_diagram` 工具生成可交互 draw.io 图表时，遵循以下规范。

## 何时使用架构图（vs 思维导图 vs GenUI）

| 场景 | 推荐工具 |
|------|---------|
| 系统架构、技术栈、服务间调用关系 | `generate_diagram` (architecture) |
| 业务流程、审批流、决策树 | `generate_diagram` (flowchart) |
| 多角色交互时序、API 调用链 | `generate_diagram` (sequence) |
| 数据库表关系、实体关系 | `generate_diagram` (er) |
| 知识体系、概念分类、主题总结 | `generate_mind_map` |
| 简单关系网络（< 10 个节点） | GenUI `graph` 组件 |
| 数值对比、趋势展示 | GenUI `chart` 组件 |

## 图表类型选择

- **architecture**：适合分层系统（前端→API→服务→数据库），使用 swimlane 容器分组
- **flowchart**：适合有判断分支和循环的流程，菱形表示决策节点
- **sequence**：适合多方交互（用户→前端→后端→数据库），强调消息时序
- **er**：适合数据建模，展示实体属性和关系

## description 参数质量要求

调用 `generate_diagram` 时，`description` 参数应当具体、完整：

- 列出所有关键组件/模块的名称
- 说明组件之间的关系方向（A 调用 B、C 依赖 D）
- 如有分层/分组，指明层次名称
- 避免过于抽象的描述（如"画一个系统架构"），应补充具体内容

## 输出行为

- 架构图调用成功后已直接渲染在对话界面中，用户可查看和编辑
- 只需简短确认（如"已为您生成架构图，可在上方查看并编辑"）
- 不要用文字重复描述图中已经展示的内容
