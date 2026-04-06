'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  Database,
  KeyRound,
  Link2,
  Loader2,
  RefreshCw,
  Search,
  ShieldAlert,
  Sparkles,
  Table as TableIcon,
  WandSparkles,
} from 'lucide-react';
import { datasources, type BootstrapPreview as ApiBootstrapPreview, type BootstrapResult, type DataSource, workbench, type SemanticCandidates } from '@/lib/api';

interface Column {
  name: string;
  datatype: string;
  isNullable: boolean;
}

interface ForeignKey {
  name?: string;
  from: { columns: string[] };
  to: { relation: string[]; columns: string[] };
}

interface UniqueConstraint {
  isPrimaryKey: boolean;
  determinants: string[];
}

interface Relation {
  name: string[];
  columns: Column[];
  foreignKeys: ForeignKey[];
  uniqueConstraints: UniqueConstraint[];
}

interface DbSchema {
  relations: Relation[];
  metadata: {
    dbmsProductName: string;
    dbmsVersion: string;
    extractionTime?: string;
  };
}

interface CleanedRelation {
  tableName: string;
  columns: Column[];
  foreignKeys: ForeignKey[];
  uniqueConstraints: UniqueConstraint[];
  primaryKeyColumns: string[];
  inboundReferences: Array<{ fromTable: string; fromColumns: string[]; toColumns: string[] }>;
  tableKind: '事实表' | '维表' | '普通表';
}

function stripQuotes(value: string) {
  return value.replace(/"/g, '');
}

function formatTimestamp(value?: string) {
  if (!value) return '未记录';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function guessTableKind(tableName: string): CleanedRelation['tableKind'] {
  const lower = tableName.toLowerCase();
  if (lower.startsWith('fact_')) return '事实表';
  if (lower.startsWith('dim_')) return '维表';
  return '普通表';
}

function inferIdentifierColumns(relation: CleanedRelation) {
  if (relation.primaryKeyColumns.length > 0) return relation.primaryKeyColumns;
  return relation.columns
    .filter((column) => /(^id$|_id$|id_)/i.test(column.name))
    .map((column) => column.name);
}

function inferPropertyColumns(relation: CleanedRelation) {
  const foreignKeyColumns = new Set(
    relation.foreignKeys.flatMap((foreignKey) => foreignKey.from.columns.map(stripQuotes))
  );
  return relation.columns
    .map((column) => column.name)
    .filter((columnName) => !relation.primaryKeyColumns.includes(columnName) && !foreignKeyColumns.has(columnName));
}

function buildTableBootstrapPreview(relation: CleanedRelation) {
  const identifierColumns = inferIdentifierColumns(relation);
  const uriColumn = identifierColumns[0] ?? relation.columns[0]?.name ?? 'id';
  const propertyColumns = inferPropertyColumns(relation);
  const objectProperties = relation.foreignKeys.map((foreignKey) => {
    const localColumn = stripQuotes(foreignKey.from.columns[0] ?? 'ref_id');
    const targetTable = foreignKey.to.relation.map(stripQuotes).join('.');
    return {
      name: `ref-${localColumn}`,
      targetTable,
    };
  });

  return {
    className: relation.tableName,
    uriTemplate: `/${relation.tableName}/${uriColumn}={${uriColumn}}`,
    identifierColumns,
    propertyColumns,
    objectProperties,
  };
}

export default function DbSchemaPage() {
  const [dsList, setDsList] = useState<DataSource[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [schema, setSchema] = useState<DbSchema | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTableName, setSelectedTableName] = useState('');
  const [selectedTables, setSelectedTables] = useState<string[]>([]);
  const [includeDependencies, setIncludeDependencies] = useState(true);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [generatingPartial, setGeneratingPartial] = useState(false);
  const [partialPreview, setPartialPreview] = useState<ApiBootstrapPreview | null>(null);
  const [bootstrapResult, setBootstrapResult] = useState<BootstrapResult | null>(null);
  const [semanticCandidates, setSemanticCandidates] = useState<SemanticCandidates | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generateResult, setGenerateResult] = useState<BootstrapResult | null>(null);

  const loadSchema = async (dataSourceId: string) => {
    if (!dataSourceId) return;
    setLoading(true);
    setSchema(null);
    try {
      const data = await datasources.schema(dataSourceId);
      setSchema(data as DbSchema);
    } catch {
      setSchema(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    datasources.list().then((list) => {
      setDsList(list);
      if (list.length > 0) setSelectedId(list[0].id);
    });
  }, []);

  const loadLatestBootstrap = async (dataSourceId: string) => {
    if (!dataSourceId) return;
    try {
      const result = await datasources.getLatestBootstrap(dataSourceId);
      setBootstrapResult(result);
    } catch {
      setBootstrapResult(null);
    }
  };

  useEffect(() => {
    if (!selectedId) return;
    
    // Clear state before loading
    setSelectedTables([]);
    setPartialPreview(null);
    setBootstrapResult(null);
    
    loadSchema(selectedId);
    loadLatestBootstrap(selectedId);
  }, [selectedId]);

  const cleanedRelations = useMemo<CleanedRelation[]>(() => {
    const relations = schema?.relations ?? [];

    const baseRelations = relations.map((relation) => {
      const tableName = relation.name.map(stripQuotes).join('.');
      const columns = (relation.columns ?? []).map((column) => ({
        ...column,
        name: stripQuotes(column.name ?? ''),
      }));
      const foreignKeys = (relation.foreignKeys ?? []).map((foreignKey) => ({
        ...foreignKey,
        from: { columns: (foreignKey.from?.columns ?? []).map(stripQuotes) },
        to: {
          relation: (foreignKey.to?.relation ?? []).map(stripQuotes),
          columns: (foreignKey.to?.columns ?? []).map(stripQuotes),
        },
      }));
      const uniqueConstraints = relation.uniqueConstraints ?? [];
      const primaryKeyColumns =
        uniqueConstraints
          .find((constraint) => constraint.isPrimaryKey)
          ?.determinants.map(stripQuotes) ?? [];

      return {
        tableName,
        columns,
        foreignKeys,
        uniqueConstraints,
        primaryKeyColumns,
        inboundReferences: [],
        tableKind: guessTableKind(tableName),
      };
    });

    const inboundMap = new Map<string, Array<{ fromTable: string; fromColumns: string[]; toColumns: string[] }>>();
    for (const relation of baseRelations) {
      for (const foreignKey of relation.foreignKeys) {
        const targetTable = foreignKey.to.relation.join('.');
        const inbound = inboundMap.get(targetTable) ?? [];
        inbound.push({
          fromTable: relation.tableName,
          fromColumns: foreignKey.from.columns,
          toColumns: foreignKey.to.columns,
        });
        inboundMap.set(targetTable, inbound);
      }
    }

    return baseRelations.map((relation) => ({
      ...relation,
      inboundReferences: inboundMap.get(relation.tableName) ?? [],
    }));
  }, [schema]);

  const filteredRelations = useMemo(() => {
    if (!searchQuery.trim()) return cleanedRelations;
    const query = searchQuery.toLowerCase();
    return cleanedRelations.filter((relation) => {
      return (
        relation.tableName.toLowerCase().includes(query) ||
        relation.columns.some((column) => column.name.toLowerCase().includes(query))
      );
    });
  }, [cleanedRelations, searchQuery]);

  useEffect(() => {
    if (filteredRelations.length === 0) {
      setSelectedTableName('');
      return;
    }
    if (!selectedTableName || !filteredRelations.some((relation) => relation.tableName === selectedTableName)) {
      setSelectedTableName(filteredRelations[0].tableName);
    }
  }, [filteredRelations, selectedTableName]);

  const selectedRelation =
    filteredRelations.find((relation) => relation.tableName === selectedTableName) ?? null;
  const bootstrapPreview = selectedRelation ? buildTableBootstrapPreview(selectedRelation) : null;

  const totalColumns = cleanedRelations.reduce((sum, relation) => sum + relation.columns.length, 0);
  const totalForeignKeys = cleanedRelations.reduce((sum, relation) => sum + relation.foreignKeys.length, 0);
  const totalPrimaryKeys = cleanedRelations.filter((relation) => relation.primaryKeyColumns.length > 0).length;
  const totalNullableColumns = cleanedRelations.reduce(
    (sum, relation) => sum + relation.columns.filter((column) => column.isNullable).length,
    0
  );

  const riskItems = useMemo(() => {
    const items: string[] = [];
    const missingPrimaryKey = cleanedRelations.filter((relation) => relation.primaryKeyColumns.length === 0);
    if (missingPrimaryKey.length > 0) {
      items.push(`${missingPrimaryKey.length} 张表缺少主键，Bootstrap 时 URI 稳定性会变差。`);
    }

    const weakNamingTables = cleanedRelations.filter((relation) =>
      /(^tmp_|_bak$|_test$)/i.test(relation.tableName)
    );
    if (weakNamingTables.length > 0) {
      items.push(`${weakNamingTables.length} 张表命名像中间表或临时表，建议不要直接暴露到本体层。`);
    }

    if (totalForeignKeys === 0 && cleanedRelations.length > 1) {
      items.push('当前没有检测到外键关系，对象属性会严重不足。');
    }

    if (items.length === 0 && cleanedRelations.length > 0) {
      items.push('当前结构可直接用于 Bootstrap，后续重点是语义命名和标签补充。');
    }

    return items;
  }, [cleanedRelations, totalForeignKeys]);

  const selectedDataSource = dsList.find((ds) => ds.id === selectedId) ?? null;

  const toggleSelectedTable = (tableName: string, checked: boolean) => {
    setSelectedTables((current) =>
      checked ? [...new Set([...current, tableName])] : current.filter((item) => item !== tableName)
    );
    setPartialPreview(null);
    setBootstrapResult(null);
  };

  const handlePreviewPartialBootstrap = async () => {
    if (!selectedId || selectedTables.length === 0) {
      toast.error('请先勾选至少一张表');
      return;
    }

    setPreviewLoading(true);
    try {
      const preview = await datasources.bootstrapPreview(selectedId, {
        mode: 'partial',
        tables: selectedTables,
        include_dependencies: includeDependencies,
        base_iri: 'http://example.com/ontop/',
      });
      setPartialPreview(preview);
      setBootstrapResult(null);
      toast.success('局部 Bootstrap 预览已生成');
    } catch (error: any) {
      toast.error(error.message || '局部 Bootstrap 预览失败');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleGeneratePartialBootstrap = async () => {
    if (!selectedId || selectedTables.length === 0) {
      toast.error('请先勾选至少一张表');
      return;
    }

    setGeneratingPartial(true);
    try {
      const result = await datasources.bootstrap(selectedId, {
        mode: 'partial',
        tables: selectedTables,
        include_dependencies: includeDependencies,
        base_iri: 'http://example.com/ontop/',
      });
      setBootstrapResult(result);
      if (!partialPreview) {
        setPartialPreview({
          requested_tables: result.requested_tables,
          resolved_tables: result.resolved_tables,
          added_dependencies: result.added_dependencies,
          warnings: [],
          estimated_classes: result.resolved_tables,
          estimated_object_properties: [],
        });
      }
      toast.success('局部 Bootstrap 已生成新版本');
    } catch (error: any) {
      toast.error(error.message || '局部 Bootstrap 失败');
    } finally {
      setGeneratingPartial(false);
    }
  };

  const handleSemanticAnalyze = async () => {
    if (!selectedId || selectedTables.length === 0) {
      toast.error('请先勾选至少一张表');
      return;
    }
    setAnalyzing(true);
    try {
      const result = await workbench.analyze(selectedId, selectedTables);
      setSemanticCandidates(result);
      toast.success('语义分析完成');
    } catch (error: any) {
      toast.error(error.message || '语义分析失败');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleSemanticGenerate = async () => {
    if (!selectedId || selectedTables.length === 0) {
      toast.error('请先勾选至少一张表');
      return;
    }
    setGenerating(true);
    try {
      const result = await workbench.generate(selectedId, selectedTables);
      setGenerateResult(result);
      toast.success('本体和映射文件已生成');
    } catch (error: any) {
      toast.error(error.message || '生成失败');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 border-b border-border pb-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-[oklch(0.70_0.15_280)] to-[oklch(0.65_0.18_200)]">
            <TableIcon className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-foreground">数据库概览</h1>
            <p className="text-sm text-muted-foreground">在 Bootstrap 和映射之前先看清数据库结构与关系。</p>
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <Select value={selectedId} onValueChange={setSelectedId}>
            <SelectTrigger className="w-full sm:w-64">
              <SelectValue placeholder="选择数据源" />
            </SelectTrigger>
            <SelectContent>
              {dsList.map((dataSource) => (
                <SelectItem key={dataSource.id} value={dataSource.id}>
                  {dataSource.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={() => loadSchema(selectedId)} disabled={!selectedId || loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            刷新结构
          </Button>
        </div>
      </div>

      {schema && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <Card className="border-border/80 bg-card/70">
            <CardHeader className="gap-1">
              <CardDescription>数据库</CardDescription>
              <CardTitle className="text-lg">
                {schema.metadata.dbmsProductName}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              版本 {schema.metadata.dbmsVersion}
            </CardContent>
          </Card>

          <Card className="border-border/80 bg-card/70">
            <CardHeader className="gap-1">
              <CardDescription>表数量</CardDescription>
              <CardTitle className="text-lg">{cleanedRelations.length}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              共 {totalColumns} 列
            </CardContent>
          </Card>

          <Card className="border-border/80 bg-card/70">
            <CardHeader className="gap-1">
              <CardDescription>主键覆盖</CardDescription>
              <CardTitle className="text-lg">{totalPrimaryKeys}/{cleanedRelations.length || 0}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              URI 候选标识符
            </CardContent>
          </Card>

          <Card className="border-border/80 bg-card/70">
            <CardHeader className="gap-1">
              <CardDescription>外键关系</CardDescription>
              <CardTitle className="text-lg">{totalForeignKeys}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              对象属性生成基础
            </CardContent>
          </Card>

          <Card className="border-border/80 bg-card/70">
            <CardHeader className="gap-1">
              <CardDescription>最近探测</CardDescription>
              <CardTitle className="text-lg text-sm font-medium">
                {formatTimestamp(schema.metadata.extractionTime)}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {selectedDataSource?.name ?? '未选择数据源'}
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
        <div className="space-y-6">
          <Card className="border-border/80 bg-card/70">
            <CardHeader className="gap-2">
              <CardTitle className="text-base">结构视图</CardTitle>
              <CardDescription>按表浏览，优先看键关系和建模价值。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="搜索表名或字段..."
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  className="pl-9"
                />
              </div>

              {!schema ? (
                <div className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
                  选择数据源后显示表清单
                </div>
              ) : filteredRelations.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
                  没有匹配的表或字段
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredRelations.map((relation) => {
                    const isSelected = relation.tableName === selectedTableName;
                    const isChecked = selectedTables.includes(relation.tableName);
                    return (
                      <button
                        key={relation.tableName}
                        type="button"
                        onClick={() => setSelectedTableName(relation.tableName)}
                        className={[
                          'w-full rounded-xl border p-4 text-left transition-colors',
                          isSelected
                            ? 'border-primary/60 bg-primary/10'
                            : 'border-border/80 bg-background/30 hover:bg-muted/40',
                        ].join(' ')}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3">
                            <Checkbox
                              checked={isChecked}
                              onCheckedChange={(checked) => toggleSelectedTable(relation.tableName, checked === true)}
                              className="mt-0.5"
                              onClick={(event) => event.stopPropagation()}
                              aria-label={`选择表 ${relation.tableName}`}
                            />
                            <div>
                              <p className="font-medium text-foreground">{relation.tableName}</p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {relation.columns.length} 列 · {relation.foreignKeys.length} 个外键 · 被引用 {relation.inboundReferences.length} 次
                              </p>
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-2">
                            <Badge variant={isSelected ? 'default' : 'secondary'}>{relation.tableKind}</Badge>
                            {isChecked && <Badge variant="outline">已选</Badge>}
                          </div>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2 text-xs">
                          {relation.primaryKeyColumns.length > 0 ? (
                            <Badge variant="outline" className="border-amber-500/30 text-amber-500">
                              <KeyRound className="mr-1 h-3 w-3" />
                              {relation.primaryKeyColumns.join(', ')}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="border-destructive/30 text-destructive">
                              <ShieldAlert className="mr-1 h-3 w-3" />
                              无主键
                            </Badge>
                          )}
                          {relation.foreignKeys.length > 0 && (
                            <Badge variant="outline">
                              <Link2 className="mr-1 h-3 w-3" />
                              可生成对象关系
                            </Badge>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-border/80 bg-card/70">
            <CardHeader className="gap-2">
              <CardTitle className="text-base">结构评估</CardTitle>
              <CardDescription>这里判断 schema 对 Bootstrap 的友好程度。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center justify-between rounded-lg border border-border/70 bg-background/30 px-3 py-2">
                <span className="text-muted-foreground">可直接 Bootstrap</span>
                <span className="font-medium text-foreground">
                  {cleanedRelations.length > 0 && totalPrimaryKeys === cleanedRelations.length ? '是' : '需检查'}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border/70 bg-background/30 px-3 py-2">
                <span className="text-muted-foreground">外键可见性</span>
                <span className="font-medium text-foreground">{totalForeignKeys > 0 ? '良好' : '偏弱'}</span>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border/70 bg-background/30 px-3 py-2">
                <span className="text-muted-foreground">可空字段</span>
                <span className="font-medium text-foreground">{totalNullableColumns}</span>
              </div>
              <div className="rounded-lg border border-border/70 bg-background/30 p-3">
                <p className="mb-2 flex items-center gap-2 font-medium text-foreground">
                  <Sparkles className="h-4 w-4 text-primary" />
                  建模建议
                </p>
                <ul className="space-y-2 text-muted-foreground">
                  {riskItems.map((item) => (
                    <li key={item} className="leading-6">
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-lg border border-border/70 bg-background/30 p-3">
                <p className="mb-2 font-medium text-foreground">局部 Bootstrap 说明</p>
                <p className="text-muted-foreground">
                  勾选表后可先做预览。建议优先选事实表，开启“自动补依赖”以补齐外键目标表。
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          {loading ? (
            <div className="flex min-h-[420px] items-center justify-center rounded-xl border border-border/70 bg-card/60">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : !schema ? (
            <div className="flex min-h-[420px] items-center justify-center rounded-xl border border-dashed border-border/70 bg-card/40">
              <div className="text-center">
                <Database className="mx-auto mb-3 h-12 w-12 text-muted-foreground/60" />
                <p className="text-sm text-muted-foreground">选择数据源后查看数据库概览。</p>
              </div>
            </div>
          ) : !selectedRelation ? (
            <div className="flex min-h-[420px] items-center justify-center rounded-xl border border-dashed border-border/70 bg-card/40">
              <p className="text-sm text-muted-foreground">请选择一张表查看详情。</p>
            </div>
          ) : (
            <Tabs defaultValue="structure" className="space-y-6">
              <TabsList>
                <TabsTrigger value="structure">表结构</TabsTrigger>
                <TabsTrigger value="semantic">语义建模</TabsTrigger>
              </TabsList>

              <TabsContent value="structure" className="space-y-6">
              <Card className="border-border/80 bg-card/70">
                <CardHeader className="gap-2">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <CardTitle className="text-xl">{selectedRelation.tableName}</CardTitle>
                      <CardDescription className="mt-1">
                        当前表会直接影响 Bootstrap 生成的类、数据属性与对象属性。
                      </CardDescription>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="secondary">{selectedRelation.tableKind}</Badge>
                      <Badge variant="outline">{selectedRelation.columns.length} 列</Badge>
                      <Badge variant="outline">{selectedRelation.foreignKeys.length} 个外键</Badge>
                      <Badge variant="outline">被引用 {selectedRelation.inboundReferences.length} 次</Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-xl border border-border/70 bg-background/30 p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">主键</p>
                    <p className="mt-2 text-sm font-medium text-foreground">
                      {selectedRelation.primaryKeyColumns.length > 0
                        ? selectedRelation.primaryKeyColumns.join(', ')
                        : '未检测到'}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border/70 bg-background/30 p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">向外引用</p>
                    <p className="mt-2 text-sm font-medium text-foreground">{selectedRelation.foreignKeys.length} 个关系</p>
                  </div>
                  <div className="rounded-xl border border-border/70 bg-background/30 p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">被其他表引用</p>
                    <p className="mt-2 text-sm font-medium text-foreground">{selectedRelation.inboundReferences.length} 次</p>
                  </div>
                  <div className="rounded-xl border border-border/70 bg-background/30 p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">可空列</p>
                    <p className="mt-2 text-sm font-medium text-foreground">
                      {selectedRelation.columns.filter((column) => column.isNullable).length}
                    </p>
                  </div>
                </CardContent>
              </Card>

              <div className="grid gap-6 2xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.9fr)]">
                <Card className="border-border/80 bg-card/70">
                  <CardHeader className="gap-2">
                    <CardTitle className="text-base">字段结构</CardTitle>
                    <CardDescription>优先查看主键、外键和可直接暴露为数据属性的字段。</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>字段</TableHead>
                          <TableHead>类型</TableHead>
                          <TableHead>可空</TableHead>
                          <TableHead>约束</TableHead>
                          <TableHead>语义角色</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedRelation.columns.map((column) => {
                          const foreignKey = selectedRelation.foreignKeys.find((item) =>
                            item.from.columns.includes(column.name)
                          );
                          const isPrimaryKey = selectedRelation.primaryKeyColumns.includes(column.name);
                          const semanticRole = isPrimaryKey
                            ? '标识符'
                            : foreignKey
                              ? '关系键'
                              : '普通属性';

                          return (
                            <TableRow key={column.name}>
                              <TableCell className="font-mono text-xs">{column.name}</TableCell>
                              <TableCell className="text-muted-foreground">{column.datatype}</TableCell>
                              <TableCell>{column.isNullable ? 'YES' : 'NO'}</TableCell>
                              <TableCell>
                                <div className="flex flex-wrap gap-2">
                                  {isPrimaryKey && (
                                    <Badge variant="outline" className="border-amber-500/30 text-amber-500">
                                      <KeyRound className="mr-1 h-3 w-3" />
                                      PK
                                    </Badge>
                                  )}
                                  {foreignKey && (
                                    <Badge variant="outline">
                                      <Link2 className="mr-1 h-3 w-3" />
                                      FK → {foreignKey.to.relation.join('.')}
                                    </Badge>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="text-muted-foreground">{semanticRole}</TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>

                <div className="space-y-6">
                  <Card className="border-border/80 bg-card/70">
                    <CardHeader className="gap-2">
                      <CardTitle className="text-base">局部 Bootstrap</CardTitle>
                      <CardDescription>从选中的表出发预览依赖闭包，再生成独立版本目录。</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4 text-sm">
                      <div className="rounded-xl border border-border/70 bg-background/30 p-4">
                        <div className="flex items-center justify-between gap-4">
                          <div>
                            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">自动补依赖</p>
                            <p className="mt-2 text-sm text-foreground">根据外键补齐目标表，避免对象关系断裂。</p>
                          </div>
                          <Switch checked={includeDependencies} onCheckedChange={setIncludeDependencies} />
                        </div>
                      </div>

                      <div className="rounded-xl border border-border/70 bg-background/30 p-4">
                        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">已选表</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {selectedTables.length > 0 ? (
                            selectedTables.map((tableName) => (
                              <Badge key={tableName} variant="secondary">{tableName}</Badge>
                            ))
                          ) : (
                            <span className="text-muted-foreground">尚未选择表</span>
                          )}
                        </div>
                      </div>

                      <div className="grid gap-3 md:grid-cols-2">
                        <Button variant="outline" onClick={handlePreviewPartialBootstrap} disabled={previewLoading || selectedTables.length === 0}>
                          {previewLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                          预览局部 Bootstrap
                        </Button>
                        <Button onClick={handleGeneratePartialBootstrap} disabled={generatingPartial || selectedTables.length === 0}>
                          {generatingPartial ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <WandSparkles className="mr-2 h-4 w-4" />}
                          生成局部版本
                        </Button>
                      </div>

                      <div className="rounded-xl border border-border/70 bg-background/30 p-4">
                        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">当前表静态预览</p>
                        <p className="mt-2 font-medium text-foreground">{bootstrapPreview?.className}</p>
                        <p className="mt-2 break-all font-mono text-xs text-foreground">{bootstrapPreview?.uriTemplate}</p>
                      </div>

                      <div className="rounded-xl border border-border/70 bg-background/30 p-4">
                        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">当前表数据属性候选</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {bootstrapPreview?.propertyColumns.length ? (
                            bootstrapPreview.propertyColumns.map((columnName) => (
                              <Badge key={columnName} variant="secondary">{columnName}</Badge>
                            ))
                          ) : (
                            <span className="text-muted-foreground">无明显数据属性</span>
                          )}
                        </div>
                      </div>
                      <div className="rounded-xl border border-border/70 bg-background/30 p-4">
                        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">当前表对象属性候选</p>
                        <div className="mt-3 space-y-2">
                          {bootstrapPreview?.objectProperties.length ? (
                            bootstrapPreview.objectProperties.map((property) => (
                              <div key={property.name} className="flex items-center gap-2 text-muted-foreground">
                                <span className="font-mono text-xs text-foreground">{property.name}</span>
                                <ArrowRight className="h-3 w-3" />
                                <span className="text-xs">{property.targetTable}</span>
                              </div>
                            ))
                          ) : (
                            <span className="text-muted-foreground">未检测到可推断的对象关系</span>
                          )}
                        </div>
                      </div>

                      <div className="rounded-xl border border-border/70 bg-background/30 p-4">
                        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">局部预览结果</p>
                        {partialPreview ? (
                          <div className="mt-3 space-y-4">
                            <div>
                              <p className="mb-2 font-medium text-foreground">最终参与生成的表</p>
                              <div className="flex flex-wrap gap-2">
                                {partialPreview.resolved_tables.map((tableName) => (
                                  <Badge key={tableName} variant="secondary">{tableName}</Badge>
                                ))}
                              </div>
                            </div>
                            <div>
                              <p className="mb-2 font-medium text-foreground">自动补齐的依赖</p>
                              <div className="flex flex-wrap gap-2">
                                {partialPreview.added_dependencies.length > 0 ? (
                                  partialPreview.added_dependencies.map((tableName) => (
                                    <Badge key={tableName} variant="outline">{tableName}</Badge>
                                  ))
                                ) : (
                                  <span className="text-muted-foreground">没有新增依赖</span>
                                )}
                              </div>
                            </div>
                            <div>
                              <p className="mb-2 font-medium text-foreground">预计对象属性</p>
                              <div className="space-y-2">
                                {partialPreview.estimated_object_properties.length > 0 ? (
                                  partialPreview.estimated_object_properties.map((property) => (
                                    <div key={`${property.from}-${property.name}-${property.to}`} className="flex items-center gap-2 text-muted-foreground">
                                      <span className="text-xs text-foreground">{property.from}</span>
                                      <ArrowRight className="h-3 w-3" />
                                      <span className="font-mono text-xs text-foreground">{property.name}</span>
                                      <ArrowRight className="h-3 w-3" />
                                      <span className="text-xs">{property.to}</span>
                                    </div>
                                  ))
                                ) : (
                                  <span className="text-muted-foreground">本次预览未推断出对象属性</span>
                                )}
                              </div>
                            </div>
                            {partialPreview.warnings.length > 0 && (
                              <div>
                                <p className="mb-2 font-medium text-foreground">警告</p>
                                <ul className="space-y-2 text-muted-foreground">
                                  {partialPreview.warnings.map((warning) => (
                                    <li key={warning}>{warning}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        ) : (
                          <p className="mt-2 text-muted-foreground">先勾选表并点击“预览局部 Bootstrap”。</p>
                        )}
                      </div>

                      <div className="rounded-xl border border-border/70 bg-background/30 p-4">
                        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">最近生成结果</p>
                        {bootstrapResult ? (
                          <div className="mt-3 space-y-3">
                            <div className="flex items-center gap-2 text-emerald-500">
                              <CheckCircle2 className="h-4 w-4" />
                              <span className="text-sm font-medium">{bootstrapResult.version}</span>
                            </div>
                            <div className="space-y-2 text-xs text-muted-foreground">
                              <div>
                                <span className="font-medium text-foreground">Ontology:</span>{' '}
                                <code>{bootstrapResult.ontology_path}</code>
                              </div>
                              <div>
                                <span className="font-medium text-foreground">Mapping:</span>{' '}
                                <code>{bootstrapResult.mapping_path}</code>
                              </div>
                              <div>
                                <span className="font-medium text-foreground">Manifest:</span>{' '}
                                <code>{bootstrapResult.manifest_path}</code>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <p className="mt-2 text-muted-foreground">尚未生成局部版本。</p>
                        )}
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border-border/80 bg-card/70">
                    <CardHeader className="gap-2">
                      <CardTitle className="text-base">关系网络</CardTitle>
                      <CardDescription>重点看当前表的上下游依赖，判断语义连接是否足够清晰。</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4 text-sm">
                      <div className="rounded-xl border border-border/70 bg-background/30 p-4">
                        <p className="mb-3 flex items-center gap-2 font-medium text-foreground">
                          <Activity className="h-4 w-4 text-primary" />
                          当前表引用了谁
                        </p>
                        <div className="space-y-2">
                          {selectedRelation.foreignKeys.length > 0 ? (
                            selectedRelation.foreignKeys.map((foreignKey) => (
                              <div key={`${foreignKey.from.columns.join(',')}-${foreignKey.to.relation.join('.')}`} className="flex items-start justify-between gap-3 rounded-lg border border-border/60 px-3 py-2">
                                <span className="font-mono text-xs text-foreground">{foreignKey.from.columns.join(', ')}</span>
                                <span className="text-xs text-muted-foreground">
                                  {foreignKey.to.relation.join('.')} ({foreignKey.to.columns.join(', ')})
                                </span>
                              </div>
                            ))
                          ) : (
                            <p className="text-muted-foreground">当前表没有向外引用。</p>
                          )}
                        </div>
                      </div>

                      <div className="rounded-xl border border-border/70 bg-background/30 p-4">
                        <p className="mb-3 flex items-center gap-2 font-medium text-foreground">
                          <Activity className="h-4 w-4 text-primary" />
                          谁在引用当前表
                        </p>
                        <div className="space-y-2">
                          {selectedRelation.inboundReferences.length > 0 ? (
                            selectedRelation.inboundReferences.map((reference) => (
                              <div key={`${reference.fromTable}-${reference.fromColumns.join(',')}`} className="flex items-start justify-between gap-3 rounded-lg border border-border/60 px-3 py-2">
                                <span className="text-xs text-foreground">{reference.fromTable}</span>
                                <span className="text-xs text-muted-foreground">
                                  {reference.fromColumns.join(', ')} → {reference.toColumns.join(', ')}
                                </span>
                              </div>
                            ))
                          ) : (
                            <p className="text-muted-foreground">当前表暂时没有被其他表引用。</p>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
              </TabsContent>

              <TabsContent value="semantic" className="space-y-6">
                {selectedTables.length === 0 ? (
                  <div className="flex min-h-[420px] items-center justify-center rounded-xl border border-dashed border-border/70 bg-card/40">
                    <div className="text-center">
                      <Sparkles className="mx-auto mb-3 h-12 w-12 text-muted-foreground/60" />
                      <p className="text-sm text-muted-foreground">请先在左侧勾选需要建模的表。</p>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between">
                      <div>
                        <h2 className="text-lg font-semibold text-foreground">语义建模</h2>
                        <p className="text-sm text-muted-foreground">已选 {selectedTables.length} 张表，分析后可确认候选并生成本体。</p>
                      </div>
                      <div className="flex gap-3">
                        <Button variant="outline" onClick={handleSemanticAnalyze} disabled={analyzing || selectedTables.length === 0}>
                          {analyzing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                          语义分析
                        </Button>
                        <Button onClick={handleSemanticGenerate} disabled={generating || selectedTables.length === 0 || !semanticCandidates}>
                          {generating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <WandSparkles className="mr-2 h-4 w-4" />}
                          生成本体
                        </Button>
                      </div>
                    </div>

                    {!semanticCandidates ? (
                      <div className="flex min-h-[320px] items-center justify-center rounded-xl border border-dashed border-border/70 bg-card/40">
                        <div className="text-center">
                          <Database className="mx-auto mb-3 h-10 w-10 text-muted-foreground/60" />
                          <p className="text-sm text-muted-foreground">点击"语义分析"查看推断结果。</p>
                        </div>
                      </div>
                    ) : (
                      <>
                        <Card className="border-border/80 bg-card/70">
                          <CardHeader className="gap-2">
                            <CardTitle className="text-base">类候选</CardTitle>
                            <CardDescription>每张选中的表对应一个 OWL Class，类名由表名自动推断。</CardDescription>
                          </CardHeader>
                          <CardContent>
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>表名</TableHead>
                                  <TableHead>类名</TableHead>
                                  <TableHead>类 IRI</TableHead>
                                  <TableHead>状态</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {semanticCandidates.candidates.classes.map((cls) => (
                                  <TableRow key={cls.table_name}>
                                    <TableCell className="font-mono text-xs">{cls.table_name}</TableCell>
                                    <TableCell className="font-medium">{cls.class_name}</TableCell>
                                    <TableCell className="font-mono text-xs text-muted-foreground">{cls.class_iri}</TableCell>
                                    <TableCell>
                                      <Badge variant={cls.status === 'accepted' ? 'default' : 'secondary'}>{cls.status}</Badge>
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </CardContent>
                        </Card>

                        <Card className="border-border/80 bg-card/70">
                          <CardHeader className="gap-2">
                            <CardTitle className="text-base">数据属性候选</CardTitle>
                            <CardDescription>列到 OWL DataProperty 的映射，包含类型推断和语义标记。</CardDescription>
                          </CardHeader>
                          <CardContent>
                            <div className="max-h-[400px] overflow-auto">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>表</TableHead>
                                    <TableHead>列名</TableHead>
                                    <TableHead>属性名</TableHead>
                                    <TableHead>XSD 类型</TableHead>
                                    <TableHead>标记</TableHead>
                                    <TableHead>状态</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {semanticCandidates.candidates.data_properties.map((prop, idx) => (
                                    <TableRow key={`${prop.table_name}-${prop.column_name}-${idx}`}>
                                      <TableCell className="font-mono text-xs">{prop.table_name}</TableCell>
                                      <TableCell className="font-mono text-xs">{prop.column_name}</TableCell>
                                      <TableCell className="font-medium">{prop.property_name}</TableCell>
                                      <TableCell className="text-xs text-muted-foreground">{prop.datatype}</TableCell>
                                      <TableCell>
                                        <div className="flex flex-wrap gap-1">
                                          {prop.is_pk && (
                                            <Badge variant="outline" className="border-amber-500/30 text-amber-500 text-[10px]">
                                              <KeyRound className="mr-1 h-2.5 w-2.5" />PK
                                            </Badge>
                                          )}
                                          {prop.is_fk && (
                                            <Badge variant="outline" className="text-[10px]">
                                              <Link2 className="mr-1 h-2.5 w-2.5" />FK
                                            </Badge>
                                          )}
                                          {prop.is_label && (
                                            <Badge variant="outline" className="border-blue-500/30 text-blue-500 text-[10px]">label</Badge>
                                          )}
                                        </div>
                                      </TableCell>
                                      <TableCell>
                                        <Badge
                                          variant={
                                            prop.status === 'accepted' ? 'default'
                                            : prop.status === 'system' ? 'secondary'
                                            : 'outline'
                                          }
                                        >
                                          {prop.status}
                                        </Badge>
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                          </CardContent>
                        </Card>

                        <Card className="border-border/80 bg-card/70">
                          <CardHeader className="gap-2">
                            <CardTitle className="text-base">对象属性候选</CardTitle>
                            <CardDescription>外键关系映射为 OWL ObjectProperty。</CardDescription>
                          </CardHeader>
                          <CardContent>
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>源表</TableHead>
                                  <TableHead>属性名</TableHead>
                                  <TableHead>目标表</TableHead>
                                  <TableHead>FK 列</TableHead>
                                  <TableHead>状态</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {semanticCandidates.candidates.object_properties.length > 0 ? (
                                  semanticCandidates.candidates.object_properties.map((prop, idx) => (
                                    <TableRow key={`${prop.from_table}-${prop.property_name}-${idx}`}>
                                      <TableCell className="font-mono text-xs">{prop.from_table}</TableCell>
                                      <TableCell className="font-medium">{prop.property_name}</TableCell>
                                      <TableCell className="font-mono text-xs">{prop.to_table}</TableCell>
                                      <TableCell className="font-mono text-xs text-muted-foreground">
                                        {prop.fk_columns.join(', ')}
                                      </TableCell>
                                      <TableCell>
                                        <Badge
                                          variant={
                                            prop.status === 'accepted' ? 'default'
                                            : prop.status === 'external' ? 'outline'
                                            : 'secondary'
                                          }
                                        >
                                          {prop.status}
                                        </Badge>
                                      </TableCell>
                                    </TableRow>
                                  ))
                                ) : (
                                  <TableRow>
                                    <TableCell colSpan={5} className="text-center text-muted-foreground">
                                      未检测到对象属性
                                    </TableCell>
                                  </TableRow>
                                )}
                              </TableBody>
                            </Table>
                          </CardContent>
                        </Card>

                        {generateResult && (
                          <Card className="border-border/80 bg-card/70">
                            <CardHeader className="gap-2">
                              <CardTitle className="text-base">生成结果</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3">
                              <div className="flex items-center gap-2 text-emerald-500">
                                <CheckCircle2 className="h-4 w-4" />
                                <span className="text-sm font-medium">{generateResult.version}</span>
                              </div>
                              <div className="space-y-2 text-xs text-muted-foreground">
                                <div>
                                  <span className="font-medium text-foreground">Ontology:</span>{' '}
                                  <code>{generateResult.ontology_path}</code>
                                </div>
                                <div>
                                  <span className="font-medium text-foreground">Mapping:</span>{' '}
                                  <code>{generateResult.mapping_path}</code>
                                </div>
                                <div>
                                  <span className="font-medium text-foreground">Manifest:</span>{' '}
                                  <code>{generateResult.manifest_path}</code>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        )}
                      </>
                    )}
                  </>
                )}
              </TabsContent>
            </Tabs>
          )}
        </div>
      </div>
    </div>
  );
}
