export const CURATED_MODELS = [
  { id: "meta/muse-spark-1.3", purpose: "multimodal reasoning for coding and agent work", maxInputCostPerMillion: 1.5, maxOutputCostPerMillion: 5 },
  { id: "deepseek/deepseek-v4-pro-0813", purpose: "DeepSeek flagship, low input cost", maxInputCostPerMillion: 0.35, maxOutputCostPerMillion: 4.25 },
  { id: "qwen/qwen3.8-max-0902", purpose: "Alibaba Qwen flagship, multimodal", maxInputCostPerMillion: 2.5, maxOutputCostPerMillion: 7.5 },
  { id: "moonshotai/kimi-k3", purpose: "Moonshot Kimi flagship, multimodal", maxInputCostPerMillion: 3.5, maxOutputCostPerMillion: 17.5 },
  { id: "z-ai/glm-5.3", purpose: "Zhipu GLM flagship", maxInputCostPerMillion: 1.75, maxOutputCostPerMillion: 5.25 },
  { id: "minimax/minimax-m3", purpose: "low-cost multimodal generalist", maxInputCostPerMillion: 0.4, maxOutputCostPerMillion: 1.5 },
  { id: "xiaomi/mimo-v2.6-pro", purpose: "low-cost multimodal reasoning", maxInputCostPerMillion: 0.55, maxOutputCostPerMillion: 1.1 },
] as const;

export const CURATED_MODEL_IDS = new Set<string>(CURATED_MODELS.map((model) => model.id));

/** Identifies the current shortlist, so a cache written for another one is never trusted. */
export const CURATED_KEY = [...CURATED_MODEL_IDS].sort().join(" ");

export interface OpenRouterModelMetadata {
  id?: unknown;
  pricing?: unknown;
  supported_parameters?: unknown;
}

export interface OpenRouterModelsResponse {
  data?: unknown;
}

export interface CompatibilityCache {
  version: 4;
  /** The curated shortlist the cache was checked against; a different list is checked again. */
  curated: string;
  fetchedAt: number;
  scope: "public" | "user";
  compatibleIds: string[];
}

function parseStrictPrice(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) && value >= 0 ? value : undefined;
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(normalized)) return undefined;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function isWithinPriceLimit(modelId: string, pricing: unknown): boolean {
  if (!pricing || typeof pricing !== "object") return false;
  const profile = CURATED_MODELS.find((model) => model.id === modelId);
  if (!profile) return false;

  const value = pricing as Record<string, unknown>;
  const prompt = parseStrictPrice(value.prompt);
  const completion = parseStrictPrice(value.completion);
  if (prompt === undefined || completion === undefined) return false;

  return prompt * 1_000_000 <= profile.maxInputCostPerMillion
    && completion * 1_000_000 <= profile.maxOutputCostPerMillion;
}

export function selectCompatibleIds(payload: unknown): string[] {
  if (!payload || typeof payload !== "object") {
    throw new Error("OpenRouter returned an invalid model catalog.");
  }

  const data = (payload as OpenRouterModelsResponse).data;
  if (!Array.isArray(data)) {
    throw new Error("OpenRouter returned a model catalog without a data array.");
  }

  const compatible = new Set<string>();
  for (const rawModel of data) {
    if (!rawModel || typeof rawModel !== "object") continue;
    const model = rawModel as OpenRouterModelMetadata;
    if (typeof model.id !== "string" || !CURATED_MODEL_IDS.has(model.id)) continue;
    if (!isWithinPriceLimit(model.id, model.pricing)) continue;
    if (!Array.isArray(model.supported_parameters) || !model.supported_parameters.includes("tools")) continue;
    compatible.add(model.id);
  }

  return CURATED_MODELS.map((model) => model.id).filter((id) => compatible.has(id));
}

export function isIncompatibleRouteError(message: string): boolean {
  return /No endpoints found that support tool use|0 endpoints out of|Free model training violation/i.test(message);
}

export function normalizeCache(value: unknown): CompatibilityCache | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as Partial<CompatibilityCache>;
  if (
    candidate.version !== 4
    || candidate.curated !== CURATED_KEY
    || !Number.isFinite(candidate.fetchedAt)
    || (candidate.scope !== "public" && candidate.scope !== "user")
    || !Array.isArray(candidate.compatibleIds)
  ) {
    return undefined;
  }

  const compatibleIds = candidate.compatibleIds.filter(
    (id): id is string => typeof id === "string" && CURATED_MODEL_IDS.has(id),
  );

  return {
    version: 4,
    curated: CURATED_KEY,
    fetchedAt: candidate.fetchedAt as number,
    scope: candidate.scope,
    compatibleIds: [...new Set(compatibleIds)],
  };
}
