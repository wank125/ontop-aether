'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Clock,
  Code2,
  Copy,
  Check,
  Sparkles,
  AlertCircle,
  Play,
  Database,
  Eye,
  History,
  TimerReset,
} from 'lucide-react';
import { ai, sparql, type OntologySummary, type QueryHistoryEntry } from '@/lib/api';

interface QueryHistory {
  id: string;
  query: string;
  timestamp: string;
  resultCount: number;
}

interface ExampleQuery {
  label: string;
  query: string;
}

const standardPrefixes = new Set(['rdf', 'rdfs', 'owl', 'xsd', 'obda']);

function buildExampleQueries(summary: OntologySummary): ExampleQuery[] {
  const prefix = Object.keys(summary.prefixes).find((key) => !standardPrefixes.has(key)) || 'cls';
  const prefixUri = summary.prefixes[prefix] || 'http://example.com/ontology/';
  const hasClass = (name: string) => summary.classes.includes(name);
  const hasProp = (name: string) => summary.data_properties.includes(name);
  const examples: ExampleQuery[] = [];

  if (hasClass('PropertyProject') && hasProp('projectName') && hasProp('region')) {
    examples.push({
      label: '项目列表',
      query: `PREFIX ${prefix}: <${prefixUri}>
SELECT ?project ?name ?region WHERE {
  ?project a ${prefix}:PropertyProject ;
           ${prefix}:projectName ?name ;
           ${prefix}:region ?region .
}
LIMIT 20`,
    });
  }

  if (hasClass('SpaceUnit') && hasProp('billingArea') && hasProp('buildingArea')) {
    examples.push({
      label: '空间单元',
      query: `PREFIX ${prefix}: <${prefixUri}>
SELECT ?space ?billingArea ?buildingArea WHERE {
  ?space a ${prefix}:SpaceUnit ;
         ${prefix}:billingArea ?billingArea ;
         ${prefix}:buildingArea ?buildingArea .
}
LIMIT 20`,
    });
  }

  if (hasClass('Bill') && hasProp('amountDue') && hasProp('billStatus')) {
    examples.push({
      label: '账单状态',
      query: `PREFIX ${prefix}: <${prefixUri}>
SELECT ?bill ?amountDue ?status WHERE {
  ?bill a ${prefix}:Bill ;
        ${prefix}:amountDue ?amountDue ;
        ${prefix}:billStatus ?status .
}
LIMIT 20`,
    });
  }

  if (hasClass('WorkOrder') && hasProp('orderType') && hasProp('serviceFee')) {
    examples.push({
      label: '工单概览',
      query: `PREFIX ${prefix}: <${prefixUri}>
SELECT ?workOrder ?orderType ?serviceFee WHERE {
  ?workOrder a ${prefix}:WorkOrder ;
             ${prefix}:orderType ?orderType ;
             ${prefix}:serviceFee ?serviceFee .
}
LIMIT 20`,
    });
  }

  if (examples.length === 0 && summary.classes.length > 0) {
    const className = summary.classes[0];
    examples.push({
      label: `${className} 列表`,
      query: `PREFIX ${prefix}: <${prefixUri}>
SELECT ?entity WHERE {
  ?entity a ${prefix}:${className} .
}
LIMIT 20`,
    });
  }

  if (examples.length === 0) {
    examples.push({
      label: '全部实体',
      query: 'SELECT * WHERE { ?s ?p ?o } LIMIT 20',
    });
  }

  return examples;
}

function SummaryCard({
  title,
  value,
  hint,
  icon: Icon,
}: {
  title: string;
  value: string;
  hint: string;
  icon: typeof Code2;
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

export default function SPARQLPage() {
  const [exampleQueries, setExampleQueries] = useState<ExampleQuery[]>([{ label: '全部实体', query: 'SELECT * WHERE { ?s ?p ?o } LIMIT 20' }]);
  const [query, setQuery] = useState('SELECT * WHERE { ?s ?p ?o } LIMIT 20');
  const [isExecuting, setIsExecuting] = useState(false);
  const [columns, setColumns] = useState<string[]>([]);
  const [rows, setRows] = useState<Array<Record<string, string>>>([]);
  const [sqlText, setSqlText] = useState('');
  const [copied, setCopied] = useState(false);
  const [history, setHistory] = useState<QueryHistory[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [lastDurationMs, setLastDurationMs] = useState<number | null>(null);
  const [usedHistoryQuery, setUsedHistoryQuery] = useState(false);
  const [lastQueryFingerprint, setLastQueryFingerprint] = useState('SELECT * WHERE { ?s ?p ?o } LIMIT 20');
  const [activeResultTab, setActiveResultTab] = useState('results');
  const [sceneLabel, setSceneLabel] = useState('当前端点');

  useEffect(() => {
    void loadHistory();
    void loadContext();
  }, []);

  const loadContext = async () => {
    try {
      const [summary, endpoint] = await Promise.all([ai.ontologySummary(), sparql.endpointStatus()]);
      const nextExamples = buildExampleQueries(summary);
      setExampleQueries(nextExamples);
      setQuery((current) => (current.trim() === 'SELECT * WHERE { ?s ?p ?o } LIMIT 20' ? nextExamples[0].query : current));
      setLastQueryFingerprint((current) => (current.trim() === 'SELECT * WHERE { ?s ?p ?o } LIMIT 20' ? nextExamples[0].query.trim() : current));
      const mappingPath = endpoint.mapping_path.toLowerCase();
      if (mappingPath.includes('lvfa')) setSceneLabel('lvfa');
      else if (mappingPath.includes('retail')) setSceneLabel('retail');
      else setSceneLabel(endpoint.mapping_path.split('/').pop() || '当前端点');
    } catch {
      setExampleQueries([{ label: '全部实体', query: 'SELECT * WHERE { ?s ?p ?o } LIMIT 20' }]);
    }
  };

  const loadHistory = async () => {
    try {
      const entries = await sparql.history();
      setHistory(
        entries.map((entry: QueryHistoryEntry) => ({
          id: entry.id,
          query: entry.query,
          timestamp: new Date(entry.timestamp).toLocaleTimeString(),
          resultCount: entry.result_count ?? 0,
        }))
      );
    } catch {
      setHistory([]);
    }
  };

  const executeQuery = async () => {
    setIsExecuting(true);
    setError(null);
    const startedAt = performance.now();
    const fingerprint = query.trim();
    const historyHit = history.some((item) => item.query.trim() === fingerprint);

    try {
      const result = await sparql.query(query);
      const vars = result.head.vars;
      const bindings = result.results.bindings.map((binding) => {
        const row: Record<string, string> = {};
        for (const variable of vars) {
          row[variable] = binding[variable]?.value ?? '';
        }
        return row;
      });
      setColumns(vars);
      setRows(bindings);

      try {
        const { sql } = await sparql.reformulate(query);
        setSqlText(sql);
      } catch {
        setSqlText('无法获取 SQL 改写结果');
      }

      setLastDurationMs(Math.round(performance.now() - startedAt));
      setUsedHistoryQuery(historyHit);
      setLastQueryFingerprint(fingerprint);
      setActiveResultTab('results');
      void loadHistory();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '执行失败';
      setError(message);
      setColumns([]);
      setRows([]);
      setSqlText('');
      setLastDurationMs(Math.round(performance.now() - startedAt));
      setUsedHistoryQuery(historyHit);
      setLastQueryFingerprint(fingerprint);
      setActiveResultTab('results');
    } finally {
      setIsExecuting(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(query);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const queryLineCount = useMemo(
    () => query.split('\n').filter((line) => line.trim()).length,
    [query]
  );

  const hasResults = rows.length > 0;
  const historyCount = history.length;

  return (
    <div className="space-y-6 pb-8">
      <div className="flex flex-col gap-4 border-b border-border pb-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-[oklch(0.70_0.15_280)] to-[oklch(0.65_0.18_200)] shadow-sm">
            <Code2 className="h-5 w-5 text-white" />
          </div>
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold text-foreground">SPARQL 查询</h1>
            <p className="text-sm text-muted-foreground">围绕当前活跃本体执行查询，并同步查看结果、SQL 改写和历史记录。</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="border-primary/30 bg-primary/5 text-primary">
            当前场景: {sceneLabel}
          </Badge>
          <Badge variant="outline" className="border-border/70 bg-card/70">
            最近执行: {lastDurationMs !== null ? `${lastDurationMs} ms` : '尚未执行'}
          </Badge>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard title="当前查询" value={`${queryLineCount} 行`} hint="用于快速判断复杂度" icon={Code2} />
        <SummaryCard title="结果数量" value={`${rows.length} 条`} hint="最近一次执行结果" icon={Database} />
        <SummaryCard title="执行耗时" value={lastDurationMs !== null ? `${lastDurationMs} ms` : '--'} hint="前端请求总耗时" icon={TimerReset} />
        <SummaryCard title="命中历史" value={usedHistoryQuery ? '是' : '否'} hint={lastQueryFingerprint ? '按查询文本比对' : '尚未执行'} icon={History} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_420px]">
        <div className="space-y-4">
          <Card className="border-border/70 bg-card/80">
            <CardHeader className="pb-3">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <CardTitle className="text-base">查询编辑器</CardTitle>
                  <CardDescription>示例查询会根据当前活跃映射自动生成，优先从核心实体开始验证查询链路。</CardDescription>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="outline" size="sm" onClick={handleCopy}>
                    {copied ? <Check className="mr-2 h-4 w-4 text-emerald-500" /> : <Copy className="mr-2 h-4 w-4" />}
                    {copied ? '已复制' : '复制查询'}
                  </Button>
                  <Button
                    onClick={executeQuery}
                    disabled={isExecuting}
                    className="bg-gradient-to-r from-[oklch(0.70_0.15_280)] to-[oklch(0.65_0.18_200)] hover:opacity-90"
                  >
                    {isExecuting ? (
                      <>
                        <Sparkles className="mr-2 h-4 w-4 animate-spin" />
                        执行中...
                      </>
                    ) : (
                      <>
                        <Play className="mr-2 h-4 w-4" />
                        执行查询
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {exampleQueries.map((item) => (
                  <Button
                    key={item.label}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-full"
                    onClick={() => setQuery(item.query)}
                  >
                    {item.label}
                  </Button>
                ))}
              </div>

              <textarea
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="min-h-[360px] w-full resize-y rounded-xl border border-border/70 bg-muted/20 p-4 font-mono text-sm leading-6 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                spellCheck={false}
              />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="border-border/70 bg-card/80">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">执行摘要</CardTitle>
              <CardDescription>把最重要的状态抬到一层，避免只看到编辑器却看不到反馈。</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
                <p className="text-xs text-muted-foreground">结果数</p>
                <p className="mt-2 text-2xl font-semibold text-foreground">{rows.length}</p>
              </div>
              <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
                <p className="text-xs text-muted-foreground">执行耗时</p>
                <p className="mt-2 text-2xl font-semibold text-foreground">
                  {lastDurationMs !== null ? `${lastDurationMs} ms` : '--'}
                </p>
              </div>
              <div className="rounded-xl border border-border/70 bg-primary/5 p-4">
                <p className="text-xs text-muted-foreground">历史命中</p>
                <p className="mt-2 text-sm font-medium text-foreground">
                  {usedHistoryQuery ? '本次查询与历史记录重复' : '本次查询为新的文本输入'}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/70 bg-card/80">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">查询建议</CardTitle>
              <CardDescription>更接近业务工作台的常用提问入口。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
                <div className="rounded-xl bg-muted/20 p-4">
                  <p className="font-medium text-foreground">推荐从实体查起</p>
                  <p className="mt-2">先确认当前活跃本体里的核心类能查通，再逐步追加过滤和聚合。</p>
                </div>
              <div className="rounded-xl bg-primary/5 p-4">
                <p className="font-medium text-foreground">SQL 改写要和结果一起看</p>
                <p className="mt-2">SQL 不是附属抽屉，而是判断映射是否正确的重要证据，所以被提升到了结果区域的独立 tab。</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Tabs value={activeResultTab} onValueChange={setActiveResultTab} className="w-full">
        <TabsList className="mb-2 h-auto flex-wrap justify-start gap-2 rounded-xl border border-border/70 bg-card/60 p-1">
          <TabsTrigger value="results" className="gap-2 rounded-lg px-4 py-2">
            <Database className="h-4 w-4" />
            结果
            {hasResults && <Badge variant="secondary" className="ml-1">{rows.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="sql" className="gap-2 rounded-lg px-4 py-2">
            <Eye className="h-4 w-4" />
            SQL 改写
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-2 rounded-lg px-4 py-2">
            <Clock className="h-4 w-4" />
            历史
            {historyCount > 0 && <Badge variant="secondary" className="ml-1">{historyCount}</Badge>}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="results" className="space-y-4">
          {error ? (
            <Card className="border-border/70 bg-card/80">
              <CardContent className="flex min-h-[220px] items-center justify-center">
                <div className="text-center">
                  <AlertCircle className="mx-auto mb-3 h-12 w-12 text-destructive opacity-50" />
                  <p className="text-sm text-destructive">{error}</p>
                </div>
              </CardContent>
            </Card>
          ) : hasResults ? (
            <Card className="border-border/70 bg-card/80">
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <CardTitle className="text-base">查询结果</CardTitle>
                    <CardDescription>结果、耗时和历史命中都已经汇总在本页上方。</CardDescription>
                  </div>
                  <Badge variant="secondary">{rows.length} 条记录</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <ScrollArea className="max-h-[420px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {columns.map((col) => (
                          <TableHead key={col}>{col}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((row, index) => (
                        <TableRow key={`${index}-${columns.join('-')}`}>
                          {columns.map((col) => (
                            <TableCell key={col} className="font-mono text-xs">
                              {row[col]}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-border/70 bg-card/80">
              <CardContent className="flex min-h-[220px] items-center justify-center">
                <div className="text-center text-muted-foreground">
                  <Code2 className="mx-auto mb-3 h-12 w-12 opacity-50" />
                  <p>执行当前活跃本体的示例查询后在这里查看结果。</p>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="sql" className="space-y-4">
          <Card className="border-border/70 bg-card/80">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">SQL 改写</CardTitle>
              <CardDescription>不再作为临时抽屉显示，而是和结果、历史并列。</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="max-h-[420px] rounded-xl border border-border/70 bg-muted/20 p-4">
                <pre className="whitespace-pre-wrap break-words font-mono text-xs text-foreground">
                  {sqlText || '执行查询后在这里查看 SQL 改写结果。'}
                </pre>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          <Card className="border-border/70 bg-card/80">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">历史查询</CardTitle>
              <CardDescription>直接从历史里回填查询文本，适合复跑和比对。</CardDescription>
            </CardHeader>
            <CardContent>
              {history.length > 0 ? (
                <div className="space-y-3">
                  {history.map((item) => (
                    <button
                      key={item.id}
                      className="w-full rounded-xl border border-border/70 bg-muted/20 p-4 text-left transition-colors hover:bg-muted/35"
                      onClick={() => {
                        setQuery(item.query);
                        setActiveResultTab('results');
                      }}
                    >
                      <p className="mb-3 line-clamp-2 font-mono text-xs text-foreground">{item.query}</p>
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {item.timestamp}
                        </span>
                        <span>{item.resultCount} 条结果</span>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
                  还没有历史查询记录。
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
