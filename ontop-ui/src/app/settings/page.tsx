'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Bot,
  CheckCircle2,
  Cpu,
  Eye,
  EyeOff,
  Globe,
  Loader2,
  MessageSquareText,
  Plus,
  RefreshCw,
  Save,
  Server,
  Settings2,
  Sparkles,
  Trash2,
  WandSparkles,
  Zap,
} from 'lucide-react';
import { ai, type ModelDiscoveryResponse, type ProviderPreset, type QuickQuestion } from '@/lib/api';

const PROVIDER_ICONS: Record<string, string> = {
  openai: '🤖',
  lm_studio: '🏠',
  ollama: '🦙',
  deepseek: '🔍',
  zhipu: '🧠',
  azure_openai: '☁️',
  anthropic: '🎭',
  custom: '⚙️',
};

const PROVIDER_HINTS: Record<string, string[]> = {
  lm_studio: [
    '确保已启动 LM Studio 并加载模型。',
    '开启 Local Server，默认端口为 1234。',
    'API Key 可直接填写 lm-studio。',
  ],
  ollama: [
    '先运行 ollama serve。',
    '确认目标模型已拉取，如 ollama pull qwen3。',
    'OpenAI 兼容端口默认为 11434。',
  ],
  openai: [
    '需要有效的 OpenAI API Key。',
    '注意按调用量计费。',
  ],
  deepseek: [
    '在 platform.deepseek.com 获取 API Key。',
    '接口兼容 OpenAI 格式。',
  ],
  zhipu: [
    '在 open.bigmodel.cn 获取 API Key。',
    '常用模型如 glm-4-flash。',
  ],
  anthropic: [
    '需要有效的 Anthropic API Key。',
    '当前走 OpenAI 兼容模式调用。',
  ],
  azure_openai: [
    '需要可用的 Azure OpenAI 资源与部署名。',
    'Base URL 中替换 resource 和 deployment 占位符。',
  ],
  custom: [
    '填写兼容 OpenAI Chat Completions 的服务地址。',
    '确保支持 /v1/chat/completions 端点。',
  ],
};

function StatCard({
  title,
  value,
  hint,
  icon: Icon,
}: {
  title: string;
  value: string;
  hint: string;
  icon: typeof Bot;
}) {
  return (
    <Card className="border-border/70 bg-card/70">
      <CardContent className="flex items-start justify-between p-4">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{title}</p>
          <p className="text-lg font-semibold text-foreground">{value}</p>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </div>
      </CardContent>
    </Card>
  );
}

function SaveStatus({
  changed,
  saved,
  saving,
}: {
  changed: boolean;
  saved: boolean;
  saving: boolean;
}) {
  if (saving) {
    return (
      <Badge variant="secondary" className="bg-primary/10 text-primary">
        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
        保存中
      </Badge>
    );
  }
  if (changed) {
    return <Badge variant="outline" className="text-amber-500">未保存</Badge>;
  }
  if (saved) {
    return (
      <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-500">
        <CheckCircle2 className="mr-1 h-3 w-3" />
        已保存
      </Badge>
    );
  }
  return null;
}

export default function SettingsPage() {
  const [config, setConfig] = useState<Record<string, any>>({});
  const [apiKeyVisible, setApiKeyVisible] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [configSaved, setConfigSaved] = useState(false);
  const [configChanged, setConfigChanged] = useState(false);
  const [originalConfig, setOriginalConfig] = useState<Record<string, any>>({});

  const [providers, setProviders] = useState<Record<string, ProviderPreset>>({});
  const [selectedProvider, setSelectedProvider] = useState<string>('lm_studio');
  const [discoveredModels, setDiscoveredModels] = useState<string[]>([]);
  const [modelSource, setModelSource] = useState<ModelDiscoveryResponse['source']>('manual');
  const [modelWarning, setModelWarning] = useState<string | null>(null);
  const [loadingModels, setLoadingModels] = useState(false);
  const [manualModelEntry, setManualModelEntry] = useState(false);

  const [systemPrompt, setSystemPrompt] = useState('');
  const [originalPrompt, setOriginalPrompt] = useState('');
  const [savingPrompt, setSavingPrompt] = useState(false);
  const [promptSaved, setPromptSaved] = useState(false);

  const [questions, setQuestions] = useState<QuickQuestion[]>([]);
  const [originalQuestions, setOriginalQuestions] = useState<QuickQuestion[]>([]);
  const [savingQuestions, setSavingQuestions] = useState(false);
  const [questionsSaved, setQuestionsSaved] = useState(false);
  const [newQuestion, setNewQuestion] = useState('');

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      ai.getConfig(),
      ai.getProviders(),
      ai.getSystemPrompt(),
      ai.getQuickQuestions(),
    ])
      .then(([cfg, provs, promptData, qData]) => {
        setConfig(cfg);
        setOriginalConfig(cfg);
        setProviders(provs);
        setSelectedProvider(cfg.llm_provider || 'lm_studio');
        const prompt = (promptData as { system_prompt?: string }).system_prompt || '';
        setSystemPrompt(prompt);
        setOriginalPrompt(prompt);
        const quickQuestions = (qData as { questions?: QuickQuestion[] }).questions || [];
        setQuestions(quickQuestions);
        setOriginalQuestions(quickQuestions);
        setManualModelEntry(false);
      })
      .catch((err: Error) => {
        toast.error(`加载 AI 设置失败: ${err.message}`);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!loading && selectedProvider && config.llm_base_url) {
      void loadModels(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, selectedProvider]);

  const handleProviderChange = (provider: string) => {
    setSelectedProvider(provider);
    const preset = providers[provider];
    if (!preset) return;

    const updates: Record<string, any> = {
      ...config,
      llm_provider: provider,
    };

    if (preset.base_url && (!config.llm_base_url || config.llm_base_url === originalConfig.llm_base_url)) {
      updates.llm_base_url = preset.base_url;
    }

    if (preset.models.length > 0 && (!config.llm_model || config.llm_model === originalConfig.llm_model)) {
      updates.llm_model = preset.models[0];
    }

    setConfig(updates);
    setConfigChanged(true);
    setManualModelEntry(false);
  };

  const updateField = (field: string, value: unknown) => {
    setConfig({ ...config, [field]: value });
    setConfigChanged(true);
  };

  const loadModels = async (showSuccess = true) => {
    setLoadingModels(true);
    setModelWarning(null);
    try {
      const result = await ai.discoverModels({
        provider: selectedProvider,
        base_url: config.llm_base_url,
        api_key: config.llm_api_key,
      });
      setDiscoveredModels(result.models);
      setModelSource(result.source);
      setModelWarning(result.warning || null);

      if (result.models.length > 0) {
        const hasCurrent = result.models.includes(config.llm_model || '');
        if (!config.llm_model || !hasCurrent) {
          updateField('llm_model', result.models[0]);
        }
        setManualModelEntry(!hasCurrent && Boolean(config.llm_model));
      } else {
        setManualModelEntry(true);
      }

      if (showSuccess) {
        toast.success(result.source === 'remote' ? '已拉取最新模型列表' : '已加载可用模型候选');
      }
      if (result.warning) {
        toast.warning(result.warning);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : '未知错误';
      setDiscoveredModels([]);
      setModelSource('manual');
      setModelWarning(`无法拉取模型列表: ${message}`);
      setManualModelEntry(true);
      toast.error(`拉取模型列表失败: ${message}`);
    } finally {
      setLoadingModels(false);
    }
  };

  const handleSaveConfig = async () => {
    setSavingConfig(true);
    try {
      await ai.updateConfig(config);
      setOriginalConfig(config);
      setConfigChanged(false);
      setConfigSaved(true);
      toast.success('模型配置已保存');
      setTimeout(() => setConfigSaved(false), 2000);
    } catch (err) {
      const message = err instanceof Error ? err.message : '未知错误';
      toast.error(`保存模型配置失败: ${message}`);
    } finally {
      setSavingConfig(false);
    }
  };

  const handleSavePrompt = async () => {
    setSavingPrompt(true);
    try {
      await ai.updateSystemPrompt(systemPrompt);
      setOriginalPrompt(systemPrompt);
      setPromptSaved(true);
      toast.success('提示词已保存');
      setTimeout(() => setPromptSaved(false), 2000);
    } catch (err) {
      const message = err instanceof Error ? err.message : '未知错误';
      toast.error(`保存提示词失败: ${message}`);
    } finally {
      setSavingPrompt(false);
    }
  };

  const handleSaveQuestions = async () => {
    setSavingQuestions(true);
    try {
      await ai.updateQuickQuestions(questions);
      setOriginalQuestions(questions);
      setQuestionsSaved(true);
      toast.success('快捷问题已保存');
      setTimeout(() => setQuestionsSaved(false), 2000);
    } catch (err) {
      const message = err instanceof Error ? err.message : '未知错误';
      toast.error(`保存快捷问题失败: ${message}`);
    } finally {
      setSavingQuestions(false);
    }
  };

  const addQuestion = () => {
    if (!newQuestion.trim()) return;
    setQuestions([...questions, { id: Date.now().toString(), question: newQuestion.trim() }]);
    setNewQuestion('');
  };

  const removeQuestion = (id: string) => {
    setQuestions(questions.filter((q) => q.id !== id));
  };

  const promptChanged = systemPrompt !== originalPrompt;
  const questionsChanged = JSON.stringify(questions) !== JSON.stringify(originalQuestions);
  const currentProviderPreset = providers[selectedProvider];
  const promptVariables = ['{classes}', '{properties}', '{relationships}', '{prefixes}'];
  const providerHints = PROVIDER_HINTS[selectedProvider] || PROVIDER_HINTS.custom;
  const currentModelLabel = config.llm_model || '未配置';
  const currentProviderLabel = currentProviderPreset?.label || selectedProvider || '未配置';
  const availableModels = discoveredModels.length > 0 ? discoveredModels : (currentProviderPreset?.models || []);
  const useModelSelect = availableModels.length > 0;
  const pendingChanges = [configChanged, promptChanged, questionsChanged].filter(Boolean).length;
  const promptLineCount = systemPrompt.split('\n').filter((line) => line.trim()).length;

  if (loading) {
    return (
      <div className="flex min-h-[calc(100vh-104px)] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-8">
      <div className="flex flex-col gap-4 border-b border-border pb-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-[oklch(0.70_0.15_280)] to-[oklch(0.65_0.18_200)] shadow-sm">
                <Settings2 className="h-5 w-5 text-white" />
              </div>
              <div className="space-y-1">
                <h1 className="text-2xl font-semibold text-foreground">AI 设置</h1>
                <p className="text-sm text-muted-foreground">
                  管理模型接入、系统提示词和聊天快捷入口。
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="border-primary/30 bg-primary/5 text-primary">
                当前 Provider: {currentProviderLabel}
              </Badge>
              <Badge variant="outline" className="border-border/70 bg-card/70">
                当前模型: {currentModelLabel}
              </Badge>
              {pendingChanges > 0 && (
                <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-500">
                  {pendingChanges} 处待保存
                </Badge>
              )}
            </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard title="当前模型" value={currentModelLabel} hint="用于自然语言转 SPARQL" icon={Bot} />
        <StatCard title="服务提供商" value={currentProviderLabel} hint={config.llm_base_url || '等待配置 Base URL'} icon={Server} />
        <StatCard title="提示词长度" value={`${systemPrompt.length} 字符`} hint={promptChanged ? '存在未保存修改' : '模板已同步'} icon={MessageSquareText} />
        <StatCard title="快捷问题" value={`${questions.length} 条`} hint={questionsChanged ? '列表已变更' : '用于聊天界面快捷入口'} icon={Zap} />
      </div>

      <Tabs defaultValue="model" className="w-full">
        <TabsList className="mb-2 h-auto flex-wrap justify-start gap-2 rounded-xl border border-border/70 bg-card/60 p-1">
          <TabsTrigger value="model" className="gap-2 rounded-lg px-4 py-2">
            <Bot className="h-4 w-4" />
            模型设置
          </TabsTrigger>
          <TabsTrigger value="prompt" className="gap-2 rounded-lg px-4 py-2">
            <MessageSquareText className="h-4 w-4" />
            提示词编辑
          </TabsTrigger>
          <TabsTrigger value="questions" className="gap-2 rounded-lg px-4 py-2">
            <Zap className="h-4 w-4" />
            快捷问题
          </TabsTrigger>
        </TabsList>

          <TabsContent value="model" className="space-y-4">
            <div className="grid gap-4 xl:grid-cols-[1.4fr_0.9fr]">
              <Card className="border-border/70 bg-card/80">
                <CardHeader>
                  <CardTitle className="text-base">模型接入</CardTitle>
                  <CardDescription>选择服务商并维护模型连接参数。</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-3">
                    <Label className="text-sm font-medium">服务提供商</Label>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      {Object.entries(providers).map(([key, preset]) => (
                        <button
                          key={key}
                          onClick={() => handleProviderChange(key)}
                          className={`rounded-xl border p-3 text-left transition-colors ${
                            selectedProvider === key
                              ? 'border-primary bg-primary/5 shadow-sm'
                              : 'border-border bg-muted/20 hover:border-primary/40'
                          }`}
                        >
                          <div className="mb-3 flex items-center justify-between">
                            <span className="text-lg">{PROVIDER_ICONS[key] || '🔌'}</span>
                            {selectedProvider === key && (
                              <Badge variant="secondary" className="bg-primary/10 text-primary">当前</Badge>
                            )}
                          </div>
                          <p className="text-sm font-medium text-foreground">{preset.label}</p>
                          <p className="mt-1 text-xs text-muted-foreground">{preset.base_url || '自定义接入地址'}</p>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid gap-5 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label className="flex items-center gap-2 text-sm font-medium">
                        <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                        API Base URL
                      </Label>
                      <Input
                        value={config.llm_base_url || ''}
                        onChange={(e) => updateField('llm_base_url', e.target.value)}
                        placeholder={currentProviderPreset?.base_url || 'http://localhost:1234/v1'}
                        className="font-mono text-sm"
                      />
                      <p className="text-xs text-muted-foreground">默认地址会随 Provider 自动填充，保留手动覆盖能力。</p>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <Label className="flex items-center gap-2 text-sm font-medium">
                          <Cpu className="h-3.5 w-3.5 text-muted-foreground" />
                          模型名称
                        </Label>
                        <div className="flex items-center gap-2">
                          {modelSource === 'remote' && (
                            <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-600">自动获取</Badge>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8"
                            onClick={() => void loadModels(true)}
                            disabled={loadingModels || !config.llm_base_url}
                          >
                            {loadingModels ? (
                              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <RefreshCw className="mr-2 h-3.5 w-3.5" />
                            )}
                            刷新列表
                          </Button>
                        </div>
                      </div>
                      {useModelSelect ? (
                        <>
                          <Select
                            value={availableModels.includes(config.llm_model) ? config.llm_model : 'custom'}
                            onValueChange={(value) => {
                              if (value === 'custom') {
                                setManualModelEntry(true);
                                return;
                              }
                              updateField('llm_model', value);
                              setManualModelEntry(false);
                            }}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="选择模型" />
                            </SelectTrigger>
                            <SelectContent>
                              {availableModels.map((model) => (
                                <SelectItem key={model} value={model}>{model}</SelectItem>
                              ))}
                              <SelectItem value="custom">自定义...</SelectItem>
                            </SelectContent>
                          </Select>
                          {(manualModelEntry || !availableModels.includes(config.llm_model || '')) && (
                            <Input
                              value={config.llm_model || ''}
                              onChange={(e) => updateField('llm_model', e.target.value)}
                              placeholder="自定义模型名称"
                              className="font-mono text-sm"
                            />
                          )}
                        </>
                      ) : (
                        <Input
                          value={config.llm_model || ''}
                          onChange={(e) => updateField('llm_model', e.target.value)}
                          placeholder="模型名称，如 gpt-4o-mini"
                          className="font-mono text-sm"
                        />
                      )}
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">
                          优先从当前 Provider 自动拉取模型列表，拉取失败时回退到预设或手动输入。
                        </p>
                        {modelWarning && (
                          <p className="text-xs text-amber-500">{modelWarning}</p>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Label className="flex items-center gap-2 text-sm font-medium">
                        <Server className="h-3.5 w-3.5 text-muted-foreground" />
                        API Key
                      </Label>
                      {['lm_studio', 'ollama'].includes(selectedProvider) && (
                        <Badge variant="secondary" className="text-[10px]">本地模型可留空</Badge>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Input
                        type={apiKeyVisible ? 'text' : 'password'}
                        value={config.llm_api_key || ''}
                        onChange={(e) => updateField('llm_api_key', e.target.value)}
                        placeholder={selectedProvider === 'lm_studio' ? 'lm-studio' : selectedProvider === 'ollama' ? 'ollama' : 'sk-xxx...'}
                        className="flex-1 font-mono text-sm"
                      />
                      <Button variant="outline" size="icon" onClick={() => setApiKeyVisible(!apiKeyVisible)}>
                        {apiKeyVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="space-y-4">
                <Card className="border-border/70 bg-card/80">
                  <CardHeader>
                    <CardTitle className="text-base">推理参数</CardTitle>
                    <CardDescription>控制输出稳定性和响应长度。</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm font-medium">Temperature</Label>
                        <span className="rounded bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground">
                          {config.llm_temperature ?? 0.1}
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={config.llm_temperature ?? 0.1}
                        onChange={(e) => updateField('llm_temperature', parseFloat(e.target.value))}
                        className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-muted accent-primary"
                      />
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>精确</span>
                        <span>平衡</span>
                        <span>创意</span>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-sm font-medium">最大 Token 数</Label>
                      <Select
                        value={String(config.max_tokens ?? 1024)}
                        onValueChange={(value) => updateField('max_tokens', parseInt(value, 10))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="256">256 (极速)</SelectItem>
                          <SelectItem value="512">512 (快速)</SelectItem>
                          <SelectItem value="1024">1024 (推荐)</SelectItem>
                          <SelectItem value="2048">2048 (详细)</SelectItem>
                          <SelectItem value="4096">4096 (超长)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-border/70 bg-card/80">
                  <CardHeader>
                    <CardTitle className="text-base">接入提示</CardTitle>
                    <CardDescription>按当前 Provider 显示连接建议。</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="rounded-xl border border-dashed border-border bg-muted/20 p-4">
                      <div className="mb-3 flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium">{currentProviderLabel}</span>
                      </div>
                      <div className="space-y-2 text-sm text-muted-foreground">
                        {providerHints.map((hint) => (
                          <p key={hint}>{hint}</p>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-xl bg-primary/5 p-4">
                      <p className="text-sm font-medium text-foreground">当前接入摘要</p>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <div>
                          <p className="text-xs text-muted-foreground">Provider</p>
                          <p className="text-sm font-medium">{currentProviderLabel}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">模型</p>
                          <p className="truncate text-sm font-medium">{currentModelLabel}</p>
                        </div>
                        <div className="sm:col-span-2">
                          <p className="text-xs text-muted-foreground">Base URL</p>
                          <p className="truncate font-mono text-xs text-foreground">{config.llm_base_url || '未配置'}</p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-border/70 bg-card/80">
                  <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-foreground">保存模型配置</p>
                      <p className="text-xs text-muted-foreground">修改 Provider、URL、模型名或参数后在这里提交。</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <SaveStatus changed={configChanged} saved={configSaved} saving={savingConfig} />
                      <Button onClick={handleSaveConfig} disabled={savingConfig || !configChanged}>
                        {savingConfig ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                        保存配置
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setConfig(originalConfig);
                          setConfigChanged(false);
                          setSelectedProvider(originalConfig.llm_provider || 'lm_studio');
                        }}
                        disabled={!configChanged}
                      >
                        撤销修改
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="prompt" className="space-y-4">
            <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
              <Card className="border-border/70 bg-card/80">
                <CardHeader>
                  <CardTitle className="text-base">系统提示词</CardTitle>
                  <CardDescription>定义 AI 如何结合本体结构生成 SPARQL 查询。</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label>SPARQL 生成提示词</Label>
                    <span className="text-xs text-muted-foreground">{systemPrompt.length} 字符</span>
                  </div>
                  <textarea
                    value={systemPrompt}
                    onChange={(e) => setSystemPrompt(e.target.value)}
                    rows={20}
                    className="min-h-[420px] w-full resize-y rounded-xl border border-input bg-background px-3 py-3 font-mono text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    placeholder="输入系统提示词模板..."
                  />
                </CardContent>
              </Card>

              <div className="space-y-4">
                <Card className="border-border/70 bg-card/80">
                  <CardHeader>
                    <CardTitle className="text-base">当前模板概览</CardTitle>
                    <CardDescription>帮助快速判断提示词是否过短、过长或结构松散。</CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
                    <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
                      <p className="text-xs text-muted-foreground">字符数</p>
                      <p className="mt-2 text-2xl font-semibold text-foreground">{systemPrompt.length}</p>
                    </div>
                    <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
                      <p className="text-xs text-muted-foreground">有效行数</p>
                      <p className="mt-2 text-2xl font-semibold text-foreground">{promptLineCount}</p>
                    </div>
                    <div className="rounded-xl border border-border/70 bg-primary/5 p-4">
                      <p className="text-xs text-muted-foreground">状态</p>
                      <p className="mt-2 text-sm font-medium text-foreground">
                        {promptChanged ? '存在未保存修改' : '模板已同步'}
                      </p>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-border/70 bg-card/80">
                  <CardHeader>
                    <CardTitle className="text-base">模板变量</CardTitle>
                    <CardDescription>这些占位符会在查询时自动替换。</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {promptVariables.map((variable) => (
                      <div key={variable} className="flex items-center justify-between rounded-lg border border-border/70 bg-muted/20 px-3 py-2">
                        <code className="text-sm">{variable}</code>
                        <Badge variant="outline">动态注入</Badge>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <Card className="border-border/70 bg-card/80">
                  <CardHeader>
                    <CardTitle className="text-base">编写建议</CardTitle>
                    <CardDescription>让输出更稳定，减少无效改写。</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm text-muted-foreground">
                    <div className="rounded-xl bg-muted/20 p-4">
                      <p className="font-medium text-foreground">建议包含</p>
                      <p className="mt-2">限定返回格式、强调使用已有类和属性、说明优先生成可执行 SPARQL。</p>
                    </div>
                    <div className="rounded-xl bg-primary/5 p-4">
                      <p className="font-medium text-foreground">建议避免</p>
                      <p className="mt-2">不要让模型自行发明前缀、类名或数据库字段，也不要输出解释性长文本。</p>
                    </div>
                    <div className="rounded-xl border border-dashed border-border/70 p-4">
                      <p className="font-medium text-foreground">推荐结构</p>
                      <p className="mt-2">角色说明、可用本体结构、约束规则、输出格式、少量正反例，基本就够了。</p>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-border/70 bg-card/80">
                  <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-foreground">保存提示词模板</p>
                      <p className="text-xs text-muted-foreground">修改会直接影响 AI 助手的查询生成行为。</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <SaveStatus changed={promptChanged} saved={promptSaved} saving={savingPrompt} />
                      <Button onClick={handleSavePrompt} disabled={savingPrompt || !promptChanged}>
                        {savingPrompt ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                        保存提示词
                      </Button>
                      <Button variant="ghost" onClick={() => setSystemPrompt(originalPrompt)} disabled={!promptChanged}>
                        撤销修改
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="questions" className="space-y-4">
            <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
              <Card className="border-border/70 bg-card/80">
                <CardHeader>
                  <CardTitle className="text-base">快捷问题列表</CardTitle>
                  <CardDescription>管理 AI 助手首页的常用提问入口。</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex gap-2">
                    <Input
                      value={newQuestion}
                      onChange={(e) => setNewQuestion(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && addQuestion()}
                      placeholder="输入新的快捷问题..."
                      className="flex-1"
                    />
                    <Button onClick={addQuestion} disabled={!newQuestion.trim()}>
                      <Plus className="mr-2 h-4 w-4" />
                      添加
                    </Button>
                  </div>

                  <div className="space-y-2">
                    {questions.map((question, index) => (
                      <div
                        key={question.id}
                        className="flex items-center gap-3 rounded-xl border border-border/70 bg-card p-3"
                      >
                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-xs text-muted-foreground">
                          {index + 1}
                        </div>
                        <span className="flex-1 text-sm text-foreground">{question.question}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={() => removeQuestion(question.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                    {questions.length === 0 && (
                      <div className="rounded-xl border border-dashed border-border bg-muted/20 py-10 text-center">
                        <p className="text-sm text-muted-foreground">暂无快捷问题，先添加几个高频业务提问。</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              <div className="space-y-4">
                <Card className="border-border/70 bg-card/80">
                  <CardHeader>
                    <CardTitle className="text-base">使用建议</CardTitle>
                    <CardDescription>让快捷问题真正承担引导作用。</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm text-muted-foreground">
                    <div className="rounded-xl bg-muted/20 p-4">
                      <p className="font-medium text-foreground">适合放入的问题</p>
                      <p className="mt-2">高频查询、示范性问题、能覆盖核心本体类和关系的问题。</p>
                    </div>
                    <div className="rounded-xl bg-primary/5 p-4">
                      <p className="font-medium text-foreground">不建议放入的问题</p>
                      <p className="mt-2">依赖太多上下文、含模糊业务简称、或过于冗长的复杂提问。</p>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-border/70 bg-card/80">
                  <CardHeader>
                    <CardTitle className="text-base">当前概览</CardTitle>
                    <CardDescription>帮助你判断入口是否过多或过少。</CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                    <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
                      <p className="text-xs text-muted-foreground">问题总数</p>
                      <p className="mt-2 text-2xl font-semibold text-foreground">{questions.length}</p>
                    </div>
                    <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
                      <p className="text-xs text-muted-foreground">平均长度</p>
                      <p className="mt-2 text-2xl font-semibold text-foreground">
                        {questions.length > 0
                          ? `${Math.round(questions.reduce((sum, item) => sum + item.question.length, 0) / questions.length)} 字`
                          : '0 字'}
                      </p>
                    </div>
                    <div className="rounded-xl border border-border/70 bg-primary/5 p-4">
                      <div className="flex items-center gap-2">
                        <WandSparkles className="h-4 w-4 text-primary" />
                        <p className="text-sm font-medium text-foreground">推荐数量</p>
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground">维持在 4 到 8 条更适合首页快速点击，不会显得拥挤。</p>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-border/70 bg-card/80">
                  <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-foreground">保存快捷问题</p>
                      <p className="text-xs text-muted-foreground">列表会同步到 AI 助手的快捷入口区域。</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <SaveStatus changed={questionsChanged} saved={questionsSaved} saving={savingQuestions} />
                      <Button onClick={handleSaveQuestions} disabled={savingQuestions || !questionsChanged}>
                        {savingQuestions ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                        保存问题列表
                      </Button>
                      <Button variant="ghost" onClick={() => setQuestions(originalQuestions)} disabled={!questionsChanged}>
                        撤销修改
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>
      </Tabs>
    </div>
  );
}
