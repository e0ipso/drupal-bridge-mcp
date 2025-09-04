# Architecture Decision Records (ADR)

This directory contains Architecture Decision Records for the Drupalize.me MCP Server project.

## Status

| ADR                                                      | Title                                       | Status      |
| -------------------------------------------------------- | ------------------------------------------- | ----------- |
| [ADR-001](./ADR-001-llm-free-server-architecture.md)     | LLM-Free Server Architecture                | ✅ Accepted |
| [ADR-002](./ADR-002-json-rpc-markdown-transformation.md) | JSON-RPC Direct Markdown Transformation     | ✅ Accepted |
| [ADR-003](./ADR-003-oauth-authentication-strategy.md)    | OAuth 2.0 Authentication Strategy           | ✅ Accepted |
| [ADR-004](./ADR-004-technology-stack-selection.md)       | Technology Stack Selection                  | ✅ Accepted |
| [ADR-005](./ADR-005-development-tooling-choices.md)      | Development Tooling Choices                 | ✅ Accepted |
| [ADR-006](./ADR-006-project-structure-build-pipeline.md) | Project Structure and Build Pipeline Design | ✅ Accepted |

## Future Enhancements (Post-MVP)

Additional ADRs will be created for Phase 2 features:

- Dynamic Tool Discovery
- Smart Caching Strategy
- Interactive Query Refinement
- Advanced Error Handling

## ADR Template

Each ADR follows the standard template:

```markdown
# ADR-XXX: Title

## Status

[Proposed | Accepted | Rejected | Superseded]

## Context

The situation that led to this decision.

## Decision

What we decided to do.

## Rationale

Why we made this decision.

## Consequences

What happens as a result of this decision.

## Alternatives Considered

Other options that were evaluated.
```
