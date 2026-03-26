"""
Scene Detector — L4 of the memory architecture.

Classifies each conversation turn into one of four scenes before
building the system prompt, so the AI can adapt its response strategy
to what the user is actually trying to do right now.

Scenes:
  research  — user exploring a new topic, open-ended or complex questions
  writing   — user creating content, requesting continuation / polish / feedback
  learning  — user studying a concept, needs explanation and examples
  review    — user looking up known information, needs a precise quick answer
"""

from __future__ import annotations

import logging

logger = logging.getLogger(__name__)

VALID_SCENES = {"research", "writing", "learning", "review"}

# System instructions injected per scene
SCENE_INSTRUCTIONS: dict[str, str] = {
    "research": (
        "当前场景：深度研究模式。"
        "用户正在探索一个新领域，请优先给出多角度的结构化分析，"
        "引用笔记本中已有的相关内容，并适当提出值得深入的延伸方向。"
        "鼓励批判性思考，不要只给出表面答案。"
    ),
    "writing": (
        "当前场景：写作协作模式。"
        "用户正在创作内容，请保持与用户一致的写作风格和语气，"
        "给出自然流畅、可以直接使用的建议，避免过度解释或教学式回答。"
        "输出要简洁，聚焦在帮用户把内容写好上。"
    ),
    "learning": (
        "当前场景：学习消化模式。"
        "用户正在理解或消化某个知识点，请用清晰的类比和具体例子帮助理解，"
        "循序渐进，不要一次性给太多信息。"
        "适当检验用户是否已经理解，鼓励主动思考。"
    ),
    "review": (
        "当前场景：快速查阅模式。"
        "用户在快速查找已知信息，请给出精确、简短的答案，"
        "不做不必要的展开或背景介绍，直接命中用户需要的点。"
    ),
}

SCENE_DETECTION_PROMPT = """
根据用户的最新消息，判断用户当前处于哪种场景：
- research：探索新领域、提出开放性复杂问题
- writing：创作内容、请求续写/润色/写作建议
- learning：学习某个知识点、需要解释或举例
- review：快速查找已知信息、需要精确简短的答案

用户消息："{query}"

只返回一个单词（research / writing / learning / review），不要输出其他任何内容。
""".strip()


async def detect_scene(query: str) -> str:
    """
    Lightweight scene classification.
    Uses temperature=0 and max_tokens=10 to minimise cost and latency.
    Falls back to 'research' on any error.
    """
    from app.providers.llm import chat
    from app.providers.llm import get_utility_model

    try:
        result = await chat(
            [
                {
                    "role": "system",
                    "content": "你是一个场景分类器，只输出一个单词。",
                },
                {
                    "role": "user",
                    "content": SCENE_DETECTION_PROMPT.format(query=query[:300]),
                },
            ],
            get_utility_model(),
            0.0,
            500,  # o-series reasoning models need headroom for thinking tokens
        )
        scene = result.strip().lower().split()[0] if result.strip() else "research"
        return scene if scene in VALID_SCENES else "research"
    except Exception as exc:
        logger.debug("Scene detection failed, defaulting to 'research': %s", exc)
        return "research"


def get_scene_instruction(scene: str) -> str:
    """Return the system prompt instruction block for a given scene."""
    return SCENE_INSTRUCTIONS.get(scene, SCENE_INSTRUCTIONS["research"])
