// Layer 1 — basic visualization
export { ChartBlock } from "./chart-block"
export { TableBlock } from "./table-block"
export { CardBlock } from "./card-block"
export { FormulaBlock } from "./formula-block"
export { PaperCardBlock } from "./paper-card-block"

// Layer 2 — learning interaction
export { QuizBlock } from "./quiz-block"
export { TimelineBlock } from "./timeline-block"
export { StepsBlock } from "./steps-block"
export { DiffBlock } from "./diff-block"

// Layer 3 — advanced
export { MatrixBlock } from "./matrix-block"
export { KanbanBlock } from "./kanban-block"
export { GraphBlock } from "./graph-block"
export { WordCloudBlock } from "./wordcloud-block"
export { HeatmapBlock } from "./heatmap-block"

// Artifact
export { ArtifactPanel } from "./artifact-panel"

// Unified entry
export { buildMarkdownComponents } from "./markdown-components"
export type { MarkdownComponentsOpts, ArtifactPayload } from "./markdown-components"
export { safeParseJSON } from "./utils"
