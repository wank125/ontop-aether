'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  ChevronDown,
  ChevronRight,
  Database,
  Eye,
  KeyRound,
  Link2,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Server,
  Sparkles,
  Trash2,
  WandSparkles,
} from 'lucide-react';
import { datasources, type DataSource } from '@/lib/api';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';

const driverOptions = [
  { value: 'postgresql', label: 'PostgreSQL', className: 'org.postgresql.Driver' },
  { value: 'mysql', label: 'MySQL', className: 'com.mysql.cj.jdbc.Driver' },
  { value: 'oracle', label: 'Oracle', className: 'oracle.jdbc.OracleDriver' },
  { value: 'sqlserver', label: 'SQL Server', className: 'com.microsoft.sqlserver.jdbc.SQLServerDriver' },
];

type DataSourceStatus = 'connected' | 'error' | 'unknown';

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

interface SchemaGroup {
  schemaName: string;
  tables: CleanedRelation[];
}

interface CleanedRelation {
  tableName: string;
  schemaName: string;
  columns: Column[];
  foreignKeys: ForeignKey[];
  uniqueConstraints: UniqueConstraint[];
  primaryKeyColumns: string[];
}

interface DataSourceUI {
  id: string;
  name: string;
  jdbcUrl: string;
  username: string;
  driver: string;
  status: DataSourceStatus;
  schemaLoaded: boolean;
  bootstrapReady: boolean;
  lastMessage?: string;
  bootstrapPaths?: {
    ontologyPath: string;
    mappingPath: string;
    propertiesPath: string;
  };
}

function stripQuotes(value: string) {
  return value.replace(/"/g, '');
}

function cleanRelation(relation: Relation): CleanedRelation {
  const nameParts = relation.name.map(stripQuotes);
  const schemaName = nameParts.length >= 2 ? nameParts[nameParts.length - 2] : '(default)';
  const tableName = nameParts[nameParts.length - 1];
  const columns = (relation.columns ?? []).map((col) => ({
    ...col,
    name: stripQuotes(col.name ?? ''),
  }));
  const foreignKeys = (relation.foreignKeys ?? []).map((fk) => ({
    ...fk,
    from: { columns: (fk.from?.columns ?? []).map(stripQuotes) },
    to: {
      relation: (fk.to?.relation ?? []).map(stripQuotes),
      columns: (fk.to?.columns ?? []).map(stripQuotes),
    },
  }));
  const uniqueConstraints = relation.uniqueConstraints ?? [];
  const primaryKeyColumns =
    uniqueConstraints.find((uc) => uc.isPrimaryKey)?.determinants.map(stripQuotes) ?? [];
  return { tableName, schemaName, columns, foreignKeys, uniqueConstraints, primaryKeyColumns };
}

function groupBySchema(relations: Relation[]): SchemaGroup[] {
  const cleaned = relations.map(cleanRelation);
  const map = new Map<string, CleanedRelation[]>();
  for (const rel of cleaned) {
    const list = map.get(rel.schemaName) ?? [];
    list.push(rel);
    map.set(rel.schemaName, list);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([schemaName, tables]) => ({ schemaName, tables }));
}

function toUI(ds: DataSource): DataSourceUI {
  return {
    id: ds.id,
    name: ds.name,
    jdbcUrl: ds.jdbc_url,
    username: ds.user,
    driver: ds.driver,
    status: 'unknown',
    schemaLoaded: false,
    bootstrapReady: false,
  };
}

function getDriverLabel(driverClassName: string) {
  return driverOptions.find((option) => option.className === driverClassName)?.label ?? driverClassName;
}

function getDriverTone(driverClassName: string) {
  const label = getDriverLabel(driverClassName).toLowerCase();
  if (label.includes('postgres')) return 'border-sky-500/30 bg-sky-500/10 text-sky-500';
  if (label.includes('mysql')) return 'border-orange-500/30 bg-orange-500/10 text-orange-500';
  if (label.includes('sql server')) return 'border-cyan-500/30 bg-cyan-500/10 text-cyan-500';
  if (label.includes('oracle')) return 'border-rose-500/30 bg-rose-500/10 text-rose-500';
  return 'border-border bg-muted text-muted-foreground';
}

function formatHost(jdbcUrl: string) {
  const match = jdbcUrl.match(/jdbc:[^:]+:\/\/([^/?]+)/i);
  return match?.[1] ?? '未识别';
}

function formatDatabaseName(jdbcUrl: string) {
  const match = jdbcUrl.match(/jdbc:[^:]+:\/\/[^/]+\/([^?;]+)/i);
  return match?.[1] ?? '未识别';
}

export default function DataSourcePage() {
  const [dataSources, setDataSources] = useState<DataSourceUI[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newDataSource, setNewDataSource] = useState({
    name: '',
    jdbcUrl: '',
    username: '',
    password: '',
    driver: 'postgresql',
  });
  const [testingId, setTestingId] = useState<string | null>(null);
  const [bootstrapingId, setBootstrapingId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [schemaData, setSchemaData] = useState<DbSchema | null>(null);
  const [schemaLoading, setSchemaLoading] = useState(false);
  const [selectedTableName, setSelectedTableName] = useState<string | null>(null);
  const [checkedTables, setCheckedTables] = useState<string[]>([]);
  const [includeDependencies, setIncludeDependencies] = useState(true);
  const [schemaTreeSearch, setSchemaTreeSearch] = useState('');
  const [openSchemas, setOpenSchemas] = useState<Set<string>>(new Set());
  const [bootstrapMode, setBootstrapMode] = useState<'full' | 'partial'>('full');
  const updateNewDataSource = (
    field: 'name' | 'jdbcUrl' | 'username' | 'password' | 'driver',
    value: string
  ) => {
    setNewDataSource((current) => ({ ...current, [field]: value }));
  };

  const loadSources = async () => {
    setLoading(true);
    try {
      const list = await datasources.list();
      const nextDataSources = list.map(toUI);
      setDataSources((previous) =>
        nextDataSources.map((nextItem) => {
          const previousItem = previous.find((item) => item.id === nextItem.id);
          return previousItem
            ? {
                ...nextItem,
                status: previousItem.status,
                schemaLoaded: previousItem.schemaLoaded,
                bootstrapReady: previousItem.bootstrapReady,
                lastMessage: previousItem.lastMessage,
                bootstrapPaths: previousItem.bootstrapPaths,
              }
            : nextItem;
        })
      );
      if (list.length > 0) {
        setActiveId((current) => current ?? list[0].id);
      }
    } catch {
      setDataSources([]);
      toast.error('加载数据源失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSources();
  }, []);

  const checkLatestBootstrap = async (id: string) => {
    try {
      const result = await datasources.getLatestBootstrap(id);
      if (result) {
        setDataSources((previous) =>
          previous.map((item) =>
            item.id === id
              ? {
                  ...item,
                  bootstrapReady: true,
                  bootstrapPaths: {
                    ontologyPath: result.ontology_path,
                    mappingPath: result.mapping_path,
                    propertiesPath: result.properties_path,
                  },
                }
              : item
          )
        );
      } else {
        setDataSources((previous) =>
          previous.map((item) =>
            item.id === id
              ? { ...item, bootstrapReady: false, bootstrapPaths: undefined }
              : item
          )
        );
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (activeId) {
      checkLatestBootstrap(activeId);
    }
  }, [activeId]);

  const filteredDataSources = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return dataSources;
    return dataSources.filter((dataSource) => {
      return (
        dataSource.name.toLowerCase().includes(query) ||
        dataSource.jdbcUrl.toLowerCase().includes(query) ||
        dataSource.username.toLowerCase().includes(query)
      );
    });
  }, [dataSources, searchQuery]);

  useEffect(() => {
    if (filteredDataSources.length === 0) {
      setActiveId(null);
      return;
    }
    setActiveId((current) => {
      if (current && filteredDataSources.some((item) => item.id === current)) return current;
      return filteredDataSources[0].id;
    });
  }, [filteredDataSources]);

  const activeSource = filteredDataSources.find((item) => item.id === activeId) ?? null;

  const handleAddDataSource = async () => {
    const driver = driverOptions.find((option) => option.value === newDataSource.driver);
    try {
      const created = await datasources.create({
        name: newDataSource.name,
        jdbc_url: newDataSource.jdbcUrl,
        user: newDataSource.username,
        password: newDataSource.password,
        driver: driver?.className || '',
      });

      setDataSources((previous) => [...previous, toUI(created)]);
      setIsAddDialogOpen(false);
      setActiveId(created.id);
      setNewDataSource({ name: '', jdbcUrl: '', username: '', password: '', driver: 'postgresql' });
      toast.success('数据源已创建');
    } catch (error: any) {
      toast.error(error.message || '添加数据源失败');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await datasources.delete(id);
      setDataSources((previous) => previous.filter((item) => item.id !== id));
      toast.success('数据源已删除');
    } catch (error: any) {
      toast.error(error.message || '删除数据源失败');
    }
  };

  const handleTest = async (id: string) => {
    setTestingId(id);
    try {
      const result = await datasources.test(id);
      setDataSources((previous) =>
        previous.map((item) =>
          item.id === id
            ? {
                ...item,
                status: result.connected ? 'connected' : 'error',
                lastMessage: result.message,
              }
            : item
        )
      );
      if (result.connected) {
        toast.success('连接测试通过');
      } else {
        toast.error(result.message || '连接测试失败');
      }
    } catch (error: any) {
      setDataSources((previous) =>
        previous.map((item) =>
          item.id === id ? { ...item, status: 'error', lastMessage: error.message } : item
        )
      );
      toast.error(error.message || '连接测试失败');
    } finally {
      setTestingId(null);
    }
  };

  const handleLoadSchema = async (id: string) => {
    setSchemaLoading(true);
    try {
      const data = await datasources.schema(id);
      setSchemaData(data as DbSchema);
      const groups = groupBySchema((data as DbSchema).relations ?? []);
      setOpenSchemas(new Set(groups.map((g) => g.schemaName)));
      setDataSources((previous) =>
        previous.map((item) =>
          item.id === id
            ? {
                ...item,
                schemaLoaded: true,
                lastMessage: '结构已成功探测，可在下方查看 Schema 树。',
              }
            : item
        )
      );
      toast.success(`结构探测完成，共 ${((data as DbSchema).relations ?? []).length} 张表`);
    } catch (error: any) {
      toast.error(error.message || '结构探测失败');
    } finally {
      setSchemaLoading(false);
    }
  };

  const handleBootstrap = async (id: string) => {
    setBootstrapingId(id);
    const isPartial = bootstrapMode === 'partial' && checkedTables.length > 0;
    try {
      const result = await datasources.bootstrap(id, {
        base_iri: 'http://example.com/ontop/',
        mode: isPartial ? 'partial' : 'full',
        tables: isPartial ? checkedTables : [],
        include_dependencies: isPartial ? includeDependencies : true,
      });
      setDataSources((previous) =>
        previous.map((item) =>
          item.id === id
            ? {
                ...item,
                bootstrapReady: true,
                bootstrapPaths: {
                  ontologyPath: result.ontology_path,
                  mappingPath: result.mapping_path,
                  propertiesPath: result.properties_path,
                },
                lastMessage: `Bootstrap 已完成 (${isPartial ? 'partial' : 'full'})，本体和映射文件已生成。`,
              }
            : item
        )
      );
      toast.success(`Bootstrap 成功 (${isPartial ? `选中 ${checkedTables.length} 张表` : '全量'})`);
    } catch (error: any) {
      toast.error(error.message || 'Bootstrap 失败');
    } finally {
      setBootstrapingId(null);
    }
  };

  const connectedCount = dataSources.filter((item) => item.status === 'connected').length;
  const errorCount = dataSources.filter((item) => item.status === 'error').length;
  const schemaCount = dataSources.filter((item) => item.schemaLoaded).length;
  const bootstrapCount = dataSources.filter((item) => item.bootstrapReady).length;

  // Schema tree data
  const schemaGroups = useMemo(() => {
    if (!schemaData) return [];
    const groups = groupBySchema(schemaData.relations ?? []);
    if (!schemaTreeSearch.trim()) return groups;
    const query = schemaTreeSearch.toLowerCase();
    return groups
      .map((group) => ({
        ...group,
        tables: group.tables.filter(
          (table) =>
            table.tableName.toLowerCase().includes(query) ||
            table.columns.some((col) => col.name.toLowerCase().includes(query))
        ),
      }))
      .filter((group) => group.tables.length > 0);
  }, [schemaData, schemaTreeSearch]);

  const selectedRelation = useMemo(() => {
    if (!selectedTableName || !schemaData) return null;
    const groups = groupBySchema(schemaData.relations ?? []);
    for (const group of groups) {
      const found = group.tables.find((t) => t.tableName === selectedTableName);
      if (found) return found;
    }
    return null;
  }, [schemaData, selectedTableName]);

  const toggleTableCheck = (tableName: string, checked: boolean) => {
    setCheckedTables((prev) =>
      checked ? [...new Set([...prev, tableName])] : prev.filter((n) => n !== tableName)
    );
    // Auto switch to partial mode when tables are selected
    if (checked) setBootstrapMode('partial');
  };

  const toggleSchemaCheck = (schemaName: string, checked: boolean, tableNames: string[]) => {
    setCheckedTables((prev) => {
      const others = prev.filter((n) => !tableNames.includes(n));
      return checked ? [...others, ...tableNames] : others;
    });
    if (checked) setBootstrapMode('partial');
  };

  const toggleAllCheck = (checked: boolean) => {
    if (!schemaData) return;
    const allTables = groupBySchema(schemaData.relations ?? []).flatMap((g) => g.tables.map((t) => t.tableName));
    setCheckedTables(checked ? allTables : []);
    if (checked) setBootstrapMode('partial');
    else setBootstrapMode('full');
  };

  const toggleSchemaOpen = (schemaName: string) => {
    setOpenSchemas((prev) => {
      const next = new Set(prev);
      if (next.has(schemaName)) next.delete(schemaName);
      else next.add(schemaName);
      return next;
    });
  };

  return (
    <>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 border-b border-border pb-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-[oklch(0.70_0.15_280)] to-[oklch(0.65_0.18_200)]">
              <Database className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-foreground">数据源管理</h1>
              <p className="text-sm text-muted-foreground">把数据库连接、结构探测和 Bootstrap 串成一条工作流。</p>
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Button variant="outline" onClick={loadSources} disabled={loading}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              刷新列表
            </Button>

            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
              <DialogTrigger asChild>
                <Button className="bg-gradient-to-r from-[oklch(0.70_0.15_280)] to-[oklch(0.65_0.18_200)] hover:opacity-90">
                  <Plus className="mr-2 h-4 w-4" />
                  添加数据源
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[520px]">
                <DialogHeader>
                  <DialogTitle>添加数据源</DialogTitle>
                </DialogHeader>
                <form
                  className="grid gap-4 py-4"
                  autoComplete="off"
                  onSubmit={(event) => {
                    event.preventDefault();
                    handleAddDataSource();
                  }}
                >
                  <div className="grid gap-2">
                    <Label htmlFor="name">数据源名称</Label>
                    <Input
                      id="name"
                      name="datasource-name"
                      autoComplete="off"
                      value={newDataSource.name}
                      onChange={(event) => updateNewDataSource('name', event.target.value)}
                      placeholder="例如: Retail PostgreSQL"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="driver">数据库类型</Label>
                    <Select
                      value={newDataSource.driver}
                      onValueChange={(value) => updateNewDataSource('driver', value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="选择数据库类型" />
                      </SelectTrigger>
                      <SelectContent>
                        {driverOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="jdbcUrl">JDBC URL</Label>
                    <Input
                      id="jdbcUrl"
                      name="datasource-jdbc-url"
                      autoComplete="off"
                      value={newDataSource.jdbcUrl}
                      onChange={(event) => updateNewDataSource('jdbcUrl', event.target.value)}
                      placeholder="jdbc:postgresql://localhost:5432/mydb"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="username">用户名</Label>
                      <Input
                        id="username"
                        name="datasource-username"
                        autoComplete="username"
                        value={newDataSource.username}
                        onChange={(event) => updateNewDataSource('username', event.target.value)}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="password">密码</Label>
                      <Input
                        id="password"
                        name="datasource-password"
                        autoComplete="new-password"
                        type="password"
                        value={newDataSource.password}
                        onChange={(event) => updateNewDataSource('password', event.target.value)}
                      />
                    </div>
                  </div>
                </form>
                <div className="flex justify-end gap-3">
                  <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                    取消
                  </Button>
                  <Button onClick={handleAddDataSource}>创建</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card className="border-border/80 bg-card/70">
            <CardHeader className="gap-1">
              <CardDescription>数据源总数</CardDescription>
              <CardTitle className="text-lg">{dataSources.length}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">当前工程可用连接</CardContent>
          </Card>
          <Card className="border-border/80 bg-card/70">
            <CardHeader className="gap-1">
              <CardDescription>连接正常</CardDescription>
              <CardTitle className="text-lg">{connectedCount}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">已通过连接测试</CardContent>
          </Card>
          <Card className="border-border/80 bg-card/70">
            <CardHeader className="gap-1">
              <CardDescription>结构已探测</CardDescription>
              <CardTitle className="text-lg">{schemaCount}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">可进入数据库概览</CardContent>
          </Card>
          <Card className="border-border/80 bg-card/70">
            <CardHeader className="gap-1">
              <CardDescription>Bootstrap 完成</CardDescription>
              <CardTitle className="text-lg">{bootstrapCount}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">已生成本体和映射文件</CardContent>
          </Card>
        </div>

        <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
          <div className="space-y-6">
            <Card className="border-border/80 bg-card/70">
              <CardHeader className="gap-2">
                <CardTitle className="text-base">连接清单</CardTitle>
                <CardDescription>先选一个数据源，再执行探测、查看和 Bootstrap。</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="搜索名称、URL 或用户名..."
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    className="pl-9"
                  />
                </div>

                {loading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : filteredDataSources.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border/70 px-4 py-10 text-center text-sm text-muted-foreground">
                    未找到匹配的数据源
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredDataSources.map((dataSource) => {
                      const isActive = dataSource.id === activeId;
                      return (
                        <button
                          key={dataSource.id}
                          type="button"
                          onClick={() => setActiveId(dataSource.id)}
                          className={[
                            'w-full rounded-xl border p-4 text-left transition-colors',
                            isActive
                              ? 'border-primary/60 bg-primary/10'
                              : 'border-border/80 bg-background/30 hover:bg-muted/40',
                          ].join(' ')}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-medium text-foreground">{dataSource.name}</p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {formatHost(dataSource.jdbcUrl)} · {formatDatabaseName(dataSource.jdbcUrl)}
                              </p>
                            </div>
                            <Badge variant="outline" className={getDriverTone(dataSource.driver)}>
                              {getDriverLabel(dataSource.driver)}
                            </Badge>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2 text-xs">
                            <Badge
                              variant="outline"
                              className={
                                dataSource.status === 'connected'
                                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500'
                                  : dataSource.status === 'error'
                                    ? 'border-destructive/30 bg-destructive/10 text-destructive'
                                    : 'border-border bg-muted text-muted-foreground'
                              }
                            >
                              {dataSource.status === 'connected'
                                ? '连接正常'
                                : dataSource.status === 'error'
                                  ? '连接异常'
                                  : '待检测'}
                            </Badge>
                            {dataSource.schemaLoaded && <Badge variant="secondary">结构已探测</Badge>}
                            {dataSource.bootstrapReady && <Badge variant="secondary">Bootstrap 完成</Badge>}
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
                <CardTitle className="text-base">流程状态</CardTitle>
                <CardDescription>用这 4 个阶段判断当前连接走到了哪一步。</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex items-center justify-between rounded-lg border border-border/70 bg-background/30 px-3 py-2">
                  <span className="text-muted-foreground">待测试</span>
                  <span className="font-medium text-foreground">{dataSources.filter((item) => item.status === 'unknown').length}</span>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-border/70 bg-background/30 px-3 py-2">
                  <span className="text-muted-foreground">连接异常</span>
                  <span className="font-medium text-foreground">{errorCount}</span>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-border/70 bg-background/30 px-3 py-2">
                  <span className="text-muted-foreground">可进入数据库概览</span>
                  <span className="font-medium text-foreground">{schemaCount}</span>
                </div>
                <div className="rounded-lg border border-border/70 bg-background/30 p-3">
                  <p className="mb-2 flex items-center gap-2 font-medium text-foreground">
                    <Sparkles className="h-4 w-4 text-primary" />
                    操作建议
                  </p>
                  <ul className="space-y-2 text-muted-foreground">
                    <li>先做连接测试，再进入数据库概览确认主键和外键质量。</li>
                    <li>结构确认没问题后再做 Bootstrap，避免生成一套质量较差的初始映射。</li>
                    <li>Bootstrap 完成后可直接进入映射编辑和本体可视化继续加工。</li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            {!activeSource ? (
              <div className="flex min-h-[420px] items-center justify-center rounded-xl border border-dashed border-border/70 bg-card/40">
                <div className="text-center">
                  <Database className="mx-auto mb-3 h-12 w-12 text-muted-foreground/60" />
                  <p className="text-sm text-muted-foreground">选择一个数据源开始操作。</p>
                </div>
              </div>
            ) : (
              <>
                <Card className="border-border/80 bg-card/70">
                  <CardHeader className="gap-2">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <CardTitle className="text-xl">{activeSource.name}</CardTitle>
                        <CardDescription className="mt-1">
                          这是当前的主工作连接，后续结构探测、Bootstrap 和映射编辑都围绕它展开。
                        </CardDescription>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="outline" className={getDriverTone(activeSource.driver)}>
                          {getDriverLabel(activeSource.driver)}
                        </Badge>
                        <Badge variant="outline">{activeSource.username}</Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-xl border border-border/70 bg-background/30 p-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">主机</p>
                      <p className="mt-2 text-sm font-medium text-foreground">{formatHost(activeSource.jdbcUrl)}</p>
                    </div>
                    <div className="rounded-xl border border-border/70 bg-background/30 p-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">数据库</p>
                      <p className="mt-2 text-sm font-medium text-foreground">{formatDatabaseName(activeSource.jdbcUrl)}</p>
                    </div>
                    <div className="rounded-xl border border-border/70 bg-background/30 p-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">连接状态</p>
                      <p className="mt-2 text-sm font-medium text-foreground">
                        {activeSource.status === 'connected'
                          ? '正常'
                          : activeSource.status === 'error'
                            ? '异常'
                            : '待检测'}
                      </p>
                    </div>
                    <div className="rounded-xl border border-border/70 bg-background/30 p-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">当前阶段</p>
                      <p className="mt-2 text-sm font-medium text-foreground">
                        {activeSource.bootstrapReady
                          ? '已可查询'
                          : activeSource.schemaLoaded
                            ? '可 Bootstrap'
                            : activeSource.status === 'connected'
                              ? '可探测结构'
                              : '待验证'}
                      </p>
                    </div>
                  </CardContent>
                </Card>

                <div className="grid gap-6 2xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.9fr)]">
                  <Card className="border-border/80 bg-card/70">
                    <CardHeader className="gap-2">
                      <CardTitle className="text-base">主操作</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                        <Button variant="outline" className="justify-start" onClick={() => handleTest(activeSource.id)} disabled={testingId === activeSource.id}>
                          {testingId === activeSource.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Server className="mr-2 h-4 w-4" />}
                          测试连接
                        </Button>
                        <Button variant="outline" className="justify-start" onClick={() => handleLoadSchema(activeSource.id)} disabled={schemaLoading}>
                          {schemaLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Eye className="mr-2 h-4 w-4" />}
                          探测结构
                        </Button>
                        <Button
                          className="justify-start bg-gradient-to-r from-[oklch(0.70_0.15_280)] to-[oklch(0.65_0.18_200)] hover:opacity-90"
                          onClick={() => handleBootstrap(activeSource.id)}
                          disabled={bootstrapingId === activeSource.id}
                        >
                          {bootstrapingId === activeSource.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <WandSparkles className="mr-2 h-4 w-4" />}
                          {bootstrapMode === 'partial' && checkedTables.length > 0 ? `Bootstrap (${checkedTables.length} 表)` : 'Bootstrap'}
                        </Button>
                        <Button variant="outline" className="justify-start text-destructive" onClick={() => handleDelete(activeSource.id)}>
                          <Trash2 className="mr-2 h-4 w-4" />
                          删除
                        </Button>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border-border/80 bg-card/70">
                    <CardHeader className="gap-2">
                      <CardTitle className="text-base">Bootstrap 产物</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm">
                      {activeSource.bootstrapPaths ? (
                        <>
                          <div className="rounded-lg border border-border/70 bg-background/30 p-3">
                            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Ontology</p>
                            <code className="mt-2 block break-all text-xs text-foreground">{activeSource.bootstrapPaths.ontologyPath}</code>
                          </div>
                          <div className="rounded-lg border border-border/70 bg-background/30 p-3">
                            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Mapping</p>
                            <code className="mt-2 block break-all text-xs text-foreground">{activeSource.bootstrapPaths.mappingPath}</code>
                          </div>
                          <div className="rounded-lg border border-border/70 bg-background/30 p-3">
                            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Properties</p>
                            <code className="mt-2 block break-all text-xs text-foreground">{activeSource.bootstrapPaths.propertiesPath}</code>
                          </div>
                        </>
                      ) : (
                        <div className="rounded-lg border border-dashed border-border/70 px-4 py-8 text-center text-sm text-muted-foreground">
                          尚未生成 Bootstrap 产物
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>

                {/* Schema Loading */}
                {schemaLoading && (
                  <div className="flex items-center justify-center rounded-xl border border-border/70 bg-card/60 py-12">
                    <Loader2 className="mr-2 h-5 w-5 animate-spin text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">正在探测结构...</span>
                  </div>
                )}

                {/* Schema Tree + Table Detail */}
                {schemaData && !schemaLoading && (
                  <div className="grid gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
                    {/* Schema Tree */}
                    <Card className="border-border/80 bg-card/70">
                      <CardHeader className="gap-2">
                        <div className="flex items-center justify-between">
                          <div>
                            <CardTitle className="text-base">Schema 树</CardTitle>
                            <CardDescription>
                              共 {schemaGroups.reduce((sum, g) => sum + g.tables.length, 0)} 张表，已选 {checkedTables.length} 张
                            </CardDescription>
                          </div>
                          <div className="flex gap-2">
                            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => toggleAllCheck(true)}>全选</Button>
                            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => toggleAllCheck(false)}>清空</Button>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                          <Input placeholder="搜索表名或字段..." value={schemaTreeSearch} onChange={(e) => setSchemaTreeSearch(e.target.value)} className="pl-9" />
                        </div>

                        {schemaGroups.length === 0 ? (
                          <div className="rounded-lg border border-dashed border-border/70 px-4 py-8 text-center text-sm text-muted-foreground">
                            没有匹配的表
                          </div>
                        ) : (
                          <div className="max-h-[520px] space-y-2 overflow-y-auto">
                            {schemaGroups.map((group) => {
                              const isOpen = openSchemas.has(group.schemaName);
                              const schemaTableNames = group.tables.map((t) => t.tableName);
                              const allChecked = schemaTableNames.length > 0 && schemaTableNames.every((n) => checkedTables.includes(n));
                              const someChecked = schemaTableNames.some((n) => checkedTables.includes(n));
                              return (
                                <Collapsible key={group.schemaName} open={isOpen} onOpenChange={() => toggleSchemaOpen(group.schemaName)}>
                                  <div className="rounded-lg border border-border/70 bg-background/30">
                                    <div className="flex items-center gap-2 px-3 py-2">
                                      <CollapsibleTrigger asChild>
                                        <button type="button" className="flex items-center gap-1">
                                          {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                                        </button>
                                      </CollapsibleTrigger>
                                      <Checkbox
                                        checked={allChecked ? true : someChecked ? 'indeterminate' : false}
                                        onCheckedChange={(checked) => toggleSchemaCheck(group.schemaName, checked === true, schemaTableNames)}
                                        onClick={(e) => e.stopPropagation()}
                                      />
                                      <span className="flex-1 text-sm font-medium text-foreground">{group.schemaName}</span>
                                      <Badge variant="secondary">{group.tables.length} 表</Badge>
                                    </div>
                                    <CollapsibleContent>
                                      <div className="border-t border-border/50 px-3 py-2">
                                        {group.tables.map((table) => {
                                          const isChecked = checkedTables.includes(table.tableName);
                                          const isSelected = selectedTableName === table.tableName;
                                          return (
                                            <div
                                              key={table.tableName}
                                              className={[
                                                'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors cursor-pointer',
                                                isSelected
                                                  ? 'bg-primary/10 text-foreground'
                                                  : 'hover:bg-muted/40 text-muted-foreground hover:text-foreground',
                                              ].join(' ')}
                                              onClick={() => setSelectedTableName(table.tableName)}
                                            >
                                              <Checkbox
                                                checked={isChecked}
                                                onCheckedChange={(checked) => toggleTableCheck(table.tableName, checked === true)}
                                                onClick={(e) => e.stopPropagation()}
                                                className="shrink-0"
                                              />
                                              <span className="flex-1 truncate font-mono text-xs">{table.tableName}</span>
                                              <span className="shrink-0 text-[10px] text-muted-foreground">
                                                {table.columns.length}列{table.foreignKeys.length > 0 ? ` · ${table.foreignKeys.length}FK` : ''}
                                              </span>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </CollapsibleContent>
                                  </div>
                                </Collapsible>
                              );
                            })}
                          </div>
                        )}

                        {checkedTables.length > 0 && (
                          <div className="space-y-3 rounded-lg border border-border/70 bg-background/30 p-3">
                            <div className="flex items-center justify-between gap-4">
                              <p className="text-xs text-muted-foreground">自动补依赖（根据外键补齐目标表）</p>
                              <Switch checked={includeDependencies} onCheckedChange={setIncludeDependencies} />
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {checkedTables.map((name) => (
                                <Badge key={name} variant="secondary" className="text-xs">{name}</Badge>
                              ))}
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    {/* Table Detail */}
                    <Card className="border-border/80 bg-card/70">
                      <CardHeader className="gap-2">
                        <CardTitle className="text-base">{selectedRelation ? selectedRelation.tableName : '表详情'}</CardTitle>
                        <CardDescription>
                          {selectedRelation
                            ? `${selectedRelation.schemaName} · ${selectedRelation.columns.length} 列 · ${selectedRelation.foreignKeys.length} 外键`
                            : '点击左侧表名查看详情'}
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        {!selectedRelation ? (
                          <div className="flex min-h-[280px] items-center justify-center text-sm text-muted-foreground">
                            从 Schema 树中选择一张表查看详情
                          </div>
                        ) : (
                          <div className="space-y-4">
                            <div className="flex flex-wrap gap-2">
                              {selectedRelation.primaryKeyColumns.length > 0 ? (
                                <Badge variant="outline" className="border-amber-500/30 text-amber-500">
                                  <KeyRound className="mr-1 h-3 w-3" />
                                  PK: {selectedRelation.primaryKeyColumns.join(', ')}
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="border-destructive/30 text-destructive">无主键</Badge>
                              )}
                              {selectedRelation.foreignKeys.map((fk, idx) => (
                                <Badge key={idx} variant="outline">
                                  <Link2 className="mr-1 h-3 w-3" />
                                  {fk.from.columns.join(', ')} → {fk.to.relation.join('.')}
                                </Badge>
                              ))}
                            </div>

                            <div className="max-h-[400px] overflow-auto rounded-lg border border-border/70">
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="border-b border-border/70 bg-muted/30">
                                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">字段</th>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">类型</th>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">可空</th>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">约束</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {selectedRelation.columns.map((col) => {
                                    const isPK = selectedRelation.primaryKeyColumns.includes(col.name);
                                    const fk = selectedRelation.foreignKeys.find((f) => f.from.columns.includes(col.name));
                                    return (
                                      <tr key={col.name} className="border-b border-border/40 last:border-0">
                                        <td className="px-3 py-1.5 font-mono text-xs">{col.name}</td>
                                        <td className="px-3 py-1.5 text-xs text-muted-foreground">{col.datatype}</td>
                                        <td className="px-3 py-1.5 text-xs">{col.isNullable ? 'YES' : 'NO'}</td>
                                        <td className="px-3 py-1.5">
                                          <div className="flex gap-1">
                                            {isPK && (
                                              <Badge variant="outline" className="border-amber-500/30 text-amber-500 px-1 py-0 text-[10px]">PK</Badge>
                                            )}
                                            {fk && (
                                              <Badge variant="outline" className="px-1 py-0 text-[10px]">FK→{fk.to.relation.join('.')}</Badge>
                                            )}
                                          </div>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                )}

              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
