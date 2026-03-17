# Knowledge Graph

LyraNote automatically builds a **Knowledge Graph** from your uploaded content, extracting entities and relationships to help you discover non-obvious connections across your entire knowledge base.

## How It Works

When you upload or create a document, LyraNote's AI pipeline:

1. **Extracts entities** — People, organizations, technologies, concepts, and other named entities
2. **Identifies relationships** — Understands how entities relate based on context
3. **Merges incrementally** — New entities and relationships are merged into your existing graph

For example, from a set of AI research papers, the graph might automatically build connections like:

- `LangGraph` → _used by_ → `Deep Research Agent`
- `pgvector` → _stores_ → `Vector Embeddings`
- `Transformer` → _foundational to_ → `Attention Mechanism`

## Exploring the Graph

The graph view uses a **force-directed layout** — highly connected nodes cluster together naturally, revealing the structure of your knowledge.

### Interactions

| Action | Result |
|---|---|
| Click a node | View entity details and linked source documents |
| Drag a node | Reposition it in the layout |
| Scroll | Zoom in / zoom out |
| Double-click background | Reset the view |

### Filtering

Use the filter panel to:
- Show only specific entity types (e.g., only "Technology" or "Person")
- Search for a specific entity by name
- Limit the graph to a date range

## Notes as Knowledge Sources

LyraNote indexes not only your uploaded sources but also **your own notes**. This means:

- Notes you write in Notebook A become searchable in Notebook B's knowledge graph
- The global Chat can find and reference your personal research notes
- Your thinking and analysis become part of the knowledge network, not just the imported sources

This creates a complete **knowledge loop**: Source → AI Analysis → Note → Knowledge Base → Future AI answers.

## Use Cases

- **Research** — See how concepts in your reading notes connect to each other
- **Project planning** — Visualize dependencies between people, tools, and decisions
- **Learning** — Map out how topics in a domain relate and build on each other
- **Synthesis** — Find unexpected connections between separate research threads
