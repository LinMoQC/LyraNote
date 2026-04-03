"""
Built-in Skill: update_user_preference
Records explicit user preferences into the Memory V2 system.
always=True — core memory capability, cannot be disabled.
"""

from __future__ import annotations

from app.skills.base import SkillBase, SkillMeta


class UpdatePreferenceSkill(SkillBase):
    meta = SkillMeta(
        name="update-user-preference",
        display_name="记录用户偏好",
        description=(
            "记录用户明确表达的偏好，例如'以后回答请简短一点'或'我更喜欢用要点列表'。"
            "只在用户明确指示偏好时调用，不要主动猜测。"
        ),
        category="memory",
        interrupt_behavior="block",
        always=True,
        thought_label="💾 正在保存偏好",
    )

    def _build_schema(self, config: dict) -> dict:
        return {
            "name": "update_user_preference",
            "description": self.meta.description,
            "parameters": {
                "type": "object",
                "properties": {
                    "key": {
                        "type": "string",
                        "enum": [
                            # Style & output
                            "writing_style",
                            "interest_topic",
                            "technical_level",
                            "preferred_lang",
                            "domain_expertise",
                            "output_preference",
                            # Identity & relationship
                            "preferred_ai_name",   # 用户希望怎么称呼 AI
                            "user_role",           # 用户自我描述（如"老板"、"学生"）
                            "communication_tone",  # 说话语气（如"甜美"、"敬语"）
                        ],
                        "description": (
                            "偏好类型。identity 类："
                            "preferred_ai_name=用户希望的 AI 称呼，"
                            "user_role=用户的角色身份，"
                            "communication_tone=语气风格要求。"
                        ),
                    },
                    "value": {"type": "string", "description": "偏好描述，20字以内"},
                    "confidence": {
                        "type": "number",
                        "description": "置信度 0.0-1.0，用户明确说出的偏好填 0.9",
                    },
                },
                "required": ["key", "value"],
            },
        }

    async def execute(self, args: dict, ctx) -> str:
        from app.agents.memory import _upsert_memory, PREFERENCE_KEYS

        key = str(args.get("key", "")).strip()
        value = str(args.get("value", "")).strip()
        confidence = float(args.get("confidence", 0.9))

        if not key or not value:
            return "偏好记录失败：key 或 value 不能为空"

        memory_type = "preference" if key in PREFERENCE_KEYS else "fact"

        await _upsert_memory(
            ctx.db,
            ctx.user_id,
            key,
            value,
            confidence,
            memory_type,
            ttl_days=None,
            memory_kind="preference" if memory_type == "preference" else None,
        )
        await ctx.db.flush()

        return f"已记录你的偏好：{key} = {value}"


skill = UpdatePreferenceSkill()
