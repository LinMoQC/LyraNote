---
name: lyranote-memory
display_name: LyraNote 记忆更新规范
description: 何时以及如何使用 update_memory_doc 和 update_user_preference 工具记录用户信息
category: memory
version: 1.0.0
always: true
---

# LyraNote 记忆更新规范

## 两层记忆工具

| 工具 | 用途 | 触发时机 |
|------|------|---------|
| `update_memory_doc` | 全局记忆文档（长期，结构化 Markdown） | 用户主动告知个人信息、研究方向、重要背景 |
| `update_user_preference` | 动态偏好（写作风格、技术水平等） | 对话中隐含的偏好信号 |

## update_memory_doc 使用规范

### 何时更新
- 用户明确说出个人信息（职业、研究课题、所在机构等）
- 用户告知重要背景或约束（"我只用 Python"、"我是初学者"）
- 发现与现有记忆有实质性变化的新信息

### 操作流程
1. **先读取**现有内容（通过对话上下文获知）
2. **在原有内容基础上追加或修改**，不要直接覆盖
3. 使用 Markdown 结构化格式：

```markdown
## 基本信息
- 职业：[职业]
- 研究方向：[方向]

## 技术背景
- [技术栈/专长]

## 偏好与约束
- [重要偏好或约束]
```

### 何时不更新
- 临时性问题（"今天帮我找一篇论文"）
- 对话摘要（这是日记系统的职责，非记忆文档）
- 置信度低于 0.7 的推断

## update_user_preference 使用规范

适用于以下固定 key 的偏好更新：
- `writing_style`：简洁直接 / 详细完整
- `technical_level`：初学者 / 中级 / 专家级
- `preferred_lang`：中文 / English / 混合
- `interest_topic`：主要兴趣领域
- `output_preference`：要点列表 / 连贯段落

**规则**：只在对话中有明确信号时更新，不要猜测。
