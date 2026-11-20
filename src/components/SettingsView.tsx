import React, { useState, useEffect } from 'react';
import { SystemSettings, LLMProviderId } from '../shared/types';
import {
  Settings,
  Sparkles,
  Palette,
  Bot,
  Sliders,
  CheckCircle2,
  AlertCircle,
  Save,
  RotateCw,
  Cpu,
  Globe,
  Key,
  Shield,
  Layers,
  Terminal,
  Cloud,
  ExternalLink,
  Image as ImageIcon,
} from 'lucide-react';

interface SettingsViewProps {
  token: string;
  onSettingsUpdated?: (settings: SystemSettings) => void;
}

export function SettingsView({ token, onSettingsUpdated }: SettingsViewProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testingAi, setTestingAi] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    output?: string;
    model?: string;
    latencyMs?: number;
    error?: string;
  } | null>(null);

  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [testingR2, setTestingR2] = useState(false);
  const [r2TestResult, setR2TestResult] = useState<{
    success: boolean;
    message?: string;
    endpoint?: string;
    latencyMs?: number;
    error?: string;
  } | null>(null);

  const [selectedAiTab, setSelectedAiTab] = useState<LLMProviderId>('openrouter');

  const switchAiTab = (tab: LLMProviderId) => {
    setSelectedAiTab(tab);
    setTestResult(null);
  };

  const [form, setForm] = useState<SystemSettings>({
    platformName: 'Auto Post WordPress AI',
    platformTagline: 'Automação editorial com IA e sincronização WordPress',
    browserTitle: 'Auto Post WordPress AI — Painel Editorial',
    logoText: 'AP',
    logoUrl: '',
    aiProvider: 'openrouter',
    openRouterApiKey: '',
    openRouterModel: 'openai/gpt-4o-mini',
    openRouterBaseUrl: 'https://openrouter.ai/api/v1',
    openRouterImageModel: 'google/imagen-3',
    geminiApiKey: '',
    geminiModel: 'gemini-2.5-flash',
    geminiImageModel: 'imagen-3.0-generate-002',
    llamaApiKey: '',
    llamaBaseUrl: 'https://api.groq.com/openai/v1',
    llamaModel: 'llama-3.3-70b-versatile',
    llamaImageModel: '',
    mcpAgyUrl: 'https://backend-agy.saletub.com/mcp',
    mcpAgyToken: '',
    mcpAgyModel: 'gemini-3.8-flash',
    mcpImageStrategy: 'temporal_advance',
    mcpTimeoutSeconds: 300,
    aiTemperature: 0.7,
    aiSystemPrompt: '',
    autoRewriteArticles: true,
    autoPublishToWordPress: false,
    defaultRewriteTone: 'jornalistico',
    r2AccountId: '',
    r2AccessKeyId: '',
    r2SecretAccessKey: '',
    r2BucketName: '',
    r2PublicUrl: '',
    r2AutoSync: true,
    imageProvider: 'google-imagen',
    imageHostUrl: '',
    imageHostApiKey: '',
    imageHostModel: 'imagen-3.0-generate-002',
  });

  const [hasKeys, setHasKeys] = useState({
    openRouter: false,
    gemini: false,
    llama: false,
    painelAgy: false,
    r2: false,
    imageHost: false,
  });

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/settings', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        const activeProv = (data.aiProvider as LLMProviderId) || 'openrouter';
        setForm({
          platformName: data.platformName || 'Auto Post WordPress AI',
          platformTagline: data.platformTagline || 'Automação editorial com IA e sincronização WordPress',
          browserTitle: data.browserTitle || 'Auto Post WordPress AI — Painel Editorial',
          logoText: data.logoText || 'AP',
          logoUrl: data.logoUrl || '',
          aiProvider: activeProv,
          openRouterApiKey: '',
          openRouterModel: data.openRouterModel || 'openai/gpt-4o-mini',
          openRouterBaseUrl: data.openRouterBaseUrl || 'https://openrouter.ai/api/v1',
          openRouterImageModel: data.openRouterImageModel || 'google/imagen-3',
          geminiApiKey: '',
          geminiModel: data.geminiModel || 'gemini-2.5-flash',
          geminiImageModel: data.geminiImageModel || 'imagen-3.0-generate-002',
          llamaApiKey: '',
          llamaBaseUrl: data.llamaBaseUrl || 'https://api.groq.com/openai/v1',
          llamaModel: data.llamaModel || 'llama-3.3-70b-versatile',
          llamaImageModel: data.llamaImageModel || '',
          mcpAgyUrl: data.mcpAgyUrl || 'https://backend-agy.saletub.com/mcp',
          mcpAgyToken: '',
          mcpAgyModel: data.mcpAgyModel || 'gemini-3.8-flash',
          mcpImageStrategy: data.mcpImageStrategy || 'temporal_advance',
          mcpTimeoutSeconds: data.mcpTimeoutSeconds ?? 300,
          aiTemperature: data.aiTemperature ?? 0.7,
          aiSystemPrompt: data.aiSystemPrompt || '',
          autoRewriteArticles: data.autoRewriteArticles ?? true,
          autoPublishToWordPress: data.autoPublishToWordPress ?? false,
          defaultRewriteTone: data.defaultRewriteTone || 'jornalistico',
          r2AccountId: data.r2AccountId || '',
          r2AccessKeyId: data.r2AccessKeyId || '',
          r2SecretAccessKey: '',
          r2BucketName: data.r2BucketName || '',
          r2PublicUrl: data.r2PublicUrl || '',
          r2AutoSync: data.r2AutoSync ?? true,
          imageProvider: data.imageProvider || 'google-imagen',
          imageHostUrl: data.imageHostUrl || '',
          imageHostApiKey: '',
          imageHostModel: data.imageHostModel || 'imagen-3.0-generate-002',
        });
        setHasKeys({
          openRouter: Boolean(data.hasOpenRouterKey),
          gemini: Boolean(data.hasGeminiKey),
          llama: Boolean(data.hasLlamaKey),
          painelAgy: Boolean(data.hasMcpAgyToken),
          r2: Boolean(data.hasR2Configured),
          imageHost: Boolean(data.hasImageHostKey),
        });
        setSelectedAiTab(activeProv);
      }
    } catch {
      setFeedback({ type: 'error', message: 'Erro ao carregar configurações do servidor.' });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFeedback(null);

    try {
      const payload: Partial<SystemSettings> = { ...form };
      if (!payload.openRouterApiKey) delete payload.openRouterApiKey;
      if (!payload.geminiApiKey) delete payload.geminiApiKey;
      if (!payload.llamaApiKey) delete payload.llamaApiKey;
      if (!payload.mcpAgyToken) delete payload.mcpAgyToken;
      if (!payload.imageHostApiKey) delete payload.imageHostApiKey;
      if (!payload.r2SecretAccessKey) delete payload.r2SecretAccessKey;

      if (payload.openRouterBaseUrl) {
        payload.openRouterBaseUrl = payload.openRouterBaseUrl.trim().replace(/\/+$/, '');
      }
      if (payload.llamaBaseUrl) {
        payload.llamaBaseUrl = payload.llamaBaseUrl.trim().replace(/\/+$/, '');
      }

      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (res.ok) {
        setFeedback({ type: 'success', message: 'Configurações salvas e aplicadas com sucesso!' });
        if (data.settings) {
          if (onSettingsUpdated) {
            onSettingsUpdated(data.settings);
          }
          document.title = data.settings.browserTitle || data.settings.platformName;
        }
        fetchSettings();
      } else {
        setFeedback({ type: 'error', message: data.error || 'Falha ao salvar configurações.' });
      }
    } catch {
      setFeedback({ type: 'error', message: 'Erro de comunicação ao salvar.' });
    } finally {
      setSaving(false);
    }
  };

  const handleTestR2 = async () => {
    setTestingR2(true);
    setR2TestResult(null);

    try {
      const res = await fetch('/api/settings/r2/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          accountId: form.r2AccountId,
          accessKeyId: form.r2AccessKeyId,
          secretAccessKey: form.r2SecretAccessKey || undefined,
          bucketName: form.r2BucketName,
          publicUrl: form.r2PublicUrl,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setR2TestResult({
          success: true,
          message: data.message || 'Conexão com Cloudflare R2 bem-sucedida! Bucket e CDN operacionais.',
          endpoint: data.endpoint,
          latencyMs: data.latencyMs,
        });
      } else {
        setR2TestResult({
          success: false,
          error: data.error || data.message || 'Falha na comunicação com o Cloudflare R2.',
        });
      }
    } catch (err: any) {
      setR2TestResult({
        success: false,
        error: err.message || 'Erro de rede ao testar Cloudflare R2.',
      });
    } finally {
      setTestingR2(false);
    }
  };

  const handleTestAi = async () => {
    setTestingAi(true);
    setTestResult(null);

    const targetProvider = selectedAiTab;
    let apiKey = '';
    let model = '';
    let baseUrl = '';

    if (targetProvider === 'openrouter') {
      apiKey = form.openRouterApiKey || '';
      model = form.openRouterModel || '';
      baseUrl = (form.openRouterBaseUrl || '').trim().replace(/\/+$/, '');
    } else if (targetProvider === 'gemini') {
      apiKey = form.geminiApiKey || '';
      model = form.geminiModel || '';
    } else if (targetProvider === 'painel-agy') {
      apiKey = form.mcpAgyToken || '';
      model = form.mcpAgyModel || 'gemini-3.8-flash';
      baseUrl = (form.mcpAgyUrl || 'https://backend-agy.saletub.com/mcp').trim().replace(/\/+$/, '');
    } else {
      apiKey = form.llamaApiKey || '';
      model = form.llamaModel || '';
      baseUrl = (form.llamaBaseUrl || '').trim().replace(/\/+$/, '');
    }

    try {
      const res = await fetch('/api/settings/ai/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          provider: targetProvider,
          apiKey: apiKey || undefined,
          model: model || undefined,
          baseUrl: baseUrl || undefined,
          mcpUrl: baseUrl || undefined,
          mcpToken: apiKey || undefined,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setTestResult({
          success: data.result?.liveApiUsed ?? true,
          output: data.result?.output,
          model: data.result?.model,
          latencyMs: data.result?.latencyMs,
        });
      } else {
        setTestResult({
          success: false,
          error: data.error || 'Falha ao testar IA.',
        });
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        error: err.message || 'Erro de conexão.',
      });
    } finally {
      setTestingAi(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-500">
        <RotateCw className="w-6 h-6 animate-spin mr-2" />
        Carregando configurações...
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Settings className="w-5 h-5 text-indigo-600" />
            Configurações da Plataforma
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Personalize a identidade visual, white-label, nome do sistema e os motores de inteligência artificial.
          </p>
        </div>

        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors disabled:opacity-60 cursor-pointer"
        >
          {saving ? <RotateCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          <span>{saving ? 'Salvando...' : 'Salvar Alterações'}</span>
        </button>
      </div>

      {feedback && (
        <div
          className={`p-3.5 rounded-lg text-xs font-medium flex items-center gap-2.5 ${
            feedback.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-rose-50 text-rose-800 border border-rose-200'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        {/* SEÇÃO 1: IDENTIDADE VISUAL & WHITE-LABEL */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
            <Palette className="w-4 h-4 text-slate-700" />
            <h2 className="text-sm font-semibold text-slate-900">Identidade Visual & White-Label</h2>
          </div>

          <div className="p-5 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Nome da Plataforma (Exibido na Sidebar e Login)
                </label>
                <input
                  type="text"
                  value={form.platformName}
                  onChange={(e) => setForm({ ...form, platformName: e.target.value })}
                  className="w-full text-xs px-3 py-2 border border-slate-300 rounded-md focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="Auto Post WordPress AI"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Título na Aba do Navegador (Document Title)
                </label>
                <input
                  type="text"
                  value={form.browserTitle}
                  onChange={(e) => setForm({ ...form, browserTitle: e.target.value })}
                  className="w-full text-xs px-3 py-2 border border-slate-300 rounded-md focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="Auto Post WordPress AI — Painel Editorial"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Slogan / Subtítulo da Plataforma
                </label>
                <input
                  type="text"
                  value={form.platformTagline}
                  onChange={(e) => setForm({ ...form, platformTagline: e.target.value })}
                  className="w-full text-xs px-3 py-2 border border-slate-300 rounded-md focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="Automação editorial com IA e sincronização WordPress"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Sigla do Ícone (2 letras)
                </label>
                <input
                  type="text"
                  maxLength={4}
                  value={form.logoText}
                  onChange={(e) => setForm({ ...form, logoText: e.target.value.toUpperCase() })}
                  className="w-full text-xs px-3 py-2 border border-slate-300 rounded-md uppercase font-mono font-bold"
                  placeholder="AP"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                URL da Imagem do Logotipo (Opcional)
              </label>
              <input
                type="url"
                value={form.logoUrl || ''}
                onChange={(e) => setForm({ ...form, logoUrl: e.target.value })}
                className="w-full text-xs px-3 py-2 border border-slate-300 rounded-md focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                placeholder="https://meusite.com/logo.png"
              />
            </div>

            {/* Live Preview Card */}
            <div className="mt-3 p-3.5 bg-slate-50 border border-slate-200 rounded-lg">
              <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
                Prévia de Marca (Sidebar / Topbar)
              </div>
              <div className="flex items-center gap-3 bg-white p-3 rounded-md border border-slate-200 w-fit">
                {form.logoUrl ? (
                  <img src={form.logoUrl} alt="Logo" className="w-7 h-7 object-contain rounded" />
                ) : (
                  <div className="w-7 h-7 bg-slate-900 rounded flex items-center justify-center text-white font-mono text-xs font-bold">
                    {form.logoText || 'AP'}
                  </div>
                )}
                <div>
                  <div className="text-xs font-bold text-slate-900">{form.platformName}</div>
                  <div className="text-[10px] text-slate-500">{form.platformTagline}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* SEÇÃO 2: MOTOR DE INTELIGÊNCIA ARTIFICIAL (AI ENGINE) */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-600" />
              <h2 className="text-sm font-semibold text-slate-900">Motor de Inteligência Artificial (AI Engine)</h2>
            </div>
            <span className="text-[11px] font-mono text-slate-500 bg-slate-200/60 px-2 py-0.5 rounded">
              Multi-LLM Gateway
            </span>
          </div>

          <div className="p-5 space-y-5">
            {/* Escolha do Provedor Ativo */}
            <div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-2">
                <label className="block text-xs font-semibold text-slate-800">
                  Provedor de IA Padrão para Reescrita de Notícias
                </label>
                <span className="text-[11px] text-slate-500">
                  Apenas 1 motor opera como <strong className="text-emerald-700 font-semibold">Ativo</strong> por vez; os demais mantêm seus dados salvos.
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {/* Opção OpenRouter */}
                <div
                  onClick={() => switchAiTab('openrouter')}
                  className={`p-3.5 rounded-lg border cursor-pointer transition-all flex flex-col justify-between ${
                    selectedAiTab === 'openrouter'
                      ? 'border-indigo-600 bg-indigo-50/40 ring-1 ring-indigo-600 shadow-xs'
                      : 'border-slate-200 hover:border-slate-300 bg-white'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                        <Cpu className="w-3.5 h-3.5 text-indigo-600" />
                        OpenRouter
                      </span>
                      {form.aiProvider === 'openrouter' ? (
                        <span className="inline-flex items-center gap-1 text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-bold border border-emerald-300 shadow-xs">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse"></span>
                          Ativo
                        </span>
                      ) : hasKeys.openRouter ? (
                        <span className="text-[10px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full font-medium border border-slate-200">
                          Salvo
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-400">
                          Não configurado
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      Acesso a mais de 200+ modelos (GPT-4o, Claude 3.5, DeepSeek V3, Llama 3.3).
                    </p>
                  </div>

                  <div className="mt-3 pt-2 border-t border-slate-100">
                    {form.aiProvider === 'openrouter' ? (
                      <span className="text-[11px] font-semibold text-emerald-700 flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        Motor Ativo em Produção
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setForm({ ...form, aiProvider: 'openrouter' });
                          switchAiTab('openrouter');
                        }}
                        className="w-full text-center text-[11px] font-semibold text-indigo-700 bg-white hover:bg-indigo-50 border border-indigo-200 hover:border-indigo-300 px-2.5 py-1 rounded transition-colors cursor-pointer"
                      >
                        Ativar este Motor
                      </button>
                    )}
                  </div>
                </div>

                {/* Opção Google Gemini */}
                <div
                  onClick={() => switchAiTab('gemini')}
                  className={`p-3.5 rounded-lg border cursor-pointer transition-all flex flex-col justify-between ${
                    selectedAiTab === 'gemini'
                      ? 'border-indigo-600 bg-indigo-50/40 ring-1 ring-indigo-600 shadow-xs'
                      : 'border-slate-200 hover:border-slate-300 bg-white'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                        <Bot className="w-3.5 h-3.5 text-indigo-600" />
                        Google Gemini
                      </span>
                      {form.aiProvider === 'gemini' ? (
                        <span className="inline-flex items-center gap-1 text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-bold border border-emerald-300 shadow-xs">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse"></span>
                          Ativo
                        </span>
                      ) : hasKeys.gemini ? (
                        <span className="text-[10px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full font-medium border border-slate-200">
                          Salvo
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-400">
                          Não configurado
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      SDK nativo oficial do Google com alta velocidade e janela de contexto estendida.
                    </p>
                  </div>

                  <div className="mt-3 pt-2 border-t border-slate-100">
                    {form.aiProvider === 'gemini' ? (
                      <span className="text-[11px] font-semibold text-emerald-700 flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        Motor Ativo em Produção
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setForm({ ...form, aiProvider: 'gemini' });
                          switchAiTab('gemini');
                        }}
                        className="w-full text-center text-[11px] font-semibold text-indigo-700 bg-white hover:bg-indigo-50 border border-indigo-200 hover:border-indigo-300 px-2.5 py-1 rounded transition-colors cursor-pointer"
                      >
                        Ativar este Motor
                      </button>
                    )}
                  </div>
                </div>

                {/* Opção Llama / Groq / Ollama */}
                <div
                  onClick={() => switchAiTab('llama')}
                  className={`p-3.5 rounded-lg border cursor-pointer transition-all flex flex-col justify-between ${
                    selectedAiTab === 'llama'
                      ? 'border-indigo-600 bg-indigo-50/40 ring-1 ring-indigo-600 shadow-xs'
                      : 'border-slate-200 hover:border-slate-300 bg-white'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                        <Terminal className="w-3.5 h-3.5 text-indigo-600" />
                        Groq / Ollama / Custom
                      </span>
                      {form.aiProvider === 'llama' ? (
                        <span className="inline-flex items-center gap-1 text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-bold border border-emerald-300 shadow-xs">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse"></span>
                          Ativo
                        </span>
                      ) : hasKeys.llama ? (
                        <span className="text-[10px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full font-medium border border-slate-200">
                          Salvo
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-400">
                          Não configurado
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      Endpoints padrão OpenAI-compatible, Groq ultra-rápido ou servidor Ollama local.
                    </p>
                  </div>

                  <div className="mt-3 pt-2 border-t border-slate-100">
                    {form.aiProvider === 'llama' ? (
                      <span className="text-[11px] font-semibold text-emerald-700 flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        Motor Ativo em Produção
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setForm({ ...form, aiProvider: 'llama' });
                          switchAiTab('llama');
                        }}
                        className="w-full text-center text-[11px] font-semibold text-indigo-700 bg-white hover:bg-indigo-50 border border-indigo-200 hover:border-indigo-300 px-2.5 py-1 rounded transition-colors cursor-pointer"
                      >
                        Ativar este Motor
                      </button>
                    )}
                  </div>
                </div>

                {/* Opção Painel AGY (Cluster Antigravity / MCP) */}
                <div
                  onClick={() => switchAiTab('painel-agy')}
                  className={`p-3.5 rounded-lg border cursor-pointer transition-all flex flex-col justify-between ${
                    selectedAiTab === 'painel-agy'
                      ? 'border-indigo-600 bg-indigo-50/40 ring-1 ring-indigo-600 shadow-xs'
                      : 'border-slate-200 hover:border-slate-300 bg-white'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                        <Globe className="w-3.5 h-3.5 text-indigo-600" />
                        Painel AGY (MCP)
                      </span>
                      {form.aiProvider === 'painel-agy' ? (
                        <span className="inline-flex items-center gap-1 text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-bold border border-emerald-300 shadow-xs">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse"></span>
                          Ativo
                        </span>
                      ) : hasKeys.painelAgy ? (
                        <span className="text-[10px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full font-medium border border-slate-200">
                          Salvo
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-400">
                          Não configurado
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      Cluster Antigravity via SSE: reescrita aprofundada SEO e geração de fotos inéditas anti-plágio (Google Imagen 3).
                    </p>
                  </div>

                  <div className="mt-3 pt-2 border-t border-slate-100">
                    {form.aiProvider === 'painel-agy' ? (
                      <span className="text-[11px] font-semibold text-emerald-700 flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        Motor Ativo em Produção
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setForm({ ...form, aiProvider: 'painel-agy' });
                          switchAiTab('painel-agy');
                        }}
                        className="w-full text-center text-[11px] font-semibold text-indigo-700 bg-white hover:bg-indigo-50 border border-indigo-200 hover:border-indigo-300 px-2.5 py-1 rounded transition-colors cursor-pointer"
                      >
                        Ativar este Motor
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Painel Específico do Provedor Selecionado para Edição */}
            {selectedAiTab === 'openrouter' && (
              <div className="p-4 bg-indigo-50/30 rounded-lg border border-indigo-100 space-y-3.5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-indigo-100/70">
                  <div className="flex items-center gap-2 text-xs font-bold text-indigo-950">
                    <Key className="w-3.5 h-3.5 text-indigo-600" />
                    Credenciais e Modelo do OpenRouter
                  </div>
                  {form.aiProvider === 'openrouter' ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-xs">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse"></span>
                      Motor Ativo no Sistema (Reescrita Oficial)
                    </span>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-slate-500">Credenciais Salvas (Motor Inativo)</span>
                      <button
                        type="button"
                        onClick={() => setForm({ ...form, aiProvider: 'openrouter' })}
                        className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-[11px] font-semibold transition-colors cursor-pointer shadow-xs"
                      >
                        Definir como Motor Ativo
                      </button>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-slate-700 mb-1">
                    Chave de API do OpenRouter ({hasKeys.openRouter ? 'Configurada no Servidor ✓' : 'Não configurada'})
                  </label>
                  <input
                    type="password"
                    value={form.openRouterApiKey}
                    onChange={(e) => setForm({ ...form, openRouterApiKey: e.target.value })}
                    className="w-full text-xs font-mono px-3 py-2 border border-slate-300 rounded-md bg-white focus:ring-1 focus:ring-indigo-500"
                    placeholder={hasKeys.openRouter ? '•••••••••••••••••••••••• (deixe vazio para manter a salva)' : 'sk-or-v1-...'}
                  />
                  <p className="text-[10px] text-slate-500 mt-1">
                    Obtenha sua chave em <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer" className="text-indigo-600 underline">openrouter.ai/keys</a>.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-700 mb-1">
                      Modelo de Texto do OpenRouter
                    </label>
                    <input
                      type="text"
                      value={form.openRouterModel}
                      onChange={(e) => setForm({ ...form, openRouterModel: e.target.value })}
                      className="w-full text-xs font-mono px-3 py-2 border border-slate-300 rounded-md bg-white"
                      placeholder="openai/gpt-4o-mini"
                    />
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {['openai/gpt-4o-mini', 'anthropic/claude-3.5-sonnet', 'deepseek/deepseek-chat', 'meta-llama/llama-3.3-70b-instruct', 'google/gemini-2.5-flash'].map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setForm({ ...form, openRouterModel: m })}
                          className={`text-[9px] px-1.5 py-0.5 rounded border transition-colors cursor-pointer ${
                            form.openRouterModel === m
                              ? 'bg-indigo-600 text-white border-indigo-600'
                              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          {m.split('/')[1] || m}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-700 mb-1">
                      Modelo de Imagem do OpenRouter (Opcional)
                    </label>
                    <input
                      type="text"
                      value={form.openRouterImageModel || ''}
                      onChange={(e) => setForm({ ...form, openRouterImageModel: e.target.value })}
                      className="w-full text-xs font-mono px-3 py-2 border border-slate-300 rounded-md bg-white"
                      placeholder="google/imagen-3"
                    />
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {['google/imagen-3', 'black-forest-labs/flux-1-schnell', 'openai/dall-e-3'].map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setForm({ ...form, openRouterImageModel: m })}
                          className={`text-[9px] px-1.5 py-0.5 rounded border transition-colors cursor-pointer ${
                            (form.openRouterImageModel || 'google/imagen-3') === m
                              ? 'bg-purple-600 text-white border-purple-600 font-semibold'
                              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          {m.split('/')[1] || m}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {selectedAiTab === 'gemini' && (
              <div className="p-4 bg-indigo-50/30 rounded-lg border border-indigo-100 space-y-3.5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-indigo-100/70">
                  <div className="flex items-center gap-2 text-xs font-bold text-indigo-950">
                    <Key className="w-3.5 h-3.5 text-indigo-600" />
                    Credenciais e Modelo do Google Gemini
                  </div>
                  {form.aiProvider === 'gemini' ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-xs">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse"></span>
                      Motor Ativo no Sistema (Reescrita Oficial)
                    </span>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-slate-500">Credenciais Salvas (Motor Inativo)</span>
                      <button
                        type="button"
                        onClick={() => setForm({ ...form, aiProvider: 'gemini' })}
                        className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-[11px] font-semibold transition-colors cursor-pointer shadow-xs"
                      >
                        Definir como Motor Ativo
                      </button>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-slate-700 mb-1">
                    Chaves de API do Gemini ({hasKeys.gemini ? 'Configurada no Servidor ✓' : 'Não configurada'})
                  </label>
                  <input
                    type="password"
                    value={form.geminiApiKey}
                    onChange={(e) => setForm({ ...form, geminiApiKey: e.target.value })}
                    className="w-full text-xs font-mono px-3 py-2 border border-slate-300 rounded-md bg-white focus:ring-1 focus:ring-indigo-500"
                    placeholder={hasKeys.gemini ? '•••••••••••••••••••••••• (deixe vazio para manter a salva)' : 'Cole uma ou mais chaves separadas por vírgula (AIzaSy..., AIzaSy...)'}
                  />
                  <p className="text-[10px] text-slate-500 mt-1">
                    Pool de Chaves com Failover: Aceita várias chaves separadas por vírgula. Se uma chave atingir limite de cota ou sobrecarga temporária (503/429), o sistema alterna automaticamente para a próxima chave.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-700 mb-1">
                      Modelo de Texto do Gemini
                    </label>
                    <input
                      type="text"
                      value={form.geminiModel}
                      onChange={(e) => setForm({ ...form, geminiModel: e.target.value })}
                      className="w-full text-xs font-mono px-3 py-2 border border-slate-300 rounded-md bg-white"
                      placeholder="gemini-3.8-flash"
                    />
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {['gemini-3.8-flash', 'gemini-3.5-flash-lite', 'gemini-2.5-flash'].map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setForm({ ...form, geminiModel: m })}
                          className={`text-[9px] px-1.5 py-0.5 rounded border transition-colors cursor-pointer ${
                            form.geminiModel === m
                              ? 'bg-indigo-600 text-white border-indigo-600'
                              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          {m}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-700 mb-1">
                      Modelo de Imagem do Gemini (Google Imagen 3)
                    </label>
                    <input
                      type="text"
                      value={form.geminiImageModel || ''}
                      onChange={(e) => setForm({ ...form, geminiImageModel: e.target.value })}
                      className="w-full text-xs font-mono px-3 py-2 border border-slate-300 rounded-md bg-white"
                      placeholder="imagen-3.0-generate-002"
                    />
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {['imagen-3.0-generate-002', 'imagen-3.0-fast-generate-001'].map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setForm({ ...form, geminiImageModel: m })}
                          className={`text-[9px] px-1.5 py-0.5 rounded border transition-colors cursor-pointer ${
                            (form.geminiImageModel || 'imagen-3.0-generate-002') === m
                              ? 'bg-purple-600 text-white border-purple-600 font-semibold'
                              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          {m}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {selectedAiTab === 'llama' && (
              <div className="p-4 bg-indigo-50/30 rounded-lg border border-indigo-100 space-y-3.5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-indigo-100/70">
                  <div className="flex items-center gap-2 text-xs font-bold text-indigo-950">
                    <Key className="w-3.5 h-3.5 text-indigo-600" />
                    Credenciais e Endpoint Groq / Ollama / Custom
                  </div>
                  {form.aiProvider === 'llama' ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-xs">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse"></span>
                      Motor Ativo no Sistema (Reescrita Oficial)
                    </span>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-slate-500">Credenciais Salvas (Motor Inativo)</span>
                      <button
                        type="button"
                        onClick={() => setForm({ ...form, aiProvider: 'llama' })}
                        className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-[11px] font-semibold transition-colors cursor-pointer shadow-xs"
                      >
                        Definir como Motor Ativo
                      </button>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-slate-700 mb-1">
                    Chave de API ({hasKeys.llama ? 'Configurada ✓' : 'Não configurada'})
                  </label>
                  <input
                    type="password"
                    value={form.llamaApiKey}
                    onChange={(e) => setForm({ ...form, llamaApiKey: e.target.value })}
                    className="w-full text-xs font-mono px-3 py-2 border border-slate-300 rounded-md bg-white"
                    placeholder={hasKeys.llama ? '•••••••••••••••••••••••• (deixe vazio para manter a salva)' : 'gsk_... ou chave local'}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-700 mb-1">
                      URL Base da API
                    </label>
                    <input
                      type="text"
                      value={form.llamaBaseUrl}
                      onChange={(e) => setForm({ ...form, llamaBaseUrl: e.target.value })}
                      className="w-full text-xs font-mono px-3 py-2 border border-slate-300 rounded-md bg-white"
                      placeholder="https://api.groq.com/openai/v1"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-700 mb-1">
                      Modelo de Texto
                    </label>
                    <input
                      type="text"
                      value={form.llamaModel}
                      onChange={(e) => setForm({ ...form, llamaModel: e.target.value })}
                      className="w-full text-xs font-mono px-3 py-2 border border-slate-300 rounded-md bg-white"
                      placeholder="llama-3.3-70b-versatile"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-700 mb-1">
                      Modelo de Imagem (Opcional)
                    </label>
                    <input
                      type="text"
                      value={form.llamaImageModel || ''}
                      onChange={(e) => setForm({ ...form, llamaImageModel: e.target.value })}
                      className="w-full text-xs font-mono px-3 py-2 border border-slate-300 rounded-md bg-white"
                      placeholder="ex: flux-1-schnell"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Painel Específico do Painel AGY (Cluster Antigravity / MCP) */}
            {selectedAiTab === 'painel-agy' && (
              <div className="p-4 bg-indigo-50/30 rounded-lg border border-indigo-100 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-indigo-100/70">
                  <div className="flex items-center gap-2 text-xs font-bold text-indigo-950">
                    <Globe className="w-3.5 h-3.5 text-indigo-600" />
                    Credenciais e Configurações Painel AGY (Cluster Antigravity / MCP)
                  </div>
                  {form.aiProvider === 'painel-agy' ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-xs">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse"></span>
                      Motor Ativo no Sistema (Reescrita & Fotos Inéditas)
                    </span>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-slate-500">Credenciais Salvas (Motor Inativo)</span>
                      <button
                        type="button"
                        onClick={() => setForm({ ...form, aiProvider: 'painel-agy' })}
                        className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-[11px] font-semibold transition-colors cursor-pointer shadow-xs"
                      >
                        Definir como Motor Ativo
                      </button>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-700 mb-1">
                      URL Endpoint do Servidor MCP
                    </label>
                    <input
                      type="text"
                      value={form.mcpAgyUrl}
                      onChange={(e) => setForm({ ...form, mcpAgyUrl: e.target.value })}
                      className="w-full text-xs font-mono px-3 py-2 border border-slate-300 rounded-md bg-white focus:ring-1 focus:ring-indigo-500"
                      placeholder="https://backend-agy.saletub.com/mcp"
                    />
                    <p className="text-[10px] text-slate-500 mt-1">
                      Suporta SSE persistente (/sse) com keepalives a cada 15s para eliminar erro 524 Cloudflare.
                    </p>
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-700 mb-1">
                      Token de Autenticação MCP ({hasKeys.painelAgy ? 'Configurada no Servidor ✓' : 'Não configurada'})
                    </label>
                    <input
                      type="password"
                      value={form.mcpAgyToken}
                      onChange={(e) => setForm({ ...form, mcpAgyToken: e.target.value })}
                      className="w-full text-xs font-mono px-3 py-2 border border-slate-300 rounded-md bg-white focus:ring-1 focus:ring-indigo-500"
                      placeholder={hasKeys.painelAgy ? '•••••••••••••••••••••••• (deixe vazio para manter a salva)' : 'mcp_live_...'}
                    />
                    <p className="text-[10px] text-slate-500 mt-1">
                      Chave bearer gerada no Painel AGY com escopo de conversas e computação em nuvem.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-700 mb-1">
                      Modelo do Cluster Antigravity
                    </label>
                    <input
                      type="text"
                      value={form.mcpAgyModel}
                      onChange={(e) => setForm({ ...form, mcpAgyModel: e.target.value })}
                      className="w-full text-xs font-mono px-3 py-2 border border-slate-300 rounded-md bg-white"
                      placeholder="gemini-3.8-flash"
                    />
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {['gemini-3.8-flash', 'claude-sonnet-4-6', 'claude-opus-4-6-thinking', 'beta-opus-5-5'].map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setForm({ ...form, mcpAgyModel: m })}
                          className={`text-[10px] px-2 py-0.5 rounded border transition-colors cursor-pointer ${
                            form.mcpAgyModel === m
                              ? 'bg-indigo-600 text-white border-indigo-600 font-semibold'
                              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          {m}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-700 mb-1">
                      Timeout Máximo por Turno (Segundos)
                    </label>
                    <input
                      type="number"
                      min={60}
                      max={600}
                      value={form.mcpTimeoutSeconds || 300}
                      onChange={(e) => setForm({ ...form, mcpTimeoutSeconds: Number(e.target.value) || 300 })}
                      className="w-full text-xs font-mono px-3 py-2 border border-slate-300 rounded-md bg-white"
                      placeholder="300"
                    />
                    <p className="text-[10px] text-slate-500 mt-1">
                      Padrão 300s (5 minutos). O transporte via SSE mantém heartbeats regulares com a nuvem sem travar.
                    </p>
                  </div>
                </div>

                {/* Estratégia de Criação de Imagem Anti-Plágio */}
                <div className="pt-3 border-t border-indigo-100/70">
                  <label className="block text-xs font-semibold text-indigo-950 mb-1">
                    Estratégia de Criação de Imagem Inédita Anti-Plágio (Google Imagen 3)
                  </label>
                  <p className="text-[11px] text-slate-600 mb-2.5 leading-relaxed">
                    Para blindar o portal contra cópia visual e notificações de direitos autorais, a imagem da matéria original é substituída por uma foto 100% autoral gerada pelo cluster:
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div
                      onClick={() => setForm({ ...form, mcpImageStrategy: 'temporal_advance' })}
                      className={`p-3 rounded-lg border cursor-pointer transition-all ${
                        (form.mcpImageStrategy || 'temporal_advance') === 'temporal_advance'
                          ? 'border-indigo-600 bg-indigo-50/70 ring-1 ring-indigo-600'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                          Avanço Temporal (Recomendado)
                        </span>
                        {(form.mcpImageStrategy || 'temporal_advance') === 'temporal_advance' && (
                          <span className="text-[10px] font-bold text-indigo-700 bg-indigo-100 px-1.5 py-0.5 rounded">
                            Selecionado
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 leading-relaxed">
                        Inspeciona a imagem original e projeta a cena alguns segundos à frente no tempo (simulando continuidade realista, movimento de pessoas/veículos, novo ângulo e iluminação 8k). Imagem única sem plágio visual.
                      </p>
                    </div>

                    <div
                      onClick={() => setForm({ ...form, mcpImageStrategy: 'content_concept' })}
                      className={`p-3 rounded-lg border cursor-pointer transition-all ${
                        form.mcpImageStrategy === 'content_concept'
                          ? 'border-indigo-600 bg-indigo-50/70 ring-1 ring-indigo-600'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                          <Layers className="w-3.5 h-3.5 text-indigo-600" />
                          Criação Conceitual Fotorrealista
                        </span>
                        {form.mcpImageStrategy === 'content_concept' && (
                          <span className="text-[10px] font-bold text-indigo-700 bg-indigo-100 px-1.5 py-0.5 rounded">
                            Selecionado
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 leading-relaxed">
                        Gera uma fotografia editorial inédita em alta resolução criada do zero com base no contexto do artigo, palavras-chave de SEO e assunto principal da reportagem.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Teste de Conexão com o Motor de IA */}
            <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <button
                  type="button"
                  onClick={handleTestAi}
                  disabled={testingAi}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white text-xs font-medium rounded-md transition-colors disabled:opacity-60 cursor-pointer"
                >
                  {testingAi ? <RotateCw className="w-3.5 h-3.5 animate-spin" /> : <Bot className="w-3.5 h-3.5" />}
                  <span>
                    {testingAi
                      ? 'Testando Conexão...'
                      : `Testar Conexão (${selectedAiTab === 'painel-agy' ? 'Painel AGY MCP' : selectedAiTab === 'gemini' ? 'Google Gemini' : selectedAiTab === 'openrouter' ? 'OpenRouter' : 'Groq / Custom'}) Agora`}
                  </span>
                </button>
              </div>

              {testResult && (
                <div
                  className={`text-xs p-2.5 rounded-md border flex items-center gap-2 ${
                    testResult.success
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      : 'bg-rose-50 text-rose-800 border-rose-200'
                  }`}
                >
                  {testResult.success ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  )}
                  <div>
                    <span className="font-semibold">
                      {testResult.success ? `Sucesso (${testResult.latencyMs}ms)!` : 'Falha no Teste:'}
                    </span>{' '}
                    <span className="text-[11px]">{testResult.output || testResult.error}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Parâmetros de Geração & Tom de Reescrita */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-slate-100">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Tom de Reescrita Editorial Padrão
                </label>
                <select
                  value={form.defaultRewriteTone}
                  onChange={(e: any) => setForm({ ...form, defaultRewriteTone: e.target.value })}
                  className="w-full text-xs px-3 py-2 border border-slate-300 rounded-md bg-white cursor-pointer"
                >
                  <option value="jornalistico">Jornalístico (Informativo, Objetivo e Formal)</option>
                  <option value="persuasivo">Persuasivo (Engajador, com Gatilhos de Atenção)</option>
                  <option value="analitico">Analítico (Aprofundado, com Contexto e Dados)</option>
                  <option value="didatico">Didático (Explicativo e Acessível a Todos)</option>
                </select>
              </div>

              <div>
                <div className="flex justify-between text-xs font-medium text-slate-700 mb-1">
                  <span>Temperatura da IA: {form.aiTemperature}</span>
                  <span className="text-[10px] text-slate-500">
                    {form.aiTemperature < 0.4 ? 'Muito Factual' : form.aiTemperature > 0.8 ? 'Mais Criativo' : 'Equilibrado'}
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={form.aiTemperature}
                  onChange={(e) => setForm({ ...form, aiTemperature: parseFloat(e.target.value) })}
                  className="w-full accent-indigo-600 cursor-pointer"
                />
              </div>
            </div>

            {/* Prompt do Sistema de Reescrita (Customizável) */}
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1 flex items-center justify-between">
                <span>Prompt de Instrução do Sistema (System Instruction)</span>
                <span className="text-[10px] text-slate-400">Usado por todos os sites conectados</span>
              </label>
              <textarea
                rows={7}
                value={form.aiSystemPrompt}
                onChange={(e) => setForm({ ...form, aiSystemPrompt: e.target.value })}
                className="w-full text-[11px] font-mono leading-relaxed p-3 border border-slate-300 rounded-md bg-slate-50 focus:bg-white focus:ring-1 focus:ring-indigo-500"
                placeholder="Insira as regras editoriais para a IA..."
              />
            </div>
          </div>
        </div>

        {/* SEÇÃO 3: AUTOMAÇÃO EDITORIAL */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
            <Sliders className="w-4 h-4 text-slate-700" />
            <h2 className="text-sm font-semibold text-slate-900">Automação Editorial Padrão</h2>
          </div>

          <div className="p-5 space-y-4">
            <div className="flex items-center justify-between py-2 border-b border-slate-100">
              <div>
                <div className="text-xs font-semibold text-slate-900">Reescrita Automática com IA</div>
                <div className="text-[11px] text-slate-500">
                  Acionar automaticamente o motor de IA configurado assim que uma nova notícia for capturada.
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.autoRewriteArticles}
                  onChange={(e) => setForm({ ...form, autoRewriteArticles: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
              </label>
            </div>

            <div className="flex items-center justify-between py-2">
              <div>
                <div className="text-xs font-semibold text-slate-900">Auto-publicação para WordPress</div>
                <div className="text-[11px] text-slate-500">
                  Publicar diretamente no site WordPress vinculado assim que o artigo for reescrito pela IA.
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.autoPublishToWordPress}
                  onChange={(e) => setForm({ ...form, autoPublishToWordPress: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
              </label>
            </div>
          </div>
        </div>

        {/* SEÇÃO 4: CLOUDFLARE R2 EDGE STORAGE & CDN */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Cloud className="w-4 h-4 text-orange-500" />
              <h2 className="text-sm font-semibold text-slate-900">Cloudflare R2 Edge Storage (CDN & Feeds JSON)</h2>
            </div>
            <div className="flex items-center gap-2">
              {hasKeys.r2 && (
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 text-emerald-600" /> R2 Configurado
                </span>
              )}
            </div>
          </div>

          <div className="p-5 space-y-4">
            <p className="text-xs text-slate-600 leading-relaxed">
              Os artigos capturados e os feeds são sincronizados como JSONs estáticos no Cloudflare R2 com taxa zero de saída (zero egress). Feeds agregados são automaticamente particionados em janelas de 6h no Fuso Horário de Recife (America/Recife UTC-3).
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Cloudflare Account ID
                </label>
                <input
                  type="text"
                  value={form.r2AccountId || ''}
                  onChange={(e) => setForm({ ...form, r2AccountId: e.target.value })}
                  className="w-full text-xs px-3 py-2 border border-slate-300 rounded-md font-mono"
                  placeholder="4830cafc5dff5d7c50b8623b89b9b8c9"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Nome do Bucket R2
                </label>
                <input
                  type="text"
                  value={form.r2BucketName || ''}
                  onChange={(e) => setForm({ ...form, r2BucketName: e.target.value })}
                  className="w-full text-xs px-3 py-2 border border-slate-300 rounded-md font-mono"
                  placeholder="cdn-imagens"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  R2 Access Key ID
                </label>
                <input
                  type="text"
                  value={form.r2AccessKeyId || ''}
                  onChange={(e) => setForm({ ...form, r2AccessKeyId: e.target.value })}
                  className="w-full text-xs px-3 py-2 border border-slate-300 rounded-md font-mono"
                  placeholder="f60e9da5ad3f0eeabab24de5dc987edf"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1 flex items-center justify-between">
                  <span>R2 Secret Access Key</span>
                  {hasKeys.r2 && <span className="text-[10px] text-emerald-600 font-medium">Chave salva</span>}
                </label>
                <input
                  type="password"
                  value={form.r2SecretAccessKey || ''}
                  onChange={(e) => setForm({ ...form, r2SecretAccessKey: e.target.value })}
                  className="w-full text-xs px-3 py-2 border border-slate-300 rounded-md font-mono"
                  placeholder={hasKeys.r2 ? '•••••••••••••••••••••••••••••••• (inalterada)' : 'Cole a secret key do R2'}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Domínio Público do CDN (Custom Domain associado ao Bucket)
              </label>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={form.r2PublicUrl || ''}
                  onChange={(e) => setForm({ ...form, r2PublicUrl: e.target.value })}
                  className="flex-1 text-xs px-3 py-2 border border-slate-300 rounded-md font-mono"
                  placeholder="https://ssl-cdn-cloudflare.adsensecustomsearchads.com.br"
                />
                {form.r2PublicUrl && (
                  <a
                    href={form.r2PublicUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-md border border-slate-300 flex items-center gap-1.5 transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Abrir</span>
                  </a>
                )}
              </div>
              <p className="text-[10px] text-slate-500 mt-1">
                Certifique-se de que este domínio está cadastrado como Custom Domain ativo no painel do Cloudflare R2 Settings para evitar erro 404.
              </p>
            </div>

            <div className="flex items-center justify-between py-2 border-t border-slate-100">
              <div>
                <div className="text-xs font-semibold text-slate-900">Sincronização Automática com R2</div>
                <div className="text-[11px] text-slate-500">
                  Enviar automaticamente os artigos como JSON e atualizar feeds no CDN durante cada ciclo de scraping.
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.r2AutoSync}
                  onChange={(e) => setForm({ ...form, r2AutoSync: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-orange-500"></div>
              </label>
            </div>

            {/* Botão de Teste R2 */}
            <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
              <span className="text-[11px] text-slate-500">
                Gera um objeto de teste no bucket e valida a leitura pelo CDN público.
              </span>
              <button
                type="button"
                onClick={handleTestR2}
                disabled={testingR2}
                className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-orange-50 hover:bg-orange-100 text-orange-700 border border-orange-200 text-xs font-medium rounded-md transition-colors disabled:opacity-60 cursor-pointer"
              >
                {testingR2 ? <RotateCw className="w-3.5 h-3.5 animate-spin" /> : <Cloud className="w-3.5 h-3.5" />}
                <span>{testingR2 ? 'Testando Conexão...' : 'Testar Conexão R2'}</span>
              </button>
            </div>

            {/* Resultado do Teste R2 */}
            {r2TestResult && (
              <div
                className={`p-3 rounded-lg text-xs ${
                  r2TestResult.success
                    ? 'bg-emerald-50 text-emerald-900 border border-emerald-200'
                    : 'bg-rose-50 text-rose-900 border border-rose-200'
                }`}
              >
                <div className="flex items-center gap-2 font-semibold mb-1">
                  {r2TestResult.success ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-rose-600" />
                  )}
                  <span>{r2TestResult.success ? 'Conexão Cloudflare R2 Concluída com Sucesso' : 'Falha na Conexão com R2'}</span>
                </div>
                {r2TestResult.message && <p className="text-[11px] mt-0.5">{r2TestResult.message}</p>}
                {r2TestResult.endpoint && (
                  <p className="text-[10px] font-mono mt-1 text-slate-600">Endpoint: {r2TestResult.endpoint}</p>
                )}
                {r2TestResult.latencyMs && (
                  <p className="text-[10px] font-mono text-slate-600">Latência: {r2TestResult.latencyMs}ms</p>
                )}
                {r2TestResult.error && (
                  <p className="text-[11px] font-mono text-rose-700 mt-1 whitespace-pre-wrap">{r2TestResult.error}</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Rodapé com Botão Salvar */}
        <div className="flex justify-end pt-3">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors disabled:opacity-60 cursor-pointer"
          >
            {saving ? <RotateCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            <span>{saving ? 'Salvando Configurações...' : 'Salvar Todas as Configurações'}</span>
          </button>
        </div>
      </form>
    </div>
  );
}
