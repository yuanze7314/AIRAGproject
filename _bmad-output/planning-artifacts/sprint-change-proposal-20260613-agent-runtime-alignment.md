---
title: Sprint Change Proposal - Agent Runtime Alignment
status: approved
created: 2026-06-13
source_report: implementation-readiness-report-20260613-114804.md
mode: batch
---

# Sprint Change Proposal: Agent Runtime Alignment

## 1. Trigger and Context

### 1.1 Triggering Story

No single implementation story triggered this change. The issue was discovered during BMAD implementation readiness review before entering story-based development.

Relevant evidence:

- `implementation-readiness-report-20260613-114804.md` marked the project as **NOT READY** for story-based implementation.
- PRD, architecture, and epics/stories no longer fully describe the same Agent runtime mechanism.
- `story-index.md` may be stale and should not be used as the implementation source of truth.

### 1.2 Core Problem

Issue type:

- New requirement emerged from stakeholder discussion.
- Strategic refinement of the Agent architecture.
- Artifact drift after multiple planning updates.

Problem statement:

The product direction is stable, but planning artifacts are inconsistent after the latest Agent runtime decision. The latest agreed mechanism is:

Memory Adapter -> Case Understanding Agent -> Rule Guardrail -> LLM structured Query Router -> four route branches -> review/QA rewrite loop -> Template Output -> direct customer reply or human handoff.

However, the current PRD, architecture, and epics still contain legacy or mixed wording such as Smart Router-first flow, 5-Agent-only after-sales flow, inconsistent FR numbering, and incomplete story coverage for general service, reranking, vector store, memory lifecycle, and Template Output.

### 1.3 Initial Impact and Evidence

Evidence from readiness assessment:

- PRD has duplicated FR numbers, especially FR-023/024/025 and FR-060 through FR-064.
- PRD still contains legacy fields and wording in some areas, including Smart Router, 5-Agent, `detectedTopics`, and `targetGraph`.
- Epics/stories do not include an explicit FR coverage map.
- Semantic story coverage is partial, estimated around 55-65%.
- Missing or weakly modeled areas include VectorStore adapter, LanceDB/InMemory, hybrid retrieval/rerank, latest Agent mechanism, general service branch, Template Output, memory lifecycle, main UI vs log page split.
- No dedicated UX document exists. UI requirements are contained in PRD and current stories, but need stronger acceptance criteria.

## 2. Epic Impact Assessment

### 2.1 Current Epic Viability

The current epic set is partially usable but should not be treated as implementation-ready.

Existing Epic 1 and parts of Epic 2 remain useful for project foundation, UI, API, and demo data. Existing Agent-related epics need substantial consolidation and realignment around the final runtime.

### 2.2 Required Epic-Level Changes

Recommended epic rewrite structure:

1. Epic 1: Project Foundation and Demo Data
   - Next.js app foundation, local data, API skeleton, shared TypeScript contracts.

2. Epic 2: E-Commerce Customer Service Backend UI
   - Main interface limited to customer conversation and ticket management.
   - No Agent/RAG/QA details in default main view.
   - Separate log/process observation page.

3. Epic 3: Final Agent Orchestration Runtime
   - Memory Adapter.
   - Case Understanding Agent.
   - Rule Guardrail.
   - LLM structured Query Router.
   - Four route branches: `general_service`, `after_sales`, `needs_clarification`, `handoff_required`.
   - Review/QA rewrite loops.
   - Template Output.

4. Epic 4: RAG and Knowledge Infrastructure
   - Separate ordinary customer service knowledge base and after-sales rules knowledge base.
   - BM25 + Embedding recall.
   - Business filtering.
   - Cross-Encoder reranker adapter with mock fallback.
   - LanceDB default local vector store and InMemoryVectorStore adapter.

5. Epic 5: After-Sales Evidence, Risk, Reply, and QA
   - Policy & Evidence Agent.
   - Risk & Strategy Agent.
   - Reply Agent.
   - QA Agent.
   - Image evidence clues as non-final signals.

6. Epic 6: Memory Lifecycle, Observability, Badcase, and Demo Acceptance
   - 7-day memory compression.
   - 30-day detailed memory clearing.
   - Trace logging.
   - Badcase taxonomy including `wrong_route`.
   - End-to-end demo scenarios and acceptance tests.

### 2.3 Remaining Epic Impact

Affected dependencies:

- Agent runtime stories must depend on shared data contracts from Epic 1.
- UI stories must consume simplified final status from Agent runtime, not internal Agent chain details.
- RAG stories must expose grounding metadata to the log page, not the main UI.
- QA/review loop stories must finish before auto-send behavior can be considered complete.

### 2.4 Obsolete or Missing Story Areas

Obsolete or stale areas:

- Smart Router as the first runtime step.
- Pure 5-Agent after-sales-only model as the whole system architecture.
- Editable draft as final output behavior.

Missing or under-modeled areas:

- LLM structured routing after StructuredCase and Guardrail.
- Rule Guardrail before route selection.
- Ordinary customer service RAG branch.
- General Review Agent.
- Template Output Agent.
- LanceDB/InMemory VectorStore adapter.
- Hybrid retrieval and reranking story.
- Separate log/process observation page.
- Automatic customer reply after QA pass.
- Human handoff after review loop exhaustion.

### 2.5 Epic Order and Priority

Recommended order:

1. Correct PRD and architecture first.
2. Regenerate epics/stories and story-index with FR traceability.
3. Create one implementation-ready story for the first development slice.
4. Enter `bmad-dev-story`.

## 3. Artifact Conflict and Impact Analysis

### 3.1 PRD Conflicts

The MVP remains achievable. Scope does not need reduction.

Required PRD corrections:

- Renumber FRs sequentially and remove duplicate IDs.
- Replace legacy Smart Router / 5-Agent phrasing with the final four-branch runtime wording where appropriate.
- Update `RouteDecision` fields to align with latest design: `routeType`, `confidence`, `rationale`, `requiredInfo`, `riskSignals`, `guardrailApplied`, `targetFlow`.
- Remove or update stale fields such as `detectedTopics` and `targetGraph` if they conflict with final contracts.
- Update AC-019 and AC-025 to mention Query Router, four-branch Agent flow, and separate log/process observation page.
- Confirm all customer-visible outputs pass Template Output before sending.

### 3.2 Architecture Conflicts

The architecture is closer to the latest direction than the stories, but still needs cleanup to avoid mixed terminology.

Required architecture corrections:

- Make Memory -> Case Understanding -> Rule Guardrail -> Query Router the only canonical runtime entry sequence.
- Define Orchestrator as deterministic scheduling, not business judgment.
- Define Query Router as LLM structured intent routing after StructuredCase and Guardrail.
- Rework Agent runtime table to include: Memory Adapter, Case Understanding, Rule Guardrail, Query Router, General Service, General Review, Policy & Evidence, Risk & Strategy, Reply, QA, Clarification, Human Handoff, Template Output.
- Ensure diagrams show parallel Policy & Evidence plus Risk & Strategy only inside the after-sales branch.
- Ensure general service branch uses ordinary customer service RAG and General Review Agent.
- Ensure Template Output is the final gate for every route.
- Ensure output is direct customer reply or human handoff, not editable draft.

### 3.3 UI/UX Conflicts

No dedicated UX doc exists. This is acceptable for MVP if the UI requirements are embedded into stories with strong acceptance criteria.

Required UX corrections:

- Main UI must be an e-commerce customer service backend.
- Main UI should show only conversation window and ticket management.
- Agent trace, RAG TopK, prompt, QA reasoning, rerank details, and internal execution logs must move to a separate log/process observation page.
- Main UI should show customer-visible outcomes: AI reply, need more information, currently handing off to human.
- Main UI must support badcase marking and regeneration without exposing full internal reasoning by default.

### 3.4 Other Artifact Impact

Secondary artifacts requiring attention:

- `story-index.md` should be regenerated after epic/story rewrite.
- Existing code under `3c-after-sales-agent` has already partially implemented the latest direction and should be validated against corrected stories before further expansion.
- Test plan should include route correctness, QA loop behavior, Template Output validation, and RAG grounding behavior.
- No infrastructure, CI/CD, payment, logistics, or real database artifact changes are required for MVP.

## 4. Path Forward Evaluation

### 4.1 Option 1: Direct Adjustment

Status: Viable.

Description:

Update PRD, architecture, epics/stories, and story-index to align with the final runtime, then continue story-based implementation.

Effort: Medium.
Risk: Low to Medium.

Pros:

- Keeps current MVP scope intact.
- Preserves existing useful code and planning work.
- Fastest path to implementation readiness.

Cons:

- Requires careful traceability cleanup before coding continues.

### 4.2 Option 2: Rollback

Status: Not recommended.

Description:

Revert to earlier after-sales-only 5-Agent flow or Smart Router-first flow.

Effort: Medium.
Risk: High.

Reason not selected:

- It would discard clarified business logic.
- It would fail to support ordinary customer service vs after-sales separation.
- It would not match the user's final architecture decision.

### 4.3 Option 3: PRD MVP Review

Status: Not required as a scope reduction, but useful as a cleanup step.

Description:

Reduce MVP or redefine product goals.

Effort: Medium.
Risk: Medium.

Reason not selected as primary path:

- The MVP scope is still coherent.
- The problem is artifact alignment, not product infeasibility.

### 4.4 Recommended Path

Selected approach: Option 1 Direct Adjustment, with a small PRD cleanup pass first.

Rationale:

The product direction is now clearer than before. The safest next step is to update planning artifacts to reflect the final Agent mechanism, then regenerate implementation-ready stories with FR traceability. This keeps momentum while preventing developers from implementing stale stories.

## 5. Proposed Changes

### 5.1 PRD Updates

- Normalize FR numbering from start to finish.
- Remove duplicate FR IDs.
- Update all legacy Smart Router references to Query Router where the latest mechanism applies.
- Replace 5-Agent-only language with four-branch runtime language.
- Keep the after-sales branch agents separated: Policy & Evidence, Risk & Strategy, Reply, QA.
- Ensure Reply and QA are distinct agents.
- Add or preserve ordinary customer service RAG requirements.
- Add or preserve RAG retrieval/rerank requirements: BM25 + Embedding + business filtering + Cross-Encoder rerank adapter.
- Add or preserve VectorStore requirements: LanceDB default, InMemory fallback, adapter boundary.
- Ensure Template Output is explicitly required for all customer-visible responses.

### 5.2 Architecture Updates

- Re-state the canonical runtime sequence:
  Memory Adapter -> Case Understanding -> Rule Guardrail -> Query Router -> route-specific agents -> review/QA loop -> Template Output -> direct reply or handoff.
- Clarify Orchestrator as deterministic coordinator.
- Clarify Rule Guardrail as pre-routing hard constraint layer.
- Clarify Query Router as LLM structured output routing after case structuring.
- Define all route types and route-specific execution rules.
- Ensure customer-facing direct reply happens only after review/QA and Template Output pass.
- Move internal execution details to log/process observation page.

### 5.3 Epic and Story Updates

- Rewrite epics around user-value slices and implementation dependencies.
- Add FR coverage mapping to every story.
- Regenerate `story-index.md`.
- Ensure first implementation story is small, testable, and aligned with current code.
- Suggested first implementation-ready story after correction:
  - “Story 1.1: Establish canonical shared Agent runtime contracts and demo scenario fixtures.”
  - Or, if foundation is considered complete: “Story 3.1: Implement canonical Orchestrator state and route branch skeleton.”

### 5.4 UX Updates

- No separate UX doc is strictly required for MVP, but UI acceptance criteria must be strengthened.
- Add explicit UI acceptance criteria for:
  - Conversation window.
  - Ticket management.
  - Customer-visible reply/handoff states.
  - Separate log/process observation page.
  - Hidden-by-default internal trace.

### 5.5 Code Impact

- Current code should not be expanded further until corrected stories exist.
- Existing implementation can be reused as prototype code if it matches the corrected first story.
- After artifact correction, run build and UI verification again.

## 6. MVP Impact and Action Plan

MVP impact:

- MVP scope remains unchanged.
- Timeline impact is moderate but controlled.
- Main risk is implementation drift if stories are not corrected first.

High-level action plan:

1. Approve this Sprint Change Proposal.
2. Update PRD for numbering, terminology, and final runtime consistency.
3. Update architecture diagrams and runtime sections.
4. Rewrite epics/stories with FR coverage mapping.
5. Regenerate story-index.
6. Run implementation readiness check again.
7. Create first implementation-ready development story.
8. Enter `bmad-dev-story`.

## 7. Agent Handoff Plan

### Product Manager / Product Owner

Responsibilities:

- Correct PRD requirements and acceptance criteria.
- Validate MVP scope remains focused on web customer service reply and ticket handling.
- Ensure ordinary service vs after-sales separation is clear.

### Architect

Responsibilities:

- Update architecture diagrams and runtime descriptions.
- Define final contracts for StructuredCase, GuardrailResult, RouteDecision, review results, TemplateOutputResult, and AgentGraphState.
- Confirm RAG, VectorStore, memory lifecycle, and observability boundaries.

### Developer Agent

Responsibilities:

- Pause broad feature expansion until stories are corrected.
- Use corrected stories as implementation source of truth.
- Preserve current useful code where aligned.
- Verify each story through build, tests, and UI checks.

### QA / Review Agent

Responsibilities:

- Check route correctness, forbidden commitments, RAG grounding, review loop behavior, Template Output validation, and human handoff behavior.
- Confirm main UI does not expose internal Agent details by default.

## 8. Checklist Completion

- Section 1 Trigger and Context: Done.
- Section 2 Epic Impact Assessment: Done.
- Section 3 Artifact Conflict and Impact Analysis: Done.
- Section 4 Path Forward Evaluation: Done.
- Section 5 Sprint Change Proposal Components: Done.
- Section 6 Final Review and Handoff: Approved by user on 2026-06-13.

## 9. Approval Request

Please review this proposal.

Decision options:

- Continue: approve this proposal and proceed to update PRD, architecture, epics/stories, and story-index.
- Edit: request changes to this proposal before applying artifact updates.

## 10. Approval Record

User approved this Sprint Change Proposal by replying c on 2026-06-13. Scope classification: Moderate. Route: Product Owner / Developer coordination, then story-based implementation.

