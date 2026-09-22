export const CURATED_MODELS = [
  {
    id: "deepseek/deepseek-v4-flash",
    purpose: "low-cost code cleanup",
    maxInputCostPerMillion: 0.1,
    maxOutputCostPerMillion: 0.3,
  },
  {
    id: "z-ai/glm-5.3-flash",
    purpose: "low-cost documentation and general utility",
    maxInputCostPerMillion: 0.15,
    maxOutputCostPerMillion: 0.5,
  },
  {
    id: "minimax/minimax-m2.7",
    purpose: "low-cost tool-assisted fallback",
    maxInputCostPerMillion: 0.35,
    maxOutputCostPerMillion: 1.25,
  },
] as const;

export const CURATED_MODEL_IDS = new Set<string>(CURATED_MODELS.map((model) => model.id));

export interface OpenRouterModelMetadata {
  id?: unknown;
  pricing?: unknown;
  supported_parameters?: unknown;
}

export interface OpenRouterModelsResponse {
  data?: unknown;
}

export interface CompatibilityCache {
  version: 3;
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
    candidate.version !== 3
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
    version: 3,
    fetchedAt: candidate.fetchedAt as number,
    scope: candidate.scope,
    compatibleIds: [...new Set(compatibleIds)],
  };
}
