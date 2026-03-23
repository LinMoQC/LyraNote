"""
Built-in Skill: generate_diagram
Generates an interactive draw.io architecture diagram from a text description.
"""

from __future__ import annotations

import re

from app.skills.base import SkillBase, SkillMeta

DIAGRAM_SYSTEM_PROMPT = """You are an expert diagram creation assistant specializing in draw.io XML generation.
Your primary function is crafting clear, well-organized visual diagrams through precise XML specifications.
ALWAYS respond in the same language as the user's last message.

When asked to create a diagram, briefly describe your plan about the layout and structure to avoid object overlapping or edge crossing objects (2-3 sentences max), then output the XML.

## Draw.io XML Structure Reference

**IMPORTANT:** You only generate the mxCell elements. The wrapper structure and root cells (id="0", id="1") are added automatically.

CRITICAL RULES:
1. Generate ONLY mxCell elements — NO wrapper tags (<mxfile>, <mxGraphModel>, <root>)
2. Do NOT include root cells (id="0" or id="1") — they are added automatically
3. ALL mxCell elements must be siblings — NEVER nest mxCell inside another mxCell
4. Use unique sequential IDs starting from "2"
5. Set parent="1" for top-level shapes, or parent="<container-id>" for grouped elements
6. Escape special characters in values: &lt; for <, &gt; for >, &amp; for &, &quot; for "
7. NEVER include XML comments (<!-- ... -->) in your generated XML

Shape (vertex) example:
<mxCell id="2" value="Label" style="rounded=1;whiteSpace=wrap;html=1;" vertex="1" parent="1">
  <mxGeometry x="100" y="100" width="120" height="60" as="geometry"/>
</mxCell>

Connector (edge) example:
<mxCell id="3" style="endArrow=classic;html=1;" edge="1" parent="1" source="2" target="4">
  <mxGeometry relative="1" as="geometry"/>
</mxCell>

## Layout Constraints
- CRITICAL: Keep all diagram elements within a single page viewport to avoid page breaks
- Position all elements with x coordinates between 0-1000 and y coordinates between 0-750
- Maximum width for containers: 960 pixels; Maximum height: 700 pixels
- Use compact, efficient layouts that fit the entire diagram in one view
- Start positioning from reasonable margins (e.g., x=40, y=40) and keep elements grouped closely
- For large diagrams, use vertical stacking or grid layouts that stay within bounds

## Edge Routing Rules

**Rule 1: NEVER let multiple edges share the same path**
- If two edges connect the same pair of nodes, they MUST exit/enter at DIFFERENT positions
- Use exitY=0.3 for first edge, exitY=0.7 for second edge (NOT both 0.5)

**Rule 2: For bidirectional connections (A↔B), use OPPOSITE sides**
- A→B: exit from RIGHT side of A (exitX=1), enter LEFT side of B (entryX=0)
- B→A: exit from LEFT side of B (exitX=0), enter RIGHT side of A (entryX=1)

**Rule 3: Always specify exitX, exitY, entryX, entryY explicitly**
- Every edge MUST have these 4 attributes set in the style
- Example: style="edgeStyle=orthogonalEdgeStyle;exitX=1;exitY=0.3;entryX=0;entryY=0.3;endArrow=classic;"

**Rule 4: Route edges AROUND intermediate shapes (obstacle avoidance) — CRITICAL!**
- Before creating an edge, identify ALL shapes positioned between source and target
- If any shape is in the direct path, you MUST use waypoints to route around it
- For DIAGONAL connections: route along the PERIMETER (outside edge) of the diagram, NOT through the middle
- Add 20-30px clearance from shape boundaries when calculating waypoint positions
- NEVER draw a line that visually crosses over another shape's bounding box

**Rule 5: Plan layout strategically BEFORE generating XML**
- Organize shapes into visual layers/zones (columns or rows) based on diagram flow
- Space shapes 150-200px apart to create clear routing channels for edges
- Mentally trace each edge: "What shapes are between source and target?"
- Prefer layouts where edges naturally flow in one direction (left-to-right or top-to-bottom)

**Rule 6: Use multiple waypoints for complex routing**
- One waypoint is often not enough — use 2-3 waypoints to create proper L-shaped or U-shaped paths
- Each direction change needs a waypoint (corner point)
- Waypoints should form clear horizontal/vertical segments (orthogonal routing)

**Rule 7: Choose NATURAL connection points based on flow direction**
- NEVER use corner connections (e.g., entryX=1,entryY=1) — they look unnatural
- For TOP-TO-BOTTOM flow: exit from bottom (exitY=1), enter from top (entryY=0)
- For LEFT-TO-RIGHT flow: exit from right (exitX=1), enter from left (entryX=0)

**Before generating XML, mentally verify:**
1. "Do any edges cross over shapes that aren't their source/target?" → If yes, add waypoints
2. "Do any two edges share the same path?" → If yes, adjust exit/entry points
3. "Are any connection points at corners (both X and Y are 0 or 1)?" → If yes, use edge centers instead
4. "Could I rearrange shapes to reduce edge crossings?" → If yes, revise layout

## Extended Examples

### Swimlane containers with children (use for layer-based architectures):
<mxCell id="lane1" value="Frontend" style="swimlane;" vertex="1" parent="1">
  <mxGeometry x="40" y="40" width="200" height="200" as="geometry"/>
</mxCell>
<mxCell id="step1" value="Step 1" style="rounded=1;whiteSpace=wrap;html=1;" vertex="1" parent="lane1">
  <mxGeometry x="20" y="60" width="160" height="40" as="geometry"/>
</mxCell>

### Two edges between same nodes (CORRECT — no overlap):
<mxCell id="e1" value="Request" style="edgeStyle=orthogonalEdgeStyle;exitX=1;exitY=0.3;entryX=0;entryY=0.3;endArrow=classic;" edge="1" parent="1" source="a" target="b">
  <mxGeometry relative="1" as="geometry"/>
</mxCell>
<mxCell id="e2" value="Response" style="edgeStyle=orthogonalEdgeStyle;exitX=0;exitY=0.7;entryX=1;entryY=0.7;endArrow=classic;" edge="1" parent="1" source="b" target="a">
  <mxGeometry relative="1" as="geometry"/>
</mxCell>

### Waypoint routing AROUND an obstacle:
<mxCell id="e3" style="edgeStyle=orthogonalEdgeStyle;exitX=0.5;exitY=0;entryX=1;entryY=0.5;endArrow=classic;" edge="1" parent="1" source="hotfix" target="main">
  <mxGeometry relative="1" as="geometry">
    <Array as="points">
      <mxPoint x="750" y="80"/>
      <mxPoint x="750" y="150"/>
    </Array>
  </mxGeometry>
</mxCell>

## Common Styles
- Shapes: rounded=1 (rounded corners), fillColor=#hex, strokeColor=#hex
- Edges: endArrow=classic/block/open/none, startArrow=none/classic, curved=1, edgeStyle=orthogonalEdgeStyle
- Text: fontSize=14, fontStyle=1 (bold), align=center/left/right
- Swimlane: swimlane;startSize=30;fillColor=none;strokeColor=#666;

Output ONLY raw mxCell XML after your brief layout plan. No markdown fences, no extra explanation.
"""


class DiagramSkill(SkillBase):
    meta = SkillMeta(
        name="generate-diagram",
        display_name="生成架构图",
        description=(
            "根据用户描述，生成一份可交互的 draw.io 架构图（流程图、系统架构图、时序图等），"
            "直接渲染在对话界面中供用户查看和编辑。"
            "当用户要求绘制架构图、流程图、系统设计图、组件关系图时调用。"
        ),
        category="knowledge",
        thought_label="📐 正在生成架构图",
    )

    def _build_schema(self, config: dict) -> dict:
        return {
            "name": "generate_diagram",
            "description": self.meta.description,
            "parameters": {
                "type": "object",
                "properties": {
                    "description": {
                        "type": "string",
                        "description": "要绘制的图表内容描述，包括涉及的组件、关系和布局要求",
                    },
                    "title": {
                        "type": "string",
                        "description": "图表标题（可选）",
                    },
                    "diagram_type": {
                        "type": "string",
                        "description": "图表类型：architecture（架构图）、flowchart（流程图）、sequence（时序图）、er（ER图）",
                        "enum": ["architecture", "flowchart", "sequence", "er"],
                    },
                },
                "required": ["description"],
            },
        }

    async def execute(self, args: dict, ctx) -> str:
        from app.providers.llm import chat

        description = args.get("description", "")
        title = args.get("title", "")
        diagram_type = args.get("diagram_type", "architecture")

        type_hints = {
            "architecture": "系统架构图：使用矩形表示服务/组件，带箭头连线表示调用/数据流",
            "flowchart": "流程图：菱形表示判断（style 用 rhombus），矩形表示步骤，圆角矩形表示开始/结束",
            "sequence": "时序图：竖向泳道（swimlane）表示角色，横向箭头表示消息传递",
            "er": "ER图：矩形表示实体，椭圆表示属性，菱形表示关系",
        }

        type_hint = type_hints.get(diagram_type, type_hints["architecture"])

        user_prompt = f"""请为以下内容生成一份详细、专业的 draw.io XML 架构图。

图表类型：{type_hint}
{f'图表标题：{title}' if title else ''}

内容描述：
{description}

要求：
- 尽量详尽，把所有重要组件都画出来，不要省略
- 使用 swimlane 容器按层次分组（如：前端层、API层、服务层、数据层）
- 使用合适的 fillColor/strokeColor 区分不同类型组件，颜色要鲜明好看（pastel 风格）
- 节点间距合理，连线不能穿越其他节点

先用 2-3 句话描述布局规划，然后输出 mxCell XML。"""

        raw = await chat(
            [
                {"role": "system", "content": DIAGRAM_SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.2,
        )

        xml = _extract_xml(raw)
        if not xml:
            return "架构图生成失败，请重试。"

        final_title = title or _infer_title(description)
        ctx.diagram_data = {"xml": xml, "title": final_title}

        return (
            f"DIAGRAM_DONE. 架构图已成功生成并以可视化卡片形式展示给用户。"
            f"标题：《{final_title}》，类型：{diagram_type}。"
            f"任务已完成，请勿再次调用任何工具。直接输出一句简短的告知即可，例如：'已为您生成架构图，可在上方查看并编辑。'"
        )


def _extract_xml(raw: str) -> str:
    """Extract mxCell XML content, stripping markdown fences and surrounding prose."""
    fenced = re.search(r"```(?:xml)?\s*([\s\S]*?)```", raw)
    if fenced:
        content = fenced.group(1).strip()
        xml_match = re.search(r"(<mxCell[\s\S]*)", content)
        return xml_match.group(1).strip() if xml_match else content

    stripped = raw.strip()
    start = re.search(r"<mxCell", stripped)
    if not start:
        return ""
    end = stripped.rfind("</mxCell>")
    if end != -1:
        return stripped[start.start():end + len("</mxCell>")].strip()
    return stripped[start.start():].strip()


def _infer_title(description: str) -> str:
    first_sentence = re.split(r"[。！？\n]", description)[0]
    return first_sentence[:20] if len(first_sentence) > 20 else first_sentence


skill = DiagramSkill()
