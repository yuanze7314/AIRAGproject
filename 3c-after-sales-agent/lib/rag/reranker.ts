import type { RetrievalCandidate, RetrievalResult } from "../types";

type KnowledgeBase = RetrievalResult["knowledgeBase"];

export type RerankInput = {
  query: string;
  knowledgeBase: KnowledgeBase;
  candidates: RetrievalCandidate[];
};

export type RerankOutput = {
  candidates: RetrievalCandidate[];
  source: "local" | "cross_encoder" | "fallback";
  error?: string;
};

export interface RerankerAdapter {
  readonly source: "local" | "cross_encoder";
  rerank(input: RerankInput): Promise<RerankOutput>;
}

function localScore(candidate: RetrievalCandidate, knowledgeBase: KnowledgeBase) {
  const divisor = knowledgeBase === "general" ? 6 : 2;
  return Math.min(1, candidate.score / divisor);
}

export class LocalHeuristicReranker implements RerankerAdapter {
  readonly source = "local" as const;

  async rerank(input: RerankInput): Promise<RerankOutput> {
    return {
      source: this.source,
      candidates: input.candidates
        .map((candidate) => ({
          ...candidate,
          source: `${candidate.source}:rerank`,
          rerankScore: localScore(candidate, input.knowledgeBase),
          rankingReason: "Local reranker: knowledge scope + category applicability + lexical/vector score"
        }))
        .sort((a, b) => (b.rerankScore ?? 0) - (a.rerankScore ?? 0))
    };
  }
}

export class CrossEncoderHttpReranker implements RerankerAdapter {
  readonly source = "cross_encoder" as const;

  constructor(
    private readonly endpoint = process.env.CROSS_ENCODER_API_URL ?? "",
    private readonly model = process.env.CROSS_ENCODER_MODEL ?? "BAAI/bge-reranker-base"
  ) {}

  async rerank(input: RerankInput): Promise<RerankOutput> {
    if (!this.endpoint || process.env.CROSS_ENCODER_DISABLED === "1") {
      return new LocalHeuristicReranker().rerank(input);
    }

    try {
      const response = await fetch(this.endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: this.model,
          query: input.query,
          candidates: input.candidates.map((candidate) => ({
            id: candidate.id,
            title: candidate.title,
            content: candidate.content,
            category: candidate.category
          }))
        }),
        signal: AbortSignal.timeout(Number(process.env.CROSS_ENCODER_TIMEOUT_MS ?? 10000))
      });
      if (!response.ok) throw new Error(`Cross-Encoder HTTP ${response.status}`);

      const payload = await response.json() as {
        scores?: number[];
        results?: Array<{ id: string; score: number; reason?: string }>;
      };
      const byId = new Map(payload.results?.map((item) => [item.id, item]));
      const candidates = input.candidates
        .map((candidate, index) => {
          const result = byId.get(candidate.id);
          const score = typeof result?.score === "number" ? result.score : payload.scores?.[index];
          return {
            ...candidate,
            source: `${candidate.source}:cross-encoder`,
            rerankScore: typeof score === "number" ? Math.max(0, Math.min(1, score)) : localScore(candidate, input.knowledgeBase),
            rankingReason: result?.reason ?? "Cross-Encoder reranker score"
          };
        })
        .sort((a, b) => (b.rerankScore ?? 0) - (a.rerankScore ?? 0));

      return { source: this.source, candidates };
    } catch (error) {
      const fallback = await new LocalHeuristicReranker().rerank(input);
      return {
        ...fallback,
        source: "fallback",
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
}

export function createReranker(): RerankerAdapter {
  return process.env.RAG_RERANKER === "cross_encoder"
    ? new CrossEncoderHttpReranker()
    : new LocalHeuristicReranker();
}
