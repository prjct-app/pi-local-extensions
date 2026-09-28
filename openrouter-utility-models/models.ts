import type { ProviderModelConfig } from "@earendil-works/pi-coding-agent";

/**
 * What Pi sends for each curated OpenRouter model. Limits, prices and
 * reasoning levels come from OpenRouter's catalog; a null level is one the
 * model does not offer (for example `off` where reasoning is mandatory).
 */
const commonCompat = {
  supportsDeveloperRole: false,
  thinkingFormat: "openrouter" as const,
  sendSessionAffinityHeaders: true,
};

/** Efforts max/high/low, reasoning optional. */
const maxHighLow = { off: "none", minimal: null, low: "low", medium: null, high: "high", xhigh: null, max: "max" };

const model = (config: Omit<ProviderModelConfig, "api" | "reasoning" | "compat"> & { compat?: ProviderModelConfig["compat"] }): ProviderModelConfig => ({
  api: "openai-completions",
  reasoning: true,
  ...config,
  compat: { ...commonCompat, ...config.compat },
});

export const curatedModelConfigs: ProviderModelConfig[] = [
  model({
    id: "meta/muse-spark-1.3",
    name: "Meta: Muse Spark 1.3 — multimodal reasoning",
    // Reasoning is mandatory: it cannot be turned off.
    thinkingLevelMap: { off: null, minimal: "minimal", low: "low", medium: "medium", high: "high", xhigh: "xhigh", max: "max" },
    input: ["text", "image"],
    cost: { input: 1.25, output: 4.25, cacheRead: 0.15, cacheWrite: 0 },
    contextWindow: 1_048_576,
    maxTokens: 943_718,
  }),
  model({
    id: "deepseek/deepseek-v4-pro-0813",
    name: "DeepSeek: V4 Pro (0813)",
    thinkingLevelMap: maxHighLow,
    input: ["text"],
    cost: { input: 0.2523, output: 3.5, cacheRead: 0.2518, cacheWrite: 0 },
    contextWindow: 1_048_576,
    maxTokens: 943_718,
    compat: { requiresReasoningContentOnAssistantMessages: true },
  }),
  model({
    id: "qwen/qwen3.8-max-0902",
    name: "Qwen: Qwen3.8 Max (0902)",
    // Reasoning is mandatory.
    thinkingLevelMap: { off: null, minimal: "minimal", low: "low", medium: "medium", high: "high", xhigh: "xhigh", max: null },
    input: ["text", "image"],
    cost: { input: 2, output: 6, cacheRead: 0.25, cacheWrite: 2.5 },
    contextWindow: 1_000_000,
    maxTokens: 131_072,
  }),
  model({
    id: "moonshotai/kimi-k3",
    name: "MoonshotAI: Kimi K3",
    thinkingLevelMap: maxHighLow,
    input: ["text", "image"],
    cost: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 0 },
    contextWindow: 1_048_576,
    // OpenRouter reserves credit for max_tokens up front; 943K output at $15/M blocks most balances.
    maxTokens: 131_072,
  }),
  model({
    id: "z-ai/glm-5.3",
    name: "Z.ai: GLM 5.3",
    // Reasoning is mandatory.
    thinkingLevelMap: { off: null, minimal: null, low: "low", medium: null, high: "high", xhigh: null, max: "max" },
    input: ["text"],
    cost: { input: 1.4, output: 4.4, cacheRead: 0.26, cacheWrite: 0 },
    contextWindow: 1_310_720,
    maxTokens: 943_717,
  }),
  model({
    id: "minimax/minimax-m3",
    name: "MiniMax: M3",
    input: ["text", "image"],
    cost: { input: 0.3, output: 1.2, cacheRead: 0.06, cacheWrite: 0 },
    contextWindow: 1_048_576,
    maxTokens: 512_000,
  }),
  model({
    id: "xiaomi/mimo-v2.6-pro",
    name: "Xiaomi: MiMo-V2.6-Pro",
    input: ["text", "image"],
    cost: { input: 0.435, output: 0.87, cacheRead: 0.0036, cacheWrite: 0 },
    contextWindow: 1_050_000,
    maxTokens: 131_072,
  }),
];
