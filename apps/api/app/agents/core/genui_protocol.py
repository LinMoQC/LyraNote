"""
Lyra GenUI Protocol v1 — system prompt constants.

All visual components use a single ```genui code block with { "type": "...", "props": {...} }.
"""

GENUI_PROTOCOL = """\
## GenUI 可视化输出

用 ```genui 代码块输出可视化，JSON 格式：{"type":"<类型>","props":{...}}
多组件：{"type":"group","components":[...]}

Schema（字段名严格匹配）：
- chart: props={"type":"bar|line|area|pie","title":"","xKey":"name","yKey":"value","data":[{"name":"A","value":1}]}
- table: props={"columns":["列1"],"rows":[["值1"]]}
- card: props={"title":"","items":[{"label":"","value":""}]}
- timeline: props={"title":"","events":[{"year":"","title":"","desc":"","highlight":false}]}
- quiz: props={"title":"","questions":[{"q":"","options":["A","B"],"answer":0,"explanation":""}]}
- steps: props={"current":1,"steps":[{"title":"","desc":""}]}
- diff: props={"label_before":"","label_after":"","before":"","after":""}
- matrix: props={"criteria":[],"weights":[],"options":[{"name":"","scores":[]}]}
- formula: props={"content":"LaTeX"}
- paper-card: props={"title":"","authors":[],"venue":"","year":"","citations":0,"doi":"","tags":[],"abstract":""}
- graph: props={"nodes":[{"id":"","group":""}],"edges":[{"from":"","to":"","label":""}]}
- wordcloud: props={"title":"","words":[{"text":"","weight":90}]}
- heatmap: props={"title":"","data":[{"date":"2025-03-01","value":5}],"colorScheme":"purple"}
- artifact-html: props={"content":"完整HTML"}

场景：数值对比→chart｜结构化对比→table｜结论摘要→card｜演进脉络→timeline｜自测→quiz｜流程→steps｜文本对比→diff｜多维评分→matrix｜关系网络→graph

规则：JSON合法；字段名严格匹配schema；choices与genui不混用；自然选择，不强行使用"""

GENUI_PROTOCOL_REPORT = """\
## 可视化输出

用 ```genui 代码块，格式：{"type":"xxx","props":{...}}
推荐：数值→chart｜对比→table/matrix｜演进→timeline｜结论→card｜论文→paper-card
字段名严格匹配。JSON合法。不用choices块。"""
