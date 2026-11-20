import { GoogleGenAI } from '@google/genai';
import { env } from '../config/env';
import { LLMProviderId } from '../../shared/types';
import { dbRepo } from '../db/repository';
import { testMcpConnection } from './agy-mcp-service';

export interface LLMExecutionResult {
  provider: LLMProviderId;
  model: string;
  output: string;
  latencyMs: number;
  liveApiUsed: boolean;
}

/**
 * Server-Side Multi-LLM Gateway
 * Supports OpenRouter, Google Gemini (@google/genai), and Meta Llama / OpenAI-compatible endpoints.
 * Dynamic credentials can come from SystemSettings or environment variables.
 * Strictly executed on the server; API keys are never exposed to the client browser.
 */
/**
 * Normaliza URLs de endpoints compatíveis com OpenAI (OpenRouter, Groq, Ollama)
 * Remove barras finais e evita duplicação do path '/chat/completions'.
 */
function resolveChatCompletionsUrl(baseUrlRaw?: string, defaultBase = 'https://openrouter.ai/api/v1'): string {
  let base = (baseUrlRaw || defaultBase).trim();
  while (base.endsWith('/')) {
    base = base.slice(0, -1);
  }
  if (base.endsWith('/chat/completions')) {
    return base;
  }
  return `${base}/chat/completions`;
}

export async function executeLlmPrompt(params: {
  provider?: LLMProviderId;
  prompt: string;
  systemInstruction?: string;
  model?: string;
  apiKey?: string;
  baseUrl?: string;
  temperature?: number;
}): Promise<LLMExecutionResult> {
  const start = Date.now();
  const cleanPrompt = params.prompt.trim();
  const settings = dbRepo.getSystemSettings();

  const provider: LLMProviderId = params.provider || settings.aiProvider || 'openrouter';
  const temperature = params.temperature ?? settings.aiTemperature ?? 0.7;

  // ==========================================================================
  // 1. OPENROUTER (https://openrouter.ai/api/v1/chat/completions)
  // ==========================================================================
  if (provider === 'openrouter') {
    const apiKey = params.apiKey || settings.openRouterApiKey || env.OPENROUTER_API_KEY;
    const modelName = params.model || settings.openRouterModel || env.OPENROUTER_DEFAULT_MODEL || 'openai/gpt-4o-mini';
    const baseUrl = params.baseUrl || settings.openRouterBaseUrl || env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';
    const endpoint = resolveChatCompletionsUrl(baseUrl, 'https://openrouter.ai/api/v1');

    if (apiKey) {
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': env.APP_URL,
            'X-Title': settings.platformName || 'Auto Post WordPress AI',
          },
          signal: AbortSignal.timeout(35000),
          body: JSON.stringify({
            model: modelName,
            temperature,
            messages: [
              ...(params.systemInstruction
                ? [{ role: 'system', content: params.systemInstruction }]
                : []),
              { role: 'user', content: cleanPrompt },
            ],
          }),
        });

        if (res.ok) {
          const data = (await res.json()) as {
            choices?: { message?: { content?: string } }[];
          };
          const text = data.choices?.[0]?.message?.content || 'Empty OpenRouter response.';
          return {
            provider: 'openrouter',
            model: modelName,
            output: text,
            latencyMs: Date.now() - start,
            liveApiUsed: true,
          };
        } else {
          const errData = await res.text();
          let cleanErr = errData.slice(0, 160);
          try {
            const jsonErr = JSON.parse(errData);
            cleanErr = jsonErr?.error?.message || jsonErr?.message || cleanErr;
          } catch {
            if (cleanErr.includes('<!DOCTYPE') || cleanErr.includes('<html')) {
              cleanErr = `Resposta HTML inesperada (código HTTP ${res.status})`;
            }
          }
          throw new Error(`OpenRouter HTTP ${res.status}: ${cleanErr}`);
        }
      } catch (err: any) {
        const isTimeout = err.name === 'TimeoutError' || err.message?.includes('Timeout');
        const msg = isTimeout
          ? `Tempo limite esgotado (35s) conectando ao OpenRouter.`
          : err.message;
        return {
          provider: 'openrouter',
          model: modelName,
          output: `[OpenRouter Error]: ${msg}`,
          latencyMs: Date.now() - start,
          liveApiUsed: false,
        };
      }
    }

    return {
      provider: 'openrouter',
      model: modelName,
      output: `[OpenRouter Adapter (${modelName})]: Chave de API não configurada. Configure sua chave do OpenRouter na aba Configurações.`,
      latencyMs: Math.max(15, Date.now() - start),
      liveApiUsed: false,
    };
  }

  // ==========================================================================
  // 2. GOOGLE GEMINI (@google/genai) — Com Pool de Chaves e Retry Automático
  // ==========================================================================
  if (provider === 'gemini') {
    const rawKeyInput = params.apiKey || settings.geminiApiKey || env.GEMINI_API_KEY || '';
    const keys = rawKeyInput
      .split(/[\n,;]+/)
      .map((k: string) => k.trim())
      .filter((k: string) => k && k !== 'MY_GEMINI_API_KEY');

    let modelName = params.model || settings.geminiModel || env.GEMINI_DEFAULT_MODEL || 'gemini-3.8-flash';
    if (modelName === 'gemini-2.5-flash' || modelName === 'gemini-1.5-flash') {
      modelName = 'gemini-3.8-flash';
    }

    if (keys.length > 0) {
      let lastErrorMessage = '';

      // Rotação sobre o pool de chaves disponíveis
      for (let kIdx = 0; kIdx < keys.length; kIdx++) {
        const apiKey = keys[kIdx];

        // Até 2 tentativas por chave com backoff em caso de alta demanda (503) ou rate limit (429)
        for (let attempt = 1; attempt <= 2; attempt++) {
          try {
            const ai = new GoogleGenAI({
              apiKey,
              httpOptions: {
                headers: {
                  'User-Agent': 'aistudio-build',
                },
              },
            });

            const response = await ai.models.generateContent({
              model: modelName,
              contents: cleanPrompt,
              config: {
                temperature,
                systemInstruction: params.systemInstruction || undefined,
              },
            });

            const text = response.text || '';
            if (text && text.trim()) {
              return {
                provider: 'gemini',
                model: modelName,
                output: text,
                latencyMs: Date.now() - start,
                liveApiUsed: true,
              };
            }
          } catch (err: unknown) {
            lastErrorMessage = err instanceof Error ? err.message : String(err);
            console.warn(
              `[Gemini Pool] Chave ${kIdx + 1}/${keys.length} (Tentativa ${attempt}/2) retornou erro: ${lastErrorMessage.slice(0, 100)}`
            );

            const isTransient =
              lastErrorMessage.includes('503') ||
              lastErrorMessage.includes('429') ||
              lastErrorMessage.includes('high demand') ||
              lastErrorMessage.includes('overloaded');

            if (isTransient && attempt < 2) {
              await new Promise((res) => setTimeout(res, 2000 * attempt));
            } else {
              // Se não for transitório ou já esgotou as tentativas desta chave, passa para a próxima chave do pool
              break;
            }
          }
        }
      }

      return {
        provider: 'gemini',
        model: modelName,
        output: `[Gemini Error (${lastErrorMessage.slice(0, 120)})]: Falha ao comunicar com a API do Google Gemini.`,
        latencyMs: Date.now() - start,
        liveApiUsed: false,
      };
    }

    return {
      provider: 'gemini',
      model: modelName,
      output: `[Gemini Adapter (${modelName})]: GEMINI_API_KEY não configurada. Insira sua chave nas Configurações.`,
      latencyMs: Math.max(12, Date.now() - start),
      liveApiUsed: false,
    };
  }

  // ==========================================================================
  // 3. PAINEL AGY / CLUSTER ANTIGRAVITY (MCP SERVER)
  // ==========================================================================
  if (provider === 'painel-agy') {
    const mcpModel = params.model || settings.mcpAgyModel || 'gemini-3.8-flash';
    const mcpUrl = params.baseUrl || settings.mcpAgyUrl || env.MCP_AGY_URL;
    const mcpToken = params.apiKey || settings.mcpAgyToken || env.MCP_AGY_TOKEN;

    try {
      const mcpTest = await testMcpConnection(mcpUrl, mcpToken);
      if (mcpTest.success) {
        return {
          provider: 'painel-agy',
          model: mcpModel,
          output: mcpTest.output || 'OK - Conexão com Painel AGY estabelecida com sucesso.',
          latencyMs: mcpTest.latencyMs,
          liveApiUsed: true,
        };
      } else {
        throw new Error(mcpTest.error || 'Falha ao conectar com o Servidor MCP.');
      }
    } catch (err: any) {
      return {
        provider: 'painel-agy',
        model: mcpModel,
        output: `[Falha MCP Painel AGY]: ${err.message}`,
        latencyMs: Date.now() - start,
        liveApiUsed: false,
      };
    }
  }

  // ==========================================================================
  // 4. META LLAMA / GROQ / OLLAMA / OPENAI-COMPATIBLE
  // ==========================================================================
  if (provider === 'llama') {
    const apiKey = params.apiKey || settings.llamaApiKey || env.LLAMA_API_KEY;
    const baseUrl = params.baseUrl || settings.llamaBaseUrl || env.LLAMA_API_BASE_URL || 'https://api.groq.com/openai/v1';
    const endpoint = resolveChatCompletionsUrl(baseUrl, 'https://api.groq.com/openai/v1');
    const llamaModel = params.model || settings.llamaModel || env.LLAMA_DEFAULT_MODEL || 'llama-3.3-70b-versatile';

    if (apiKey) {
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'x-api-key': apiKey,
            'Content-Type': 'application/json',
          },
          signal: AbortSignal.timeout(35000),
          body: JSON.stringify({
            model: llamaModel,
            temperature,
            messages: [
              ...(params.systemInstruction
                ? [{ role: 'system', content: params.systemInstruction }]
                : []),
              { role: 'user', content: cleanPrompt },
            ],
          }),
        });

        if (res.ok) {
          const data = (await res.json()) as {
            choices?: { message?: { content?: string } }[];
          };
          const text = data.choices?.[0]?.message?.content || 'Empty response.';
          return {
            provider: 'llama',
            model: llamaModel,
            output: text,
            latencyMs: Date.now() - start,
            liveApiUsed: true,
          };
        } else {
          const errData = await res.text();
          if (res.status === 524) {
            throw new Error(`Timeout de rede Cloudflare (524): O servidor ${baseUrl} demorou mais de 100 segundos para responder.`);
          }
          if (res.status === 502 || res.status === 503) {
            throw new Error(`Servidor inacessível (HTTP ${res.status}): Verifique se o servidor ${baseUrl} está online.`);
          }
          let cleanErr = errData.slice(0, 160);
          try {
            const jsonErr = JSON.parse(errData);
            cleanErr = jsonErr?.error?.message || jsonErr?.message || cleanErr;
          } catch {
            if (cleanErr.includes('<!DOCTYPE') || cleanErr.includes('<html')) {
              cleanErr = `Resposta HTML de erro do gateway proxy (HTTP ${res.status})`;
            }
          }
          throw new Error(`HTTP ${res.status}: ${cleanErr}`);
        }
      } catch (err: any) {
        const isTimeout = err.name === 'TimeoutError' || err.message?.includes('Timeout');
        const msg = isTimeout
          ? `Tempo limite esgotado: O servidor ${baseUrl} demorou mais de 35s para responder à requisição do modelo '${llamaModel}'.`
          : err.message;
        return {
          provider: 'llama',
          model: llamaModel,
          output: `[Falha no Endpoint Customizado]: ${msg}`,
          latencyMs: Date.now() - start,
          liveApiUsed: false,
        };
      }
    }

    return {
      provider: 'llama',
      model: llamaModel,
      output: `[Llama Native Adapter (${llamaModel})]: Chave de API não configurada.`,
      latencyMs: Math.max(14, Date.now() - start),
      liveApiUsed: false,
    };
  }

  return {
    provider: 'openrouter',
    model: 'openai/gpt-4o-mini',
    output: '[LLM Gateway]: Nenhum provedor válido selecionado.',
    latencyMs: Math.max(10, Date.now() - start),
    liveApiUsed: false,
  };
}
