import { SYMBOL, brand, completer, openPanel, panelText, type PanelSpec } from "@prjct.app/pi-tui-kit";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  getAgentDir,
  type ExtensionAPI,
  type ProviderModelConfig,
} from "@earendil-works/pi-coding-agent";
import {
  CURATED_MODELS,
  isIncompatibleRouteError,
  normalizeCache,
  selectCompatibleIds,
  type CompatibilityCache,
} from "./catalog.ts";

const PUBLIC_CATALOG_URL = "https://openrouter.ai/api/v1/models";
const USER_CATALOG_URL = "https://openrouter.ai/api/v1/models/user";
const CACHE_MAX_AGE_MS = 6 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 5_000;
const CACHE_PATH = join(getAgentDir(), "cache", "openrouter-utility-models.json");
const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

const commonCompat = {
  supportsDeveloperRole: false,
  thinkingFormat: "openrouter" as const,
  sendSessionAffinityHeaders: true,
};

const curatedModelConfigs: ProviderModelConfig[] = [
  {
    id: "deepseek/deepseek-v4-flash",
    name: "DeepSeek: V4 Flash — low-cost code cleanup",
    api: "openai-completions",
    reasoning: true,
    thinkingLevelMap: {
      off: "none",
      minimal: null,
      low: null,
      medium: null,
      high: "high",
      xhigh: "xhigh",
      max: null,
    },
    input: ["text"],
    cost: { input: 0.088606, output: 0.177212, cacheRead: 0.017721, cacheWrite: 0 },
    contextWindow: 1_024_000,
    maxTokens: 384_000,
    compat: {
      ...commonCompat,
      requiresReasoningContentOnAssistantMessages: true,
    },
  },
  {
    id: "z-ai/glm-5.3-flash",
    name: "Z.ai: GLM 5.3 Flash — low-cost documentation and general utility",
    api: "openai-completions",
    reasoning: true,
    thinkingLevelMap: {
      off: null,
      minimal: null,
      low: "low",
      medium: null,
      high: "high",
      xhigh: null,
      max: "max",
    },
    input: ["text", "image"],
    cost: { input: 0.09, output: 0.3, cacheRead: 0.018, cacheWrite: 0 },
    contextWindow: 1_048_576,
    maxTokens: 131_072,
    compat: commonCompat,
  },
  {
    id: "minimax/minimax-m2.7",
    name: "MiniMax: M2.7 — low-cost tool-assisted fallback",
    api: "openai-completions",
    reasoning: true,
    thinkingLevelMap: { off: null },
    input: ["text"],
    cost: { input: 0.3, output: 1.2, cacheRead: 0.06, cacheWrite: 0 },
    contextWindow: 204_800,
    maxTokens: 131_072,
    compat: commonCompat,
  },
];

type CatalogSource = "live public" | "live user" | "fresh cache" | "unavailable" | "observed failure";

interface FilterState {
  compatibleIds: Set<string>;
  fetchedAt?: number;
  scope: "public" | "user";
  source: CatalogSource;
  warning?: string;
}

async function readCache(): Promise<CompatibilityCache | undefined> {
  try {
    return normalizeCache(JSON.parse(await readFile(CACHE_PATH, "utf8")));
  } catch {
    return undefined;
  }
}

async function writeCache(cache: CompatibilityCache): Promise<void> {
  const directory = join(getAgentDir(), "cache");
  const temporaryPath = `${CACHE_PATH}.${process.pid}.${randomUUID()}.tmp`;
  await mkdir(directory, { recursive: true });
  await writeFile(temporaryPath, `${JSON.stringify(cache, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temporaryPath, CACHE_PATH);
}

async function fetchCompatibleIds(apiKey?: string): Promise<CompatibilityCache> {
  const scope = apiKey ? "user" : "public";
  const response = await fetch(apiKey ? USER_CATALOG_URL : PUBLIC_CATALOG_URL, {
    headers: {
      accept: "application/json",
      "user-agent": "pi-openrouter-utility-models/1.0",
      ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`OpenRouter ${scope} catalog request failed with HTTP ${response.status}.`);
  }

  return {
    version: 3,
    fetchedAt: Date.now(),
    scope,
    compatibleIds: selectCompatibleIds(await response.json()),
  };
}

async function resolveFilterState(forceNetwork = false, apiKey?: string): Promise<FilterState> {
  const cached = await readCache();
  const cacheIsFresh = Boolean(cached && Date.now() - cached.fetchedAt < CACHE_MAX_AGE_MS);
  const cacheMatchesScope = Boolean(cached && (!apiKey || cached.scope === "user"));
  const usableCache = cached && cacheIsFresh && cacheMatchesScope ? cached : undefined;

  if (!forceNetwork && usableCache) {
    return {
      compatibleIds: new Set(usableCache.compatibleIds),
      fetchedAt: usableCache.fetchedAt,
      scope: usableCache.scope,
      source: "fresh cache",
    };
  }

  if (process.env.PI_OFFLINE === undefined) {
    try {
      const refreshed = await fetchCompatibleIds(apiKey);
      let warning: string | undefined;
      try {
        await writeCache(refreshed);
      } catch (error) {
        warning = `Compatibility was validated, but its cache could not be saved: ${error instanceof Error ? error.message : String(error)}`;
      }
      return {
        compatibleIds: new Set(refreshed.compatibleIds),
        fetchedAt: refreshed.fetchedAt,
        scope: refreshed.scope,
        source: refreshed.scope === "user" ? "live user" : "live public",
        warning,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (usableCache) {
        return {
          compatibleIds: new Set(usableCache.compatibleIds),
          fetchedAt: usableCache.fetchedAt,
          scope: usableCache.scope,
          source: "fresh cache",
          warning: message,
        };
      }
      return {
        compatibleIds: new Set(),
        scope: apiKey ? "user" : "public",
        source: "unavailable",
        warning: message,
      };
    }
  }

  if (usableCache) {
    return {
      compatibleIds: new Set(usableCache.compatibleIds),
      fetchedAt: usableCache.fetchedAt,
      scope: usableCache.scope,
      source: "fresh cache",
    };
  }

  return {
    compatibleIds: new Set(),
    scope: apiKey ? "user" : "public",
    source: "unavailable",
    warning: "PI_OFFLINE is set and no fresh compatibility cache exists.",
  };
}

function ageDescription(timestamp: number | undefined): string {
  if (!timestamp) return "not available";
  const minutes = Math.max(0, Math.round((Date.now() - timestamp) / 60_000));
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.round(minutes / 60)}h ago`;
}

export default async function openRouterUtilityModels(pi: ExtensionAPI) {
  let state = await resolveFilterState();

  const activeModels = () => curatedModelConfigs.filter((model) => state.compatibleIds.has(model.id));
  const registerFilteredProvider = () => {
    pi.registerProvider("openrouter", {
      name: "OpenRouter — low-cost utility models",
      baseUrl: OPENROUTER_BASE_URL,
      api: "openai-completions",
      models: activeModels(),
    });
  };

  registerFilteredProvider();

  pi.on("session_start", async (_event, ctx) => {
    try {
      const apiKey = await ctx.modelRegistry.getApiKeyForProvider("openrouter");
      if (apiKey && process.env.PI_OFFLINE === undefined) {
        // A fresh user-scoped cache is authoritative for its 6h lifetime. Forcing
        // the catalog fetch here blocked every session start/resume by 200-300ms.
        state = await resolveFilterState(false, apiKey);
        registerFilteredProvider();
      }
    } catch (error) {
      state = {
        compatibleIds: new Set(),
        scope: "user",
        source: "unavailable",
        warning: `Could not validate the user-specific OpenRouter catalog: ${error instanceof Error ? error.message : String(error)}`,
      };
      registerFilteredProvider();
    }
    if (state.source === "unavailable" && state.warning) {
      ctx.ui.notify(`OpenRouter utility models are disabled: ${state.warning}`, "warning");
    }
  });

  pi.on("message_end", async (event, ctx) => {
    const message = event.message;
    if (message.role !== "assistant" || message.provider !== "openrouter" || message.stopReason !== "error") return;
    if (!state.compatibleIds.has(message.model)) return;
    const errorMessage = message.errorMessage ?? "";
    if (!isIncompatibleRouteError(errorMessage)) return;

    const failedAt = Date.now();
    state.compatibleIds.delete(message.model);
    state = {
      ...state,
      fetchedAt: failedAt,
      source: "observed failure",
      warning: `${message.model} was removed because no eligible tool-capable route was available for the current account policy.`,
    };
    registerFilteredProvider();
    await writeCache({
      version: 3,
      fetchedAt: failedAt,
      scope: state.scope,
      compatibleIds: [...state.compatibleIds],
    }).catch(() => undefined);
    ctx.ui.notify(`${state.warning} Select another OpenRouter model.`, "warning");
  });

  /**
   * /openrouter: the curated models as rows (offered or filtered out), with
   * price caps, purpose and catalog provenance beside them; r refreshes.
   */
  pi.registerCommand("openrouter", {
    description: brand("low-cost OpenRouter models: panel, refresh"),
    getArgumentCompletions: completer([{ value: "refresh", description: "re-check prices and tool support now" }]),
    handler: async (_args, ctx) => {
      const refresh = async (): Promise<string> => {
        const apiKey = await ctx.modelRegistry.getApiKeyForProvider("openrouter");
        state = await resolveFilterState(true, apiKey);
        registerFilteredProvider();
        return `Refreshed · ${activeModels().length} of ${CURATED_MODELS.length} offered (${state.source})${state.warning ? ` · ${state.warning}` : ""}`;
      };
      const spec: PanelSpec = {
        title: "OpenRouter",
        summary: () => `${activeModels().length}/${CURATED_MODELS.length} offered · ${state.source} · checked ${ageDescription(state.fetchedAt)}`,
        items: () => CURATED_MODELS.map((model) => {
          const offered = state.compatibleIds.has(model.id);
          return {
            id: model.id,
            label: model.id,
            symbol: offered ? SYMBOL.ok : SYMBOL.error,
            tone: offered ? "success" : "warning",
            meta: offered ? "offered" : "filtered out",
            search: model.purpose,
          };
        }),
        detail: (item) => {
          const model = CURATED_MODELS.find((entry) => entry.id === item.id)!;
          const offered = state.compatibleIds.has(model.id);
          return {
            title: model.id,
            subtitle: offered ? "Offered in the model picker." : "Not offered: incompatible tool calling, over the price cap, or a failed route.",
            subtitleTone: offered ? "success" : "warning",
            fields: [
              { label: "for", value: model.purpose },
              { label: "input cap", value: `$${model.maxInputCostPerMillion} / M tokens` },
              { label: "output cap", value: `$${model.maxOutputCostPerMillion} / M tokens` },
              { label: "catalog", value: `${state.source} · ${state.scope} · checked ${ageDescription(state.fetchedAt)}` },
              ...(state.warning ? [{ label: "warning", value: state.warning, tone: "warning" as const }] : []),
            ],
          };
        },
        actions: [{
          key: "r", label: "Refresh catalog",
          run: async (_item, panel) => { panel.notice(await refresh(), state.warning ? "warning" : "success"); },
        }],
        empty: "No curated models.",
      };
      if (_args.trim() === "refresh") { const text = await refresh(); ctx.ui.notify(text, state.warning ? "warning" : "info"); return; }
      if (ctx.mode === "tui" && ctx.hasUI) { await openPanel(ctx, spec); return; }
      ctx.ui.notify(panelText(spec), activeModels().length > 0 ? "info" : "warning");
    },
  });
}
