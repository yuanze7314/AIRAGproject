type JsonSchema = {
  type: "object";
  properties: Readonly<Record<string, unknown>>;
  required: readonly string[];
  additionalProperties: false;
};

type StructuredOutputRequest<T> = {
  name: string;
  schema: JsonSchema;
  system: string;
  user: unknown;
  fallback: T;
  validate: (value: unknown) => value is T;
};

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
};

const DEFAULT_PROVIDER = "deepseek";
const DEFAULT_MODEL = "deepseek-v4-flash";
const DEFAULT_BASE_URL = "https://api.deepseek.com";
const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_MAX_TOKENS = 4_000;

export type LlmSource = "deepseek" | "fallback";

export function isLlmConfigured() {
  return Boolean(apiKey()) && envValue("LLM_DISABLED") !== "1" && envValue("DEEPSEEK_DISABLED") !== "1";
}

export function activeModel() {
  return envValue("DEEPSEEK_MODEL") ?? envValue("LLM_MODEL") ?? DEFAULT_MODEL;
}

function apiKey() {
  return envValue("DEEPSEEK_API_KEY") ?? envValue("LLM_API_KEY");
}

function baseUrl() {
  return envValue("DEEPSEEK_API_BASE_URL") ?? envValue("LLM_API_BASE_URL") ?? DEFAULT_BASE_URL;
}

function envValue(name: string) {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function envNumber(names: readonly string[], fallback: number) {
  for (const name of names) {
    const value = envValue(name);
    if (value === undefined) continue;

    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }

  return fallback;
}

function activeProvider(): Exclude<LlmSource, "fallback"> {
  return DEFAULT_PROVIDER;
}

function responseText(payload: ChatCompletionResponse) {
  return payload.choices?.[0]?.message?.content?.trim();
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export async function generateStructuredOutput<T>(request: StructuredOutputRequest<T>): Promise<{ value: T; source: LlmSource; error?: string }> {
  const key = apiKey();
  if (!isLlmConfigured() || !key) {
    return { value: request.fallback, source: "fallback", error: "DEEPSEEK_API_KEY or LLM_API_KEY is not configured" };
  }

  const timeoutMs = envNumber(["DEEPSEEK_TIMEOUT_MS", "LLM_TIMEOUT_MS"], DEFAULT_TIMEOUT_MS);
  const maxTokens = envNumber(["DEEPSEEK_MAX_TOKENS", "LLM_MAX_TOKENS"], DEFAULT_MAX_TOKENS);
  const body: Record<string, unknown> = {
    model: activeModel(),
    messages: [
      {
        role: "system",
        content: [
          request.system,
          "",
          "Return a single valid JSON object matching the requested schema.",
          "Do not include markdown fences, comments, or explanatory text.",
          `Schema name: ${request.name}`,
          `Schema: ${JSON.stringify(request.schema)}`
        ].join("\n")
      },
      { role: "user", content: JSON.stringify(request.user) }
    ],
    response_format: { type: "json_object" },
    stream: false,
    temperature: envNumber(["DEEPSEEK_TEMPERATURE", "LLM_TEMPERATURE"], 0.2),
    max_tokens: maxTokens
  };

  const thinking = envValue("DEEPSEEK_THINKING");
  if (thinking === "1" || thinking === "0") {
    body.thinking = { type: thinking === "1" ? "enabled" : "disabled" };
  }

  try {
    const response = await fetchWithTimeout(`${baseUrl()}/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${key}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    }, timeoutMs);

    if (!response.ok) {
      const errorBody = await response.text();
      return { value: request.fallback, source: "fallback", error: `DeepSeek API ${response.status}: ${errorBody.slice(0, 500)}` };
    }

    const payload = await response.json() as ChatCompletionResponse;
    const text = responseText(payload);
    if (!text) return { value: request.fallback, source: "fallback", error: "DeepSeek response did not include message content" };

    const parsed = JSON.parse(text) as unknown;
    if (!request.validate(parsed)) {
      return { value: request.fallback, source: "fallback", error: "DeepSeek JSON output failed local validation" };
    }

    return { value: parsed, source: activeProvider() };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { value: request.fallback, source: "fallback", error: message };
  }
}
