'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  FileCode,
  RefreshCw,
  Plus,
  Pencil,
  CheckCircle2,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Trash2,
  Loader2,
  Braces,
  Network,
} from 'lucide-react';
import { mappings, type MappingContent, type MappingFile } from '@/lib/api';

interface Prefix {
  prefix: string;
  iri: string;
}

interface MappingUI {
  id: string;
  mappingId: string;
  target: string;
  source: string;
}

function compactText(value: string, max = 96) {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max)}...`;
}

function extractClassName(target: string) {
  const match = target.match(/a\s+<([^>]+)>/);
  if (!match) return '未识别类';
  const uri = match[1];
  const parts = uri.split(/[#/]/).filter(Boolean);
  return parts[parts.length - 1] || uri;
}

function extractSourceTable(source: string) {
  const match = source.match(/\bfrom\s+([^\s;]+)/i);
  return match?.[1] ?? '未识别来源表';
}

function countTargetProperties(target: string) {
  const properties = target.match(/<[^>]+>\s+\{/g);
  return properties?.length ?? 0;
}

export default function MappingPage() {
  const [files, setFiles] = useState<MappingFile[]>([]);
  const [selectedPath, setSelectedPath] = useState<string>('');
  const [mappingsUI, setMappingsUI] = useState<MappingUI[]>([]);
  const [prefixes, setPrefixes] = useState<Prefix[]>([]);
  const [rawContent, setRawContent] = useState<MappingContent | null>(null);
  const [loading, setLoading] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<{ valid: boolean; errors: string[] } | null>(null);
  const [showPrefixes, setShowPrefixes] = useState(true);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingMapping, setEditingMapping] = useState<MappingUI | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedMappingId, setSelectedMappingId] = useState<string>('');

  const loadContent = async (path: string) => {
    setLoading(true);
    setValidationResult(null);
    try {
      const content = await mappings.getContent(path);
      setRawContent(content);
      setMappingsUI(
        content.mappings.map((m, i) => ({
          id: String(i),
          mappingId: m.mapping_id,
          target: m.target,
          source: m.source,
        }))
      );
      setSelectedMappingId(content.mappings[0] ? '0' : '');
      setPrefixes(
        Object.entries(content.prefixes).map(([prefix, iri]) => ({ prefix, iri }))
      );
    } catch {
      setMappingsUI([]);
      setPrefixes([]);
      setRawContent(null);
    }
    setLoading(false);
  };

  useEffect(() => {
    void (async () => {
      try {
        const list = await mappings.listFiles();
        setFiles(list);
        setSelectedPath((current) => current || list[0]?.path || '');
      } catch {
        // ignore
      }
    })();
  }, []);

  const saveContent = async (newMappings: MappingUI[]) => {
    if (!rawContent || !selectedPath) return;
    setIsSaving(true);
    try {
      await mappings.saveContent(selectedPath, {
        prefixes: rawContent.prefixes,
        mappings: newMappings.map((m) => ({
          mapping_id: m.mappingId,
          target: m.target,
          source: m.source,
        })),
      });
      setMappingsUI(newMappings);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '未知错误';
      alert(`保存失败: ${message}`);
    }
    setIsSaving(false);
  };

  useEffect(() => {
    if (selectedPath) {
      void loadContent(selectedPath);
    }
  }, [selectedPath]);

  const handleValidate = async () => {
    if (!selectedPath) return;
    setIsValidating(true);
    setValidationResult(null);
    try {
      const result = await mappings.validate(selectedPath);
      setValidationResult(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '未知错误';
      setValidationResult({ valid: false, errors: [message] });
    }
    setIsValidating(false);
  };

  const handleRestart = async () => {
    try {
      await mappings.restartEndpoint();
      alert('端点已重启');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '未知错误';
      alert(`重启失败: ${message}`);
    }
  };

  const handleEditMapping = (mapping: MappingUI) => {
    setEditingMapping({ ...mapping });
    setIsEditDialogOpen(true);
  };

  const handleSaveMapping = async () => {
    if (!editingMapping) return;
    const updated = mappingsUI.map((m) =>
      m.id === editingMapping.id ? editingMapping : m
    );
    await saveContent(updated);
    setSelectedMappingId(editingMapping.id);
    setIsEditDialogOpen(false);
    setEditingMapping(null);
  };

  const handleAddMapping = async () => {
    const newId = `MAPPING-ID${Date.now()}`;
    const newMapping: MappingUI = {
      id: String(Date.now()),
      mappingId: newId,
      target: '',
      source: '',
    };
    const updated = [...mappingsUI, newMapping];
    await saveContent(updated);
    setSelectedMappingId(newMapping.id);
  };

  const handleDeleteMapping = async (id: string) => {
    const updated = mappingsUI.filter((m) => m.id !== id);
    await saveContent(updated);
    setSelectedMappingId((current) => {
      if (current !== id) return current;
      return updated[0]?.id ?? '';
    });
  };

  const selectedFile = files.find((f) => f.path === selectedPath);
  const selectedMapping = mappingsUI.find((mapping) => mapping.id === selectedMappingId) ?? mappingsUI[0] ?? null;
  const selectedClassName = selectedMapping ? extractClassName(selectedMapping.target) : '未选择';
  const selectedSourceTable = selectedMapping ? extractSourceTable(selectedMapping.source) : '未选择';

  useEffect(() => {
    if (mappingsUI.length === 0) {
      setSelectedMappingId('');
      return;
    }
    if (!selectedMappingId || !mappingsUI.some((mapping) => mapping.id === selectedMappingId)) {
      setSelectedMappingId(mappingsUI[0].id);
    }
  }, [mappingsUI, selectedMappingId]);

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 56px - 48px)' }}>
      {/* 页面头部 */}
      <div className="border-b border-border pb-4 mb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-[oklch(0.70_0.15_280)] to-[oklch(0.65_0.18_200)]">
              <FileCode className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-foreground">映射编辑</h1>
              <p className="text-sm text-muted-foreground">管理 OBDA 映射规则</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Select value={selectedPath} onValueChange={setSelectedPath}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="选择映射文件" />
              </SelectTrigger>
              <SelectContent>
                {files.map((file) => (
                  <SelectItem key={file.path} value={file.path}>
                    {file.filename}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={handleValidate} disabled={isValidating || !selectedPath}>
              {isValidating ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="mr-2 h-4 w-4" />
              )}
              验证
            </Button>
            <Button size="sm" onClick={handleRestart}>
              <RefreshCw className="mr-2 h-4 w-4" />
              重启端点
            </Button>
          </div>
        </div>

        {/* 验证状态提示 */}
        {validationResult && (
          <div
            className={`mt-4 flex items-center gap-2 rounded-lg p-3 ${
              validationResult.valid
                ? 'bg-emerald-500/10 text-emerald-500'
                : 'bg-destructive/10 text-destructive'
            }`}
          >
            {validationResult.valid ? (
              <>
                <CheckCircle2 className="h-4 w-4" />
                <span className="text-sm">映射规则验证通过</span>
              </>
            ) : (
              <>
                <AlertCircle className="h-4 w-4" />
                <span className="text-sm">
                  映射规则存在错误: {validationResult.errors.join('; ')}
                </span>
              </>
            )}
          </div>
        )}
      </div>

      <div className="grid flex-1 gap-6 overflow-hidden p-6 xl:grid-cols-[320px_minmax(0,1fr)]">
        <Card className="overflow-hidden">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle className="text-base">规则列表</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  只看 Mapping ID、类名和来源表，先定位规则再进入详情。
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={handleAddMapping} disabled={!selectedPath}>
                <Plus className="mr-2 h-4 w-4" />
                添加
              </Button>
            </div>
          </CardHeader>
          <CardContent className="border-t p-0">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : mappingsUI.length === 0 ? (
              <div className="px-6 py-12 text-center text-sm text-muted-foreground">
                当前文件还没有映射规则。
              </div>
            ) : (
              <ScrollArea className="h-full max-h-[calc(100vh-280px)]">
                <div className="space-y-2 p-3">
                  {mappingsUI.map((mapping) => {
                    const className = extractClassName(mapping.target);
                    const sourceTable = extractSourceTable(mapping.source);
                    const isActive = selectedMapping?.id === mapping.id;
                    return (
                      <button
                        key={mapping.id}
                        type="button"
                        onClick={() => setSelectedMappingId(mapping.id)}
                        className={`w-full rounded-xl border p-4 text-left transition-colors ${
                          isActive
                            ? 'border-primary/60 bg-primary/10'
                            : 'border-border/70 bg-card hover:bg-muted/40'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-2">
                            <p className="font-mono text-xs text-primary">{mapping.mappingId}</p>
                            <p className="text-sm font-medium text-foreground">{className}</p>
                            <div className="flex flex-wrap gap-2">
                              <Badge variant="outline" className="text-[10px]">{sourceTable}</Badge>
                              <Badge variant="secondary" className="text-[10px]">
                                {countTargetProperties(mapping.target)} 个属性
                              </Badge>
                            </div>
                          </div>
                          {isActive && <Badge variant="secondary">当前</Badge>}
                        </div>
                        <p className="mt-3 text-xs text-muted-foreground">
                          {compactText(mapping.source, 72)}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-4 overflow-hidden xl:grid-rows-[auto_auto_minmax(0,1fr)]">
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardContent className="flex items-start justify-between p-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">当前文件</p>
                  <p className="mt-2 text-lg font-semibold text-foreground">
                    {selectedFile?.filename ?? '未选择'}
                  </p>
                </div>
                <FileCode className="h-4 w-4 text-primary" />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-start justify-between p-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">映射规则</p>
                  <p className="mt-2 text-lg font-semibold text-foreground">{mappingsUI.length}</p>
                </div>
                <Network className="h-4 w-4 text-primary" />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-start justify-between p-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Prefix</p>
                  <p className="mt-2 text-lg font-semibold text-foreground">{prefixes.length}</p>
                </div>
                <Braces className="h-4 w-4 text-primary" />
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle className="text-base">规则摘要</CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">
                    先看类名和来源表，再决定是否编辑整段模板。
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">类: {selectedClassName}</Badge>
                  <Badge variant="outline">表: {selectedSourceTable}</Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {selectedMapping ? (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
                    <p className="text-xs text-muted-foreground">Mapping ID</p>
                    <p className="mt-2 font-mono text-sm text-foreground">{selectedMapping.mappingId}</p>
                  </div>
                  <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
                    <p className="text-xs text-muted-foreground">类名</p>
                    <p className="mt-2 text-sm font-medium text-foreground">{selectedClassName}</p>
                  </div>
                  <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
                    <p className="text-xs text-muted-foreground">来源表</p>
                    <p className="mt-2 font-mono text-sm text-foreground">{selectedSourceTable}</p>
                  </div>
                  <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
                    <p className="text-xs text-muted-foreground">属性数</p>
                    <p className="mt-2 text-sm font-medium text-foreground">{countTargetProperties(selectedMapping.target)}</p>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
                  选择左侧规则后在这里查看详情。
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid min-h-0 gap-4 xl:grid-cols-[minmax(0,1.2fr)_320px]">
            <div className="grid min-h-0 gap-4">
              <Card className="min-h-0">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Target</CardTitle>
                </CardHeader>
                <CardContent className="min-h-0">
                  {selectedMapping ? (
                    <ScrollArea className="h-[240px] rounded-xl border border-border/70 bg-muted/20 p-4">
                      <pre className="whitespace-pre-wrap break-words font-mono text-xs text-foreground">
                        {selectedMapping.target}
                      </pre>
                    </ScrollArea>
                  ) : null}
                </CardContent>
              </Card>

              <Card className="min-h-0">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Source</CardTitle>
                </CardHeader>
                <CardContent className="min-h-0">
                  {selectedMapping ? (
                    <ScrollArea className="h-[180px] rounded-xl border border-border/70 bg-muted/20 p-4">
                      <pre className="whitespace-pre-wrap break-words font-mono text-xs text-foreground">
                        {selectedMapping.source}
                      </pre>
                    </ScrollArea>
                  ) : null}
                </CardContent>
              </Card>
            </div>

            <div className="grid min-h-0 gap-4">
              <Card>
                <CardHeader className="pb-3">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-2 text-left"
                    onClick={() => setShowPrefixes(!showPrefixes)}
                  >
                    <div className="flex items-center gap-2">
                      {showPrefixes ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      <CardTitle className="text-base">Prefix</CardTitle>
                    </div>
                    <Badge variant="secondary">{prefixes.length}</Badge>
                  </button>
                </CardHeader>
                <CardContent>
                  {showPrefixes && (
                    <ScrollArea className="h-[220px]">
                      <div className="space-y-2">
                        {prefixes.map((prefix) => (
                          <div key={prefix.prefix} className="rounded-lg border border-border/70 bg-muted/20 p-3">
                            <p className="font-mono text-xs text-primary">{prefix.prefix}:</p>
                            <p className="mt-1 break-all font-mono text-xs text-muted-foreground">{prefix.iri}</p>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">操作</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Button
                    className="w-full"
                    onClick={() => selectedMapping && handleEditMapping(selectedMapping)}
                    disabled={!selectedMapping}
                  >
                    <Pencil className="mr-2 h-4 w-4" />
                    编辑当前规则
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => selectedMapping && handleDeleteMapping(selectedMapping.id)}
                    disabled={!selectedMapping}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    删除当前规则
                  </Button>
                  <div className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                    详情区保留完整 Target 和 Source，左侧列表只展示摘要，避免首屏被长代码淹没。
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>

      {/* 编辑对话框 */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>编辑映射规则</DialogTitle>
          </DialogHeader>
          {editingMapping && (
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label>Mapping ID</Label>
                <Input
                  value={editingMapping.mappingId}
                  onChange={(e) => setEditingMapping({ ...editingMapping, mappingId: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label>Target (RDF 模板)</Label>
                <Textarea
                  value={editingMapping.target}
                  onChange={(e) => setEditingMapping({ ...editingMapping, target: e.target.value })}
                  className="font-mono text-xs"
                  rows={4}
                />
              </div>
              <div className="grid gap-2">
                <Label>Source (SQL)</Label>
                <Textarea
                  value={editingMapping.source}
                  onChange={(e) => setEditingMapping({ ...editingMapping, source: e.target.value })}
                  className="font-mono text-xs"
                  rows={2}
                />
              </div>
            </div>
          )}
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={handleSaveMapping} disabled={isSaving}>
              {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              保存
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
