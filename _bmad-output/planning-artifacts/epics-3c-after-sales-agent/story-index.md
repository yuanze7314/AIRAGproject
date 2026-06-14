---
title: Story Index - 内容电商 3C 售后智能客服 Agent
status: aligned-draft
updated: 2026-06-13
source: epics-and-stories.md
---

# Story Index

## Epic 1：项目基础、类型契约与演示数据

| Story | 标题 | 状态 | 主要 FR |
| --- | --- | --- | --- |
| 1.1 | 初始化 Web 全栈项目骨架 | backlog | FR-001, FR-007, FR-079, FR-082 |
| 1.2 | 定义 Agent 运行核心类型 | backlog | FR-022-FR-035, FR-071-FR-078, FR-083-FR-084 |
| 1.3 | 创建本地演示场景数据 | backlog | FR-009-FR-010, FR-030-FR-036, FR-043, FR-051, FR-053 |

## Epic 2：客服主界面、工单管理与日志观测

| Story | 标题 | 状态 | 主要 FR |
| --- | --- | --- | --- |
| 2.1 | 实现客服对话窗口 | backlog | FR-001-FR-003, FR-006, FR-009, FR-071 |
| 2.2 | 支持图片上传与证据展示 | backlog | FR-010-FR-014 |
| 2.3 | 实现工单管理面板 | backlog | FR-004-FR-005, FR-008 |
| 2.4 | 实现日志/流程观测页 | backlog | FR-007, FR-083-FR-084 |
| 2.5 | 实现 badcase 标记入口 | backlog | FR-079-FR-082 |

## Epic 3：最终 Agent Orchestration Runtime

| Story | 标题 | 状态 | 主要 FR |
| --- | --- | --- | --- |
| 3.1 | 实现 Orchestrator 状态骨架 | backlog | FR-007, FR-030, FR-083-FR-084 |
| 3.2 | 实现 Memory Adapter 与生命周期策略 | backlog | FR-015-FR-021 |
| 3.3 | 实现 Case Understanding Agent | backlog | FR-022-FR-025 |
| 3.4 | 实现 Rule Guardrail | backlog | FR-026-FR-029 |
| 3.5 | 实现 LLM 结构化 Query Router | backlog | FR-030-FR-035 |
| 3.6 | 实现四分支执行和审核循环 | backlog | FR-036-FR-054 |
| 3.7 | 实现 Template Output 最终输出层 | backlog | FR-071-FR-078 |

## Epic 4：RAG、检索重排与 VectorStore

| Story | 标题 | 状态 | 主要 FR |
| --- | --- | --- | --- |
| 4.1 | 建立普通客服与售后规则知识库 | backlog | FR-038, FR-055-FR-056 |
| 4.2 | 实现 RAG 检索范围控制 | backlog | FR-055, FR-057 |
| 4.3 | 实现混合召回与业务过滤 | backlog | FR-058-FR-060, FR-084 |
| 4.4 | 实现 Reranker Adapter 与 grounding 判断 | backlog | FR-061-FR-064 |
| 4.5 | 实现 VectorStore Adapter | backlog | FR-065-FR-070 |

## Epic 5：售后证据、风险策略、回复生成与 QA

| Story | 标题 | 状态 | 主要 FR |
| --- | --- | --- | --- |
| 5.1 | 实现图片证据线索 adapter | backlog | FR-010-FR-014 |
| 5.2 | 实现 Policy & Evidence Agent | backlog | FR-043-FR-046, FR-056, FR-061-FR-064 |
| 5.3 | 实现 Risk & Strategy Agent | backlog | FR-028, FR-046, FR-050, FR-054 |
| 5.4 | 实现 Reply Agent | backlog | FR-047, FR-050, FR-075 |
| 5.5 | 实现 QA Agent | backlog | FR-048-FR-050, FR-078 |

## Epic 6：端到端演示、质量校验与开发就绪

| Story | 标题 | 状态 | 主要 FR |
| --- | --- | --- | --- |
| 6.1 | 跑通普通客服端到端场景 | backlog | FR-036-FR-042, FR-071-FR-078 |
| 6.2 | 跑通售后服务端到端场景 | backlog | FR-043-FR-054, FR-071-FR-078 |
| 6.3 | 跑通信息不足与超范围场景 | backlog | FR-051-FR-054, FR-083-FR-084 |
| 6.4 | 建立最小质量检查 | backlog | FR-006-FR-007, FR-071-FR-084 |

## 推荐下一条开发 Story

推荐先进入 `Story 1.2 定义 Agent 运行核心类型` 或 `Story 3.1 实现 Orchestrator 状态骨架`。

如果当前代码已有基础 UI 和 API，优先选择 `Story 3.1`，因为它能把后续所有 Agent、RAG、日志和 UI 输出统一到一个运行状态模型里。
