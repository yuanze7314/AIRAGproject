# Architecture Addendum

## Deferred Technical Choices

- Exact package manager and scaffold command
- Exact UI component library
- Exact LLM provider and model
- Exact embedding/vector retrieval implementation
- Whether badcase storage starts as JSON or SQLite
- Whether deployment target is local only or Vercel-style hosted demo

## Implementation Notes

- Start with mock adapters if model credentials are unavailable.
- Keep all model calls behind an adapter interface.
- Keep knowledge rules editable without rebuilding core pipeline logic.
- Put safety guardrail after generation and before UI display.
- Expose intermediate pipeline output in the UI to make the demo legible.
