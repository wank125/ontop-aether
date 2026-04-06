'use client';

import { useEffect, useState, useCallback } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  CheckCircle2,
  Circle,
  Copy,
  Eye,
  EyeOff,
  Globe,
  Key,
  Loader2,
  Play,
  Plug,
  RefreshCw,
  Save,
  Server,
  Share2,
  Shield,
  Square,
  Wrench,
  XCircle,
  Database,
  FileText,
} from 'lucide-react';
import { publishing, type PublishingConfig, type McpStatus, type AuditStats, type AuditLogsResponse, type DataCard } from '@/lib/api';

const MCP_TARGETS = [
  { value: 'claude_desktop', label: 'Claude Desktop' },
  { value: 'cursor', label: 'Cursor / Windsurf' },
];

const SKILLS_FORMATS = [
  { value: 'openai_function', label: 'OpenAI Function' },
  { value: 'anthropic_tool', label: 'Anthropic Tool' },
  { value: 'openapi', label: 'OpenAPI 3.0' },
  { value: 'generic_json', label: 'Generic JSON Schema' },
];

export default function PublishingPage() {
  const [config, setConfig] = useState<PublishingConfig | null>(null);
  const [apiStatus, setApiStatus] = useState<{ status: string; url: string; error?: string } | null>(null);
  const [mcpStatus, setMcpStatus] = useState<McpStatus | null>(null);
  const [mcpWrench, setMcpWrench] = useState<Array<{ name: string; description: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [mcpStarting, setMcpStarting] = useState(false);

  // MCP config snippet
  const [snippetTarget, setSnippetTarget] = useState('claude_desktop');
  const [snippetText, setSnippetText] = useState('');
  const [snippetLoading, setSnippetLoading] = useState(false);

  // Skills
  const [skillsFormat, setSkillsFormat] = useState('openai_function');
  const [skillsText, setSkillsText] = useState('');
  const [skillsLoading, setSkillsLoading] = useState(false);

  // Audit
  const [auditStats, setAuditStats] = useState<AuditStats | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLogsResponse | null>(null);
  const [auditPage, setAuditPage] = useState(1);
  const [auditCaller, setAuditCaller] = useState('');
  const [auditStatus, setAuditStatus] = useState('');
  const [auditLoading, setAuditLoading] = useState(false);

  // Datacard
  const [datacard, setDatacard] = useState<DataCard | null>(null);
  const [datacardLoading, setDatacardLoading] = useState(false);

  // Local config edits
  const [editConfig, setEditConfig] = useState<Partial<PublishingConfig>>({});

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [cfg, apiSt, mcpSt, tools] = await Promise.all([
        publishing.getConfig(),
        publishing.getApiStatus(),
        publishing.getMcpStatus(),
        publishing.listMcpTools(),
      ]);
      setConfig(cfg);
      setEditConfig(cfg);
      setApiStatus(apiSt);
      setMcpStatus(mcpSt);
      setMcpWrench(tools);
    } catch (e: any) {
      toast.error('加载失败: ' + e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAudit = useCallback(async (page = 1, caller = '', status = '') => {
    setAuditLoading(true);
    try {
      const [stats, logs] = await Promise.all([
        publishing.getAuditStats(),
        publishing.getAuditLogs(page, 15, caller || undefined, status || undefined),
      ]);
      setAuditStats(stats);
      setAuditLogs(logs);
      setAuditPage(page);
    } catch (e: any) {
      toast.error('审计数据加载失败: ' + e.message);
    } finally {
      setAuditLoading(false);
    }
  }, []);

  const loadDatacard = useCallback(async () => {
    setDatacardLoading(true);
    try {
      const card = await publishing.getDatacard();
      setDatacard(card);
    } catch (e: any) {
      toast.error('数据卡片加载失败: ' + e.message);
    } finally {
      setDatacardLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await publishing.updateConfig(editConfig);
      setConfig(updated);
      setEditConfig(updated);
      toast.success('配置已保存');
    } catch (e: any) {
      toast.error('保存失败: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleGenerateKey = async () => {
    try {
      const { api_key } = await publishing.generateApiKey();
      setConfig(prev => prev ? { ...prev, api_key } : prev);
      setEditConfig(prev => ({ ...prev, api_key }));
      toast.success('API Key 已生成');
    } catch (e: any) {
      toast.error('生成失败: ' + e.message);
    }
  };

  const handleMcpToggle = async () => {
    setMcpStarting(true);
    try {
      if (mcpStatus?.running) {
        const st = await publishing.stopMcp();
        setMcpStatus(st);
        toast.success('MCP 服务已停止');
      } else {
        const st = await publishing.startMcp();
        setMcpStatus(st);
        toast.success('MCP 服务已启动');
      }
    } catch (e: any) {
      toast.error('操作失败: ' + e.message);
    } finally {
      setMcpStarting(false);
    }
  };

  const loadSnippet = async (target: string) => {
    setSnippetLoading(true);
    try {
      const { config: cfg } = await publishing.getMcpConfigSnippet(target);
      setSnippetText(JSON.stringify(cfg, null, 2));
    } catch (e: any) {
      setSnippetText('// 加载失败: ' + e.message);
    } finally {
      setSnippetLoading(false);
    }
  };

  const loadSkills = async (format: string) => {
    setSkillsLoading(true);
    try {
      const data = await publishing.generateSkills(format);
      setSkillsText(JSON.stringify(data, null, 2));
    } catch (e: any) {
      setSkillsText('// 加载失败: ' + e.message);
    } finally {
      setSkillsLoading(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label}已复制到剪贴板`);
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--muted-foreground)]" />
      </div>
    );
  }

  const toolCount = mcpWrench.length;
  const formatCount = SKILLS_FORMATS.length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 border-b border-border pb-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-[oklch(0.70_0.15_280)] to-[oklch(0.65_0.18_200)] shadow-sm">
            <Share2 className="h-5 w-5 text-white" />
          </div>
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold text-foreground">数据发布</h1>
            <p className="text-sm text-muted-foreground">统一管理当前本体的 API 接入、MCP 配置片段和工具定义导出。</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="border-primary/30 bg-primary/5 text-primary">
            API {apiStatus?.status === 'ok' ? '可用' : '异常'}
          </Badge>
          <Badge variant="outline" className="border-border/70 bg-card/70">
            MCP {mcpStatus?.running ? '运行中' : '未启动'}
          </Badge>
          <Button onClick={loadAll} variant="outline" size="sm">
            <RefreshCw className="mr-2 h-4 w-4" />
            刷新
          </Button>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            {apiStatus?.status === 'ok' ? (
              <CheckCircle2 className="h-5 w-5 text-green-500" />
            ) : (
              <XCircle className="h-5 w-5 text-red-500" />
            )}
            <div>
              <p className="text-sm text-[var(--muted-foreground)]">SPARQL 端点</p>
              <p className="text-sm font-medium">{apiStatus?.status === 'ok' ? '可用' : '不可用'}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            {mcpStatus?.running ? (
              <CheckCircle2 className="h-5 w-5 text-green-500" />
            ) : (
              <Circle className="h-5 w-5 text-[var(--muted-foreground)]" />
            )}
            <div>
              <p className="text-sm text-[var(--muted-foreground)]">MCP 服务</p>
              <p className="text-sm font-medium">{mcpStatus?.running ? '运行中' : '未启动'}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <Wrench className="h-5 w-5 text-[var(--muted-foreground)]" />
            <div>
              <p className="text-sm text-[var(--muted-foreground)]">可用工具</p>
              <p className="text-sm font-medium">{toolCount} 个</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <Plug className="h-5 w-5 text-[var(--muted-foreground)]" />
            <div>
              <p className="text-sm text-[var(--muted-foreground)]">支持格式</p>
              <p className="text-sm font-medium">{formatCount} 种</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="api" className="w-full">
        <TabsList className="mb-2 h-auto flex-wrap justify-start gap-2 rounded-xl border border-border/70 bg-card/60 p-1">
          <TabsTrigger value="api" className="gap-2 rounded-lg px-4 py-2">
            <Globe className="mr-2 h-4 w-4" />
            API 接入
          </TabsTrigger>
          <TabsTrigger value="mcp" className="gap-2 rounded-lg px-4 py-2">
            <Server className="mr-2 h-4 w-4" />
            MCP 服务
          </TabsTrigger>
          <TabsTrigger value="skills" className="gap-2 rounded-lg px-4 py-2">
            <Share2 className="mr-2 h-4 w-4" />
            插件 / Skills
          </TabsTrigger>
          <TabsTrigger value="audit" className="gap-2 rounded-lg px-4 py-2" onClick={() => loadAudit()}>
            <Shield className="mr-2 h-4 w-4" />
            查询审计
          </TabsTrigger>
          <TabsTrigger value="datacard" className="gap-2 rounded-lg px-4 py-2" onClick={() => loadDatacard()}>
            <Database className="mr-2 h-4 w-4" />
            数据卡片
          </TabsTrigger>
        </TabsList>

        {/* ── Tab 1: API ─────────────────────────── */}
        <TabsContent value="api" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>API 配置</CardTitle>
              <CardDescription>管理 SPARQL API 的接入密钥和跨域策略</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* API Enabled */}
              <div className="flex items-center justify-between">
                <div>
                  <Label>启用 API 接入</Label>
                  <p className="text-xs text-[var(--muted-foreground)]">开启后允许外部客户端通过 SPARQL 端点查询</p>
                </div>
                <Switch
                  checked={editConfig.api_enabled ?? true}
                  onCheckedChange={(v) => setEditConfig(prev => ({ ...prev, api_enabled: v }))}
                />
              </div>

              {/* SPARQL Endpoint URL */}
              <div className="space-y-2">
                <Label>SPARQL 端点</Label>
                <div className="flex items-center gap-2">
                  <Input value={apiStatus?.url || ''} readOnly className="font-mono text-sm" />
                  <Badge variant={apiStatus?.status === 'ok' ? 'default' : 'destructive'}>
                    {apiStatus?.status === 'ok' ? '正常' : '异常'}
                  </Badge>
                </div>
              </div>

              {/* API Key */}
              <div className="space-y-2">
                <Label>API Key</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type={showApiKey ? 'text' : 'password'}
                    value={editConfig.api_key || ''}
                    onChange={(e) => setEditConfig(prev => ({ ...prev, api_key: e.target.value }))}
                    className="font-mono text-sm"
                    placeholder="未设置"
                  />
                  <Button variant="ghost" size="icon" onClick={() => setShowApiKey(!showApiKey)}>
                    {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleGenerateKey}>
                    <Key className="mr-1 h-3 w-3" />
                    生成
                  </Button>
                </div>
              </div>

              {/* CORS */}
              <div className="space-y-2">
                <Label>CORS 允许来源</Label>
                <Input
                  value={editConfig.cors_origins || '*'}
                  onChange={(e) => setEditConfig(prev => ({ ...prev, cors_origins: e.target.value }))}
                  placeholder="*"
                  className="font-mono text-sm"
                />
                <p className="text-xs text-[var(--muted-foreground)]">多个来源用逗号分隔，* 表示允许所有</p>
              </div>

              <div className="flex justify-end">
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  保存配置
                </Button>
              </div>

              {/* Auth instructions */}
              <div className="rounded-lg border border-border/70 bg-[var(--muted)]/30 p-4 space-y-2">
                <p className="text-sm font-medium flex items-center gap-2">
                  <Shield className="h-4 w-4" />
                  鉴权说明
                </p>
                <p className="text-xs text-[var(--muted-foreground)]">
                  启用 API 接入后，外部请求需在请求头中携带 <code className="rounded bg-[var(--muted)] px-1">X-API-Key</code> 或查询参数 <code className="rounded bg-[var(--muted)] px-1">?api_key=</code>。
                  前端页面和 localhost 请求自动跳过鉴权。
                </p>
                <pre className="overflow-x-auto rounded bg-[var(--muted)] p-3 text-xs font-mono">
{`curl -H "X-API-Key: YOUR_KEY" \\
  -X POST ${apiStatus?.url || 'http://localhost:8001/api/v1/sparql/query'}/sparql \\
  -H "Content-Type: application/json" \\
  -d '{"query":"SELECT ?s WHERE { ?s a <http://example.com/ontop/YourClass> } LIMIT 5"}'`}
                </pre>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab 2: MCP ─────────────────────────── */}
        <TabsContent value="mcp" className="space-y-4">
          {/* MCP Control */}
          <Card>
            <CardHeader>
              <CardTitle>MCP 服务控制</CardTitle>
              <CardDescription>启动/停止内置 MCP Server，支持 Streamable HTTP 传输</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Badge variant={mcpStatus?.running ? 'default' : 'secondary'}>
                    {mcpStatus?.running ? '运行中' : '已停止'}
                  </Badge>
                  {mcpStatus?.running && (
                    <span className="text-xs text-[var(--muted-foreground)]">
                      传输方式: {mcpStatus.transport}
                    </span>
                  )}
                </div>
                <Button
                  onClick={handleMcpToggle}
                  disabled={mcpStarting}
                  variant={mcpStatus?.running ? 'destructive' : 'default'}
                >
                  {mcpStarting ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : mcpStatus?.running ? (
                    <Square className="mr-2 h-4 w-4" />
                  ) : (
                    <Play className="mr-2 h-4 w-4" />
                  )}
                  {mcpStarting ? '处理中...' : mcpStatus?.running ? '停止' : '启动'}
                </Button>
              </div>

              {/* MCP Enabled toggle for auto-start */}
              <div className="flex items-center justify-between">
                <div>
                  <Label>自动启动</Label>
                  <p className="text-xs text-[var(--muted-foreground)]">应用启动时自动运行 MCP Server</p>
                </div>
                <Switch
                  checked={editConfig.mcp_enabled ?? false}
                  onCheckedChange={(v) => setEditConfig(prev => ({ ...prev, mcp_enabled: v }))}
                />
              </div>

              <div className="flex justify-end">
                <Button onClick={handleSave} disabled={saving} size="sm">
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  保存自动启动配置
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Available Wrench */}
          <Card>
            <CardHeader>
              <CardTitle>可用工具</CardTitle>
              <CardDescription>从当前本体自动推导的 MCP 工具</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {mcpWrench.map((tool) => (
                  <div key={tool.name} className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <code className="text-sm font-semibold">{tool.name}</code>
                      <p className="text-xs text-[var(--muted-foreground)] mt-0.5">{tool.description}</p>
                    </div>
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                  </div>
                ))}
                {mcpWrench.length === 0 && (
                  <p className="text-sm text-[var(--muted-foreground)]">暂无工具（需先配置本体映射）</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Config Snippet */}
          <Card>
            <CardHeader>
              <CardTitle>配置片段</CardTitle>
              <CardDescription>生成目标平台的 MCP 配置，复制到对应配置文件中</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <Select value={snippetTarget} onValueChange={(v) => { setSnippetTarget(v); }}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="选择平台" />
                  </SelectTrigger>
                  <SelectContent>
                    {MCP_TARGETS.map(t => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button onClick={() => loadSnippet(snippetTarget)} disabled={snippetLoading} size="sm">
                  {snippetLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                  生成
                </Button>
              </div>
              {snippetText && (
                <div className="relative">
                  <pre className="max-h-64 overflow-auto rounded-lg bg-[var(--muted)] p-4 text-xs font-mono">
                    {snippetText}
                  </pre>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-2 top-2"
                    onClick={() => copyToClipboard(snippetText, '配置片段')}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab 3: Skills / Plugins ──────────────── */}
        <TabsContent value="skills" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>工具定义生成</CardTitle>
              <CardDescription>
                从当前本体自动推导工具定义，支持多种 LLM / API 框架格式
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <Select value={skillsFormat} onValueChange={setSkillsFormat}>
                  <SelectTrigger className="w-52">
                    <SelectValue placeholder="选择格式" />
                  </SelectTrigger>
                  <SelectContent>
                    {SKILLS_FORMATS.map(f => (
                      <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button onClick={() => loadSkills(skillsFormat)} disabled={skillsLoading} size="sm">
                  {skillsLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                  生成预览
                </Button>
              </div>

              {skillsText && (
                <div className="relative">
                  <pre className="max-h-96 overflow-auto rounded-lg bg-[var(--muted)] p-4 text-xs font-mono">
                    {skillsText}
                  </pre>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-2 top-2"
                    onClick={() => copyToClipboard(skillsText, '工具定义')}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              )}

              {/* Format info cards */}
              <div className="grid grid-cols-2 gap-3 pt-2">
                {SKILLS_FORMATS.map(f => (
                  <div
                    key={f.value}
                    className={`cursor-pointer rounded-lg border p-3 transition-colors ${
                      skillsFormat === f.value
                        ? 'border-[var(--primary)] bg-[var(--accent)]'
                        : 'hover:bg-[var(--accent)]'
                    }`}
                    onClick={() => { setSkillsFormat(f.value); loadSkills(f.value); }}
                  >
                    <p className="text-sm font-medium">{f.label}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab 4: Audit ────────────────────────── */}
        <TabsContent value="audit" className="space-y-4">
          {/* Stats row */}
          <div className="grid grid-cols-4 gap-4">
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <FileText className="h-5 w-5 text-[var(--muted-foreground)]" />
                <div>
                  <p className="text-sm text-[var(--muted-foreground)]">总查询数</p>
                  <p className="text-lg font-semibold">{auditStats?.total_queries ?? '-'}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <CheckCircle2 className="h-5 w-5 text-green-500" />
                <div>
                  <p className="text-sm text-[var(--muted-foreground)]">成功率</p>
                  <p className="text-lg font-semibold">
                    {auditStats ? (auditStats.success_rate * 100).toFixed(1) + '%' : '-'}
                  </p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <Loader2 className={`h-5 w-5 ${auditLoading ? 'animate-spin' : 'text-[var(--muted-foreground)]'}`} />
                <div>
                  <p className="text-sm text-[var(--muted-foreground)]">平均耗时</p>
                  <p className="text-lg font-semibold">
                    {auditStats ? auditStats.avg_duration_ms.toFixed(0) + ' ms' : '-'}
                  </p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <XCircle className="h-5 w-5 text-red-500" />
                <div>
                  <p className="text-sm text-[var(--muted-foreground)]">错误数</p>
                  <p className="text-lg font-semibold">{auditStats?.error_count ?? '-'}</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Caller breakdown */}
          {auditStats && Object.keys(auditStats.by_caller).length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">按调用方统计</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-3">
                  {Object.entries(auditStats.by_caller).map(([caller, count]) => (
                    <Badge key={caller} variant="outline" className="text-sm">
                      {caller}: {count}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Filter + Log table */}
          <Card>
            <CardHeader>
              <CardTitle>审计日志</CardTitle>
              <CardDescription>记录所有 SPARQL 查询的调用来源、耗时和状态</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Filters */}
              <div className="flex items-center gap-3">
                <Select value={auditCaller} onValueChange={(v) => { setAuditCaller(v); loadAudit(1, v, auditStatus); }}>
                  <SelectTrigger className="w-36">
                    <SelectValue placeholder="调用方" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部</SelectItem>
                    <SelectItem value="web">Web</SelectItem>
                    <SelectItem value="mcp">MCP</SelectItem>
                    <SelectItem value="api">API</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={auditStatus} onValueChange={(v) => { setAuditStatus(v); loadAudit(1, auditCaller, v); }}>
                  <SelectTrigger className="w-36">
                    <SelectValue placeholder="状态" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部</SelectItem>
                    <SelectItem value="ok">成功</SelectItem>
                    <SelectItem value="error">失败</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="outline" size="sm" onClick={() => loadAudit(auditPage, auditCaller, auditStatus)}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  刷新
                </Button>
              </div>

              {/* Table */}
              {auditLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-[var(--muted-foreground)]" />
                </div>
              ) : (
                <div className="overflow-auto rounded-lg border">
                  <table className="w-full text-sm">
                    <thead className="bg-[var(--muted)]/50">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">时间</th>
                        <th className="px-3 py-2 text-left font-medium">来源 IP</th>
                        <th className="px-3 py-2 text-left font-medium">调用方</th>
                        <th className="px-3 py-2 text-left font-medium">查询预览</th>
                        <th className="px-3 py-2 text-right font-medium">耗时</th>
                        <th className="px-3 py-2 text-center font-medium">状态</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {auditLogs?.items.map((log) => (
                        <tr key={log.id} className="hover:bg-[var(--accent)]/50">
                          <td className="px-3 py-2 whitespace-nowrap text-xs text-[var(--muted-foreground)]">
                            {new Date(log.timestamp).toLocaleString('zh-CN')}
                          </td>
                          <td className="px-3 py-2 font-mono text-xs">{log.source_ip || '-'}</td>
                          <td className="px-3 py-2">
                            <Badge variant={log.caller === 'mcp' ? 'default' : 'secondary'} className="text-xs">
                              {log.caller}
                            </Badge>
                          </td>
                          <td className="max-w-[300px] truncate px-3 py-2 font-mono text-xs" title={log.query}>
                            {log.query}
                          </td>
                          <td className="px-3 py-2 text-right text-xs">
                            {log.duration_ms != null ? `${log.duration_ms.toFixed(0)} ms` : '-'}
                          </td>
                          <td className="px-3 py-2 text-center">
                            {log.status === 'ok' ? (
                              <CheckCircle2 className="inline h-4 w-4 text-green-500" />
                            ) : (
                              <XCircle className="inline h-4 w-4 text-red-500" />
                            )}
                          </td>
                        </tr>
                      ))}
                      {(!auditLogs || auditLogs.items.length === 0) && (
                        <tr>
                          <td colSpan={6} className="px-3 py-8 text-center text-[var(--muted-foreground)]">
                            暂无审计记录
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Pagination */}
              {auditLogs && auditLogs.total > auditLogs.page_size && (
                <div className="flex items-center justify-between">
                  <p className="text-xs text-[var(--muted-foreground)]">
                    共 {auditLogs.total} 条，第 {auditPage} / {Math.ceil(auditLogs.total / auditLogs.page_size)} 页
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline" size="sm"
                      disabled={auditPage <= 1}
                      onClick={() => loadAudit(auditPage - 1, auditCaller, auditStatus)}
                    >
                      上一页
                    </Button>
                    <Button
                      variant="outline" size="sm"
                      disabled={auditPage >= Math.ceil(auditLogs.total / auditLogs.page_size)}
                      onClick={() => loadAudit(auditPage + 1, auditCaller, auditStatus)}
                    >
                      下一页
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab 5: Data Card ─────────────────────── */}
        <TabsContent value="datacard" className="space-y-4">
          {datacardLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-[var(--muted-foreground)]" />
            </div>
          ) : datacard ? (
            <>
              {/* Ontology metadata */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>本体概览</CardTitle>
                      <CardDescription>自动生成的本体元数据摘要</CardDescription>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => loadDatacard()}>
                      <RefreshCw className="mr-2 h-4 w-4" />
                      刷新
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <p className="text-[var(--muted-foreground)]">标题</p>
                      <p className="font-medium">{datacard.ontology.title || '-'}</p>
                    </div>
                    <div>
                      <p className="text-[var(--muted-foreground)]">版本</p>
                      <p className="font-medium">{datacard.ontology.version || '-'}</p>
                    </div>
                    <div>
                      <p className="text-[var(--muted-foreground)]">IRI</p>
                      <p className="truncate font-mono text-xs">{datacard.ontology.iri || '-'}</p>
                    </div>
                  </div>
                  <p className="mt-3 text-xs text-[var(--muted-foreground)]">
                    生成时间: {new Date(datacard.generated_at).toLocaleString('zh-CN')} |
                    最后更新: {datacard.last_updated ? new Date(datacard.last_updated).toLocaleString('zh-CN') : '-'}
                  </p>
                </CardContent>
              </Card>

              {/* Statistics grid */}
              <div className="grid grid-cols-5 gap-4">
                <Card>
                  <CardContent className="flex flex-col items-center p-4">
                    <p className="text-2xl font-bold text-primary">{datacard.statistics.class_count}</p>
                    <p className="text-xs text-[var(--muted-foreground)]">类</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="flex flex-col items-center p-4">
                    <p className="text-2xl font-bold text-primary">{datacard.statistics.data_property_count}</p>
                    <p className="text-xs text-[var(--muted-foreground)]">数据属性</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="flex flex-col items-center p-4">
                    <p className="text-2xl font-bold text-primary">{datacard.statistics.object_property_count}</p>
                    <p className="text-xs text-[var(--muted-foreground)]">对象属性</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="flex flex-col items-center p-4">
                    <p className="text-2xl font-bold text-primary">{datacard.statistics.shacl_constraint_count}</p>
                    <p className="text-xs text-[var(--muted-foreground)]">SHACL 约束</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="flex flex-col items-center p-4">
                    <p className="text-2xl font-bold text-primary">{datacard.statistics.mapping_rule_count}</p>
                    <p className="text-xs text-[var(--muted-foreground)]">映射规则</p>
                  </CardContent>
                </Card>
              </div>

              {/* Data source health */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">数据源健康状态</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-3">
                    {datacard.data_source_health.endpoint_reachable ? (
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                    ) : (
                      <XCircle className="h-5 w-5 text-red-500" />
                    )}
                    <span className="text-sm">
                      SPARQL 端点 {datacard.data_source_health.endpoint_reachable ? '可达' : '不可达'}
                    </span>
                    <code className="text-xs text-[var(--muted-foreground)]">{datacard.data_source_health.endpoint_url}</code>
                  </div>
                </CardContent>
              </Card>

              {/* Class breakdown */}
              {datacard.class_breakdown.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>类分布</CardTitle>
                    <CardDescription>各类的属性数量</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-auto rounded-lg border">
                      <table className="w-full text-sm">
                        <thead className="bg-[var(--muted)]/50">
                          <tr>
                            <th className="px-3 py-2 text-left font-medium">类名</th>
                            <th className="px-3 py-2 text-right font-medium">属性数</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {datacard.class_breakdown.map((cls) => (
                            <tr key={cls.name} className="hover:bg-[var(--accent)]/50">
                              <td className="px-3 py-2">
                                <code className="text-xs">{cls.name}</code>
                                {cls.uri && (
                                  <p className="mt-0.5 truncate text-xs text-[var(--muted-foreground)]">{cls.uri}</p>
                                )}
                              </td>
                              <td className="px-3 py-2 text-right">{cls.property_count}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Instance estimates */}
              {datacard.instance_estimates && Object.keys(datacard.instance_estimates).length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>实例估算</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-3 gap-3">
                      {Object.entries(datacard.instance_estimates).map(([cls, count]) => (
                        <div key={cls} className="rounded-lg border p-3">
                          <code className="text-xs">{cls}</code>
                          <p className="text-lg font-semibold">{count.toLocaleString()}</p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Export */}
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => copyToClipboard(JSON.stringify(datacard, null, 2), '数据卡片 JSON')}
                >
                  <Copy className="mr-2 h-4 w-4" />
                  导出 JSON
                </Button>
              </div>
            </>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Database className="mb-3 h-10 w-10 text-[var(--muted-foreground)]" />
                <p className="text-[var(--muted-foreground)]">暂无数据卡片</p>
                <Button variant="outline" size="sm" className="mt-3" onClick={() => loadDatacard()}>
                  加载数据卡片
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
