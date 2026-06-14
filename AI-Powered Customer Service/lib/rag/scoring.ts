export type ScoredDocument<T> = T & {
  score: number;
  matchedKeywords: string[];
};

type SearchableDocument = {
  id: string;
  title: string;
  content: string;
  keywords?: string[];
  category?: string;
};

function normalize(text: string) {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

export function tokenize(text: string) {
  const normalized = normalize(text);
  const words = normalized.split(/\s+/).filter(Boolean);
  const cjkChars = Array.from(normalized).filter((char) => /\p{Script=Han}/u.test(char));
  const cjkBigrams = cjkChars.slice(0, -1).map((char, index) => `${char}${cjkChars[index + 1]}`);
  return [...new Set([...words, ...cjkChars, ...cjkBigrams])];
}

function termFrequency(tokens: string[]) {
  const counts = new Map<string, number>();
  for (const token of tokens) counts.set(token, (counts.get(token) ?? 0) + 1);
  return counts;
}

export function bm25Search<T extends SearchableDocument>(query: string, documents: T[], topK: number): ScoredDocument<T>[] {
  const queryTokens = tokenize(query);
  const tokenizedDocs = documents.map((document) => ({
    document,
    tokens: tokenize(`${document.title} ${document.content} ${(document.keywords ?? []).join(" ")}`)
  }));
  const avgLength = tokenizedDocs.reduce((sum, item) => sum + item.tokens.length, 0) / Math.max(1, tokenizedDocs.length);
  const docFreq = new Map<string, number>();

  for (const token of queryTokens) {
    docFreq.set(token, tokenizedDocs.filter((item) => item.tokens.includes(token)).length);
  }

  const k1 = 1.5;
  const b = 0.75;

  return tokenizedDocs
    .map(({ document, tokens }) => {
      const frequencies = termFrequency(tokens);
      const score = queryTokens.reduce((sum, token) => {
        const freq = frequencies.get(token) ?? 0;
        if (!freq) return sum;
        const idf = Math.log(1 + (tokenizedDocs.length - (docFreq.get(token) ?? 0) + 0.5) / ((docFreq.get(token) ?? 0) + 0.5));
        const denominator = freq + k1 * (1 - b + b * (tokens.length / Math.max(1, avgLength)));
        return sum + idf * ((freq * (k1 + 1)) / denominator);
      }, 0);
      const matchedKeywords = (document.keywords ?? []).filter((keyword) => query.includes(keyword));
      return { ...document, score: score + matchedKeywords.length * 0.4, matchedKeywords };
    })
    .filter((document) => document.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

export function lexicalEmbedding(text: string, dimensions = 32) {
  const vector = Array.from({ length: dimensions }, () => 0);
  for (const token of tokenize(text)) {
    let hash = 0;
    for (const char of token) hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
    vector[Math.abs(hash) % dimensions] += 1;
  }
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value ** 2, 0));
  return norm ? vector.map((value) => value / norm) : vector;
}
