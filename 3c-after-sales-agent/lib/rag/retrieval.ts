import type {
  GeneralKnowledgeHit,
  GeneralServiceResult,
  PolicyEvidenceResult,
  RetrievalCandidate,
  RetrievalResult,
  RuleHit,
  StructuredCase
} from "../types";
import { createReranker } from "./reranker";
import { bm25Search, lexicalEmbedding } from "./scoring";
import { createConfiguredVectorStoreFromIndex, loadKnowledgeIndexChunks, type VectorChunk } from "./vector-store";

type KnowledgeBase = RetrievalResult["knowledgeBase"];
type GeneralKnowledgeCategory = GeneralKnowledgeHit["category"];

const intentCategoryMap: Record<string, string> = {
  accessory_missing: "accessory-missing",
  accessory_missing_issue: "accessory-missing",
  missing_accessory: "accessory-missing",
  logistics_damage: "logistics-damage",
  logistics_damage_issue: "logistics-damage",
  package_damage: "logistics-damage",
  damaged_package: "logistics-damage",
  quality_issue: "quality-issue",
  product_quality_issue: "quality-issue",
  fault_issue: "quality-issue",
  refund_request: "quality-issue",
  livestream_promise_dispute: "livestream-promise",
  livestream_gift_missing: "livestream-promise",
  promise_dispute: "livestream-promise",
  refund_only_request: "refund-only",
  refund_only: "refund-only",
  rule_consultation: "c3c-activation-return",
  activation_return: "c3c-activation-return",
  return_after_activation: "c3c-activation-return",
  complaint_escalation: "platform-after-sales",
  after_sales: "platform-after-sales"
};
const ruleCategoryMap: Record<string, string> = {
  "accessory-missing": "accessory_missing",
  "c3c-activation-return": "rule_consultation",
  "livestream-promise": "livestream_promise_dispute",
  "logistics-damage": "logistics_damage",
  "platform-after-sales": "platform_rule",
  "quality-issue": "quality_issue",
  "refund-only": "refund_only_request"
};

const platformRuleCategories = new Set(["platform_rule", "platform-after-sales"]);
const generalKnowledgeCategories = new Set<string>(["product_specs", "delivery_time", "logistics_info", "order_info", "general_style"]);

function threshold(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

function groundingDecision(input: {
  knowledgeBase: KnowledgeBase;
  topScore: number;
  runnerUp: number;
  hasCandidates: boolean;
  hasUncertainty?: boolean;
}) {
  const minScore = input.knowledgeBase === "general"
    ? threshold("RAG_GENERAL_MIN_SCORE", 0.35)
    : threshold("RAG_AFTER_SALES_MIN_SCORE", 0.55);
  const minMargin = input.knowledgeBase === "general"
    ? threshold("RAG_GENERAL_MIN_MARGIN", 0.05)
    : threshold("RAG_AFTER_SALES_MIN_MARGIN", 0.03);
  const highConfidenceBypass = input.knowledgeBase === "general"
    ? threshold("RAG_GENERAL_HIGH_CONFIDENCE_BYPASS", 0.9)
    : threshold("RAG_AFTER_SALES_HIGH_CONFIDENCE_BYPASS", 0.9);
  const ambiguousMargin = Math.abs(input.topScore - input.runnerUp) < minMargin && input.topScore < highConfidenceBypass;

  return !input.hasCandidates || input.topScore < minScore || ambiguousMargin || Boolean(input.hasUncertainty);
}

function targetCategoriesFor(structuredCase: StructuredCase, knowledgeBase: KnowledgeBase, fallbackCategory?: string) {
  if (knowledgeBase === "general") {
    return new Set([fallbackCategory, "general_style"].filter(Boolean));
  }

  return new Set([
    structuredCase.customerIntent,
    intentCategoryMap[structuredCase.customerIntent],
    "platform_rule",
    "platform-after-sales"
  ].filter(Boolean));
}

function chunkKeywords(chunk: VectorChunk) {
  const keywords = chunk.metadata?.keywords;
  return Array.isArray(keywords) ? keywords : [];
}

function chunkToCandidate(chunk: VectorChunk, source: string, score: number, rerankScore?: number, rankingReason?: string): RetrievalCandidate {
  return {
    id: String(chunk.metadata?.docId ?? chunk.metadata?.ruleId ?? chunk.id),
    title: chunk.title,
    content: chunk.text,
    category: chunk.category,
    source,
    score,
    rerankScore,
    matchedKeywords: chunkKeywords(chunk).filter((keyword) => chunk.text.includes(keyword) || chunk.title.includes(keyword)),
    metadata: chunk.metadata,
    rankingReason
  };
}

function isScopedChunk(chunk: VectorChunk, knowledgeBase: KnowledgeBase) {
  return chunk.metadata?.knowledgeBase === knowledgeBase;
}

function categoryBoost(chunk: VectorChunk, targetCategories: Set<string | undefined>) {
  if (targetCategories.has(chunk.category)) return 0.25;
  if (platformRuleCategories.has(chunk.category) && targetCategories.has("platform-after-sales")) return 0.12;
  return 0;
}

function mergeCandidates(...groups: RetrievalCandidate[][]) {
  const merged = new Map<string, RetrievalCandidate>();
  for (const group of groups) {
    for (const candidate of group) {
      const existing = merged.get(candidate.id);
      if (!existing || candidate.score > existing.score) {
        merged.set(candidate.id, candidate);
      }
    }
  }
  return Array.from(merged.values()).sort((a, b) => b.score - a.score);
}

function isGeneralKnowledgeCategory(category: string): category is GeneralKnowledgeCategory {
  return generalKnowledgeCategories.has(category);
}

export async function buildKnowledgeIndexRetrievalResult(input: {
  structuredCase: StructuredCase;
  knowledgeBase: KnowledgeBase;
  fallbackCategory?: string;
}): Promise<RetrievalResult | undefined> {
  let scopedChunks: VectorChunk[];
  try {
    const chunks = await loadKnowledgeIndexChunks();
    scopedChunks = chunks.filter((chunk) => isScopedChunk(chunk, input.knowledgeBase));
  } catch {
    return undefined;
  }

  if (!scopedChunks.length) return undefined;

  const targetCategories = targetCategoriesFor(input.structuredCase, input.knowledgeBase, input.fallbackCategory);
  const searchableDocs = scopedChunks.map((chunk) => ({
    id: chunk.id,
    title: chunk.title,
    content: chunk.text,
    category: chunk.category,
    keywords: chunkKeywords(chunk),
    chunk
  }));

  const bm25Candidates = bm25Search(input.structuredCase.originalMessage, searchableDocs, 8)
    .map((doc) => chunkToCandidate(
      doc.chunk,
      `${input.knowledgeBase}-knowledge-index:bm25`,
      doc.score + categoryBoost(doc.chunk, targetCategories),
      undefined,
      "Knowledge index BM25 candidate"
    ))
    .sort((a, b) => b.score - a.score);

  const store = await createConfiguredVectorStoreFromIndex();
  const embeddingCandidates = (await store.searchEmbedding(lexicalEmbedding(input.structuredCase.originalMessage), 8, { metadata: { knowledgeBase: input.knowledgeBase } }))
    .map((chunk) => chunkToCandidate(
      chunk,
      `${input.knowledgeBase}-knowledge-index:embedding`,
      chunk.score + categoryBoost(chunk, targetCategories),
      undefined,
      "Knowledge index lexical vector candidate"
    ))
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score);

  const combinedCandidates = mergeCandidates(bm25Candidates, embeddingCandidates);
  const filteredCandidates = combinedCandidates.filter((candidate) => targetCategories.has(candidate.category));
  const candidatesForRerank = filteredCandidates.length ? filteredCandidates : combinedCandidates;
  const reranked = await createReranker().rerank({
    query: input.structuredCase.originalMessage,
    knowledgeBase: input.knowledgeBase,
    candidates: candidatesForRerank
  });
  const rerankedTopK = reranked.candidates.slice(0, 3);

  const topScore = rerankedTopK[0]?.rerankScore ?? 0;
  const runnerUp = rerankedTopK[1]?.rerankScore ?? 0;
  const insufficientGrounding = groundingDecision({
    knowledgeBase: input.knowledgeBase,
    topScore,
    runnerUp,
    hasCandidates: rerankedTopK.length > 0
  });

  return {
    query: input.structuredCase.originalMessage,
    knowledgeBase: input.knowledgeBase,
    vectorStoreSource: store.kind,
    rerankerSource: reranked.source,
    rerankerError: reranked.error,
    bm25Candidates,
    embeddingCandidates,
    filteredCandidates,
    rerankedTopK,
    groundingConfidence: topScore,
    insufficientGrounding
  };
}

export function generalKnowledgeHitsFromRetrievalResult(indexResult: RetrievalResult | undefined): GeneralKnowledgeHit[] | undefined {
  if (!indexResult?.rerankedTopK.length || indexResult.knowledgeBase !== "general") return undefined;

  const hits = indexResult.rerankedTopK.flatMap((candidate) => {
    if (!isGeneralKnowledgeCategory(candidate.category)) return [];
    return [{
      docId: candidate.id,
      title: candidate.title,
      category: candidate.category,
      content: candidate.content,
      score: candidate.rerankScore ?? candidate.score,
      matchedKeywords: candidate.matchedKeywords ?? []
    } satisfies GeneralKnowledgeHit];
  }).slice(0, 3);

  return hits.length ? hits : undefined;
}

export async function retrieveGeneralKnowledgeFromIndex(
  structuredCase: StructuredCase,
  fallbackCategory: GeneralServiceResult["category"]
): Promise<GeneralKnowledgeHit[] | undefined> {
  const indexResult = await buildKnowledgeIndexRetrievalResult({
    structuredCase,
    knowledgeBase: "general",
    fallbackCategory
  });

  return generalKnowledgeHitsFromRetrievalResult(indexResult);
}

export function ruleHitsFromRetrievalResult(indexResult: RetrievalResult | undefined): RuleHit[] | undefined {
  if (!indexResult?.rerankedTopK.length || indexResult.knowledgeBase !== "after_sales") return undefined;

  const hits = indexResult.rerankedTopK.map((candidate) => {
    const ruleId = String(candidate.metadata?.ruleId ?? candidate.id);
    return {
      ruleId,
      title: candidate.title,
      summary: candidate.content.slice(0, 220),
      category: ruleCategoryMap[ruleId] ?? candidate.category,
      relevanceScore: candidate.rerankScore ?? candidate.score
    } satisfies RuleHit;
  }).slice(0, 3);

  return hits.length ? hits : undefined;
}

export async function retrieveAfterSalesRulesFromIndex(structuredCase: StructuredCase): Promise<RuleHit[] | undefined> {
  const indexResult = await buildKnowledgeIndexRetrievalResult({
    structuredCase,
    knowledgeBase: "after_sales"
  });

  return ruleHitsFromRetrievalResult(indexResult);
}

function toGeneralCandidate(hit: GeneralKnowledgeHit, source: "bm25" | "embedding" | "rerank"): RetrievalCandidate {
  const scoreOffset = source === "embedding" ? -0.6 : source === "rerank" ? 0.8 : 0;
  return {
    id: hit.docId,
    title: hit.title,
    content: hit.content,
    category: hit.category,
    source: `general-service-kb:${source}`,
    score: Math.max(0, hit.score + scoreOffset),
    rerankScore: source === "rerank" ? Math.min(1, (hit.score + scoreOffset) / 10) : undefined,
    matchedKeywords: hit.matchedKeywords,
    rankingReason: source === "rerank" ? "MVP reranker: category match + keyword coverage + ordinary-service scope" : undefined
  };
}

function buildLegacyGeneralRetrievalResult(structuredCase: StructuredCase, generalService: GeneralServiceResult): RetrievalResult {
  const bm25Candidates = generalService.retrievedKnowledge.map((hit) => toGeneralCandidate(hit, "bm25"));
  const embeddingCandidates = searchEmbeddingCandidates(structuredCase.originalMessage, generalService.retrievedKnowledge.map((hit) => ({
    id: hit.docId,
    text: hit.content,
    title: hit.title,
    source: "general-service-kb",
    category: hit.category,
    matchedKeywords: hit.matchedKeywords
  })), "general-service-kb:embedding");
  const filteredCandidates = bm25Candidates.filter((candidate) => candidate.category === generalService.category || candidate.category === "general_style");
  const rerankedTopK = filteredCandidates
    .map((candidate) => ({
      ...candidate,
      source: "general-service-kb:rerank",
      rerankScore: Math.min(1, candidate.score / 10),
      rankingReason: "MVP reranker: routeType=general_service and category applicability passed"
    }))
    .sort((a, b) => (b.rerankScore ?? 0) - (a.rerankScore ?? 0))
    .slice(0, 3);
  const topScore = rerankedTopK[0]?.rerankScore ?? 0;
  const runnerUp = rerankedTopK[1]?.rerankScore ?? 0;
  const insufficientGrounding = groundingDecision({
    knowledgeBase: "general",
    topScore,
    runnerUp,
    hasCandidates: rerankedTopK.length > 0
  });

  return {
    query: structuredCase.originalMessage,
    knowledgeBase: "general",
    vectorStoreSource: "fallback",
    rerankerSource: "local",
    bm25Candidates,
    embeddingCandidates,
    filteredCandidates,
    rerankedTopK,
    groundingConfidence: topScore,
    insufficientGrounding
  };
}

function toRuleCandidate(rule: RuleHit, source: "bm25" | "embedding" | "rerank"): RetrievalCandidate {
  const score = source === "embedding" ? rule.relevanceScore - 0.08 : rule.relevanceScore;
  return {
    id: rule.ruleId,
    title: rule.title,
    content: rule.summary,
    category: rule.category,
    source: `after-sales-rules:${source}`,
    score,
    rerankScore: source === "rerank" ? score : undefined,
    matchedKeywords: [rule.category, rule.title],
    rankingReason: source === "rerank" ? "MVP reranker: after-sales intent + rule category + risk applicability" : undefined
  };
}

function buildLegacyAfterSalesRetrievalResult(structuredCase: StructuredCase, policyEvidence: PolicyEvidenceResult): RetrievalResult {
  const bm25Candidates = policyEvidence.ruleHits.map((rule) => toRuleCandidate(rule, "bm25"));
  const embeddingCandidates = searchEmbeddingCandidates(structuredCase.originalMessage, policyEvidence.ruleHits.map((rule) => ({
    id: rule.ruleId,
    text: rule.summary,
    title: rule.title,
    source: "after-sales-rules",
    category: rule.category,
    matchedKeywords: [rule.category, rule.title]
  })), "after-sales-rules:embedding");
  const filteredCandidates = bm25Candidates.filter((candidate) => candidate.category === structuredCase.customerIntent || candidate.category === "platform_rule");
  const rerankedTopK = filteredCandidates
    .map((candidate) => ({
      ...candidate,
      source: "after-sales-rules:rerank",
      rerankScore: candidate.score,
      rankingReason: "MVP reranker: routeType=after_sales and rule applicability passed"
    }))
    .sort((a, b) => (b.rerankScore ?? 0) - (a.rerankScore ?? 0))
    .slice(0, 3);
  const topScore = rerankedTopK[0]?.rerankScore ?? 0;
  const runnerUp = rerankedTopK[1]?.rerankScore ?? 0;
  const insufficientGrounding = groundingDecision({
    knowledgeBase: "after_sales",
    topScore,
    runnerUp,
    hasCandidates: rerankedTopK.length > 0,
    hasUncertainty: policyEvidence.uncertainty.length > 0
  });

  return {
    query: structuredCase.originalMessage,
    knowledgeBase: "after_sales",
    vectorStoreSource: "fallback",
    rerankerSource: "local",
    bm25Candidates,
    embeddingCandidates,
    filteredCandidates,
    rerankedTopK,
    groundingConfidence: topScore,
    insufficientGrounding
  };
}

export async function buildGeneralRetrievalResult(structuredCase: StructuredCase, generalService: GeneralServiceResult, existingIndexResult?: RetrievalResult): Promise<RetrievalResult> {
  if (existingIndexResult?.knowledgeBase === "general") return existingIndexResult;

  const indexResult = await buildKnowledgeIndexRetrievalResult({
    structuredCase,
    knowledgeBase: "general",
    fallbackCategory: generalService.category
  });
  return indexResult ?? buildLegacyGeneralRetrievalResult(structuredCase, generalService);
}

export async function buildAfterSalesRetrievalResult(structuredCase: StructuredCase, policyEvidence: PolicyEvidenceResult, existingIndexResult?: RetrievalResult): Promise<RetrievalResult> {
  if (existingIndexResult?.knowledgeBase === "after_sales") return existingIndexResult;

  const indexResult = await buildKnowledgeIndexRetrievalResult({
    structuredCase,
    knowledgeBase: "after_sales"
  });
  return indexResult ?? buildLegacyAfterSalesRetrievalResult(structuredCase, policyEvidence);
}

function searchEmbeddingCandidates(query: string, docs: Array<{ id: string; text: string; title: string; source: string; category: string; matchedKeywords: string[] }>, source: string): RetrievalCandidate[] {
  const chunks: VectorChunk[] = docs.map((doc) => ({
    id: doc.id,
    text: doc.text,
    title: doc.title,
    source: doc.source,
    category: doc.category,
    embedding: lexicalEmbedding(`${doc.title} ${doc.text}`),
    metadata: { matchedKeywords: doc.matchedKeywords },
    updatedAt: new Date().toISOString()
  }));

  const queryEmbedding = lexicalEmbedding(query);
  return chunks
    .map((chunk) => ({
      id: chunk.id,
      title: chunk.title,
      content: chunk.text,
      category: chunk.category,
      source,
      score: cosineScore(queryEmbedding, chunk.embedding),
      matchedKeywords: Array.isArray(chunk.metadata?.matchedKeywords) ? chunk.metadata.matchedKeywords : [],
      rankingReason: "Local lexical embedding similarity via InMemoryVectorStore-compatible vectors"
    }))
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

function cosineScore(a: number[], b: number[]) {
  let dot = 0;
  for (let index = 0; index < a.length; index += 1) dot += a[index] * b[index];
  return dot;
}
