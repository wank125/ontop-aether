'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Activity,
  ArrowRight,
  Bot,
  CircleCheck,
  CircleX,
  Code2,
  Cpu,
  Database,
  FileCode,
  GitGraph,
  Layers,
  Loader2,
  Search,
  Sparkles,
  Table,
  Workflow,
  Zap,
} from 'lucide-react';
import { ai, datasources, mappings, ontology, sparql } from '@/lib/api';

const workspaceCards = [
  {
    title: '数据源管理',
    description: '连接数据库、测试连通性、执行 Bootstrap。',
    href: '/datasource',
    icon: Database,
    color: 'from-sky-500 to-blue-600',
  },
  {
    title: '数据库概览',
    description: '查看表结构、外键依赖和 Bootstrap 影响面。',
    href: '/db-schema',
    icon: Table,
    color: 'from-teal-500 to-cyan-600',
  },
  {
    title: '映射编辑',
    description: '维护 OBDA 规则并重启语义端点。',
    href: '/mapping',
    icon: FileCode,
    color: 'from-amber-500 to-orange-600',
  },
  {
    title: 'SPARQL 查询',
    description: '运行查询、查看 SQL 改写和历史结果。',
    href: '/sparql',
    icon: Code2,
    color: 'from-violet-500 to-purple-600',
  },
  {
    title: 'AI 助手',
    description: '用自然语言提问并追踪生成过程。',
    href: '/ai-assistant',
    icon: Bot,
    color: 'from-fuchsia-500 to-pink-600',
  },
  {
    title: '本体可视化',
    description: '浏览类、属性和关系结构。',
    href: '/ontology',
    icon: GitGraph,
    color: 'from-emerald-500 to-green-600',
  },
];

const flowSteps = [
  { step: '01', title: '连接数据源', desc: '录入 JDBC 并测试连接', href: '/datasource' },
  { step: '02', title: '分析结构', desc: '理解表、主键和依赖关系', href: '/db-schema' },
  { step: '03', title: '生成与编辑映射', desc: 'Bootstrap 后继续精调 OBDA', href: '/mapping' },
  { step: '04', title: '查询与问答', desc: '进入 SPARQL 或 AI 助手', href: '/ai-assistant' },
];

const explanationBlocks = [
  {
    title: '它是什么',
    body: '一个基于 Ontop 的语义工作台，把关系数据库映射成可查询的虚拟知识图谱。',
    icon: Layers,
  },
  {
    title: '为什么从这里进',
    body: '首页先解释模块职责，再把你带到正确页面，避免在多个专业功能之间盲跳。',
    icon: Workflow,
  },
  {
    title: '首页的职责',
    body: '只做说明、导航和下一步建议，不替代真正的工作页。',
    icon: Sparkles,
  },
];

export default function HomePage() {
  const [loading, setLoading] = useState(true);
  const [endpointRunning, setEndpointRunning] = useState(false);
  const [endpointPort, setEndpointPort] = useState(8080);
  const [dsCount, setDsCount] = useState(0);
  const [mappingCount, setMappingCount] = useState(0);
  const [classCount, setClassCount] = useState(0);
  const [historyCount, setHistoryCount] = useState(0);
  const [quickQuestionCount, setQuickQuestionCount] = useState(0);
  const [modelName, setModelName] = useState('未配置');
  const [providerName, setProviderName] = useState('未配置');

  useEffect(() => {
    Promise.all([
      datasources.list().catch(() => []),
      mappings.listFiles().catch(() => []),
      sparql.history().catch(() => []),
      sparql.endpointStatus().catch(() => ({ running: false, port: 8080 })),
      ontology.listFiles().catch(() => []),
      ai.getConfig().catch(() => null),
      ai.getQuickQuestions().catch(() => ({ questions: [] })),
    ]).then(async ([
      dsList,
      mappingFiles,
      history,
      endpoint,
      ontologyFiles,
      aiConfig,
      quickQuestions,
    ]) => {
      setDsCount(dsList.length);
      setMappingCount(mappingFiles.length);
      setHistoryCount(history.length);
      setEndpointRunning(endpoint.running);
      setEndpointPort(endpoint.port || 8080);
      setQuickQuestionCount(quickQuestions.questions.length);

      if (aiConfig) {
        setModelName(aiConfig.llm_model || '未配置');
        setProviderName(aiConfig.llm_provider || '未配置');
      }

      try {
        if (ontologyFiles.length > 0) {
          const content = await ontology.getContent(ontologyFiles[0].path);
          setClassCount(content.classes?.length || 0);
        }
      } catch {
        // ignore
      }

      setLoading(false);
    });
  }, []);

  const summaryCards = [
    { label: '数据源', value: dsCount, icon: Database, accent: 'text-sky-400', bg: 'bg-sky-500/10' },
    { label: '映射文件', value: mappingCount, icon: FileCode, accent: 'text-amber-400', bg: 'bg-amber-500/10' },
    { label: '本体类', value: classCount, icon: GitGraph, accent: 'text-emerald-400', bg: 'bg-emerald-500/10' },
    { label: '查询历史', value: historyCount, icon: Activity, accent: 'text-violet-400', bg: 'bg-violet-500/10' },
  ];

  return (
    <div className="space-y-6 pb-8" style={{ minHeight: 'calc(100vh - 56px - 48px)' }}>
      <div className="relative overflow-hidden rounded-3xl border border-border/60 bg-card/95 p-8">
        <div
          className="absolute inset-0 opacity-30"
          style={{
            background:
              'radial-gradient(ellipse at 15% 20%, oklch(0.28 0.08 280), transparent 45%), radial-gradient(ellipse at 82% 30%, oklch(0.22 0.06 200), transparent 48%)',
          }}
        />
        <div
          className="absolute inset-0 opacity-[0.05]"
          style={{
            backgroundImage: 'linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)',
            backgroundSize: '28px 28px',
          }}
        />

        <div className="relative space-y-6">
          <div className="max-w-4xl space-y-4">
            <div className="flex items-start gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[oklch(0.70_0.15_280)] to-[oklch(0.65_0.18_200)] shadow-lg">
                <Zap className="h-7 w-7 text-white" />
              </div>
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="border-primary/20 bg-primary/5 text-primary">
                    Ontop 语义工作台
                  </Badge>
                  {loading ? (
                    <Badge variant="outline">读取状态中</Badge>
                  ) : endpointRunning ? (
                    <Badge variant="secondary" className="gap-1.5 bg-emerald-500/10 text-emerald-500">
                      <CircleCheck className="h-3.5 w-3.5" />
                      端点运行中 :{endpointPort}
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="gap-1.5 bg-amber-500/10 text-amber-500">
                      <CircleX className="h-3.5 w-3.5" />
                      端点未启动
                    </Badge>
                  )}
                </div>
                <h1 className="text-3xl font-bold tracking-tight text-foreground">你的本体工作台</h1>
                <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                  天织把数据源、Bootstrap、映射、SPARQL 和 AI 问答串成一条工作链路。
                  首页负责解释这条链路，并把你带到下一步最合适的页面。
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button asChild size="lg">
                <Link href="/mapping">
                  去映射编辑
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link href="/db-schema">查看数据库概览</Link>
              </Button>
            </div>

          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {explanationBlocks.map((block) => {
              const Icon = block.icon;
              return (
                <div key={block.title} className="rounded-2xl border border-border/60 bg-background/60 p-4 backdrop-blur-sm">
                  <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Icon className="h-4 w-4" />
                  </div>
                  <p className="text-sm font-semibold text-foreground">{block.title}</p>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{block.body}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map((item) => {
          const Icon = item.icon;
          return (
            <Card key={item.label} className="border-border/60">
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{item.label}</p>
                    <p className="mt-2 text-3xl font-semibold tabular-nums text-foreground">
                      {loading ? <span className="inline-block h-8 w-10 animate-pulse rounded bg-muted" /> : item.value}
                    </p>
                  </div>
                  <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${item.bg}`}>
                    <Icon className={`h-4 w-4 ${item.accent}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <Card className="border-border/60">
          <CardHeader>
            <CardTitle className="text-base">核心工作区</CardTitle>
            <CardDescription>首页负责解释入口职责，让你少走冤枉路。</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            {workspaceCards.map((card) => {
              const Icon = card.icon;
              return (
                <Link key={card.href} href={card.href} className="group block">
                  <div className="h-full rounded-2xl border border-border/60 bg-muted/20 p-4 transition-all duration-200 group-hover:border-primary/30 group-hover:bg-muted/30">
                    <div className="flex items-start gap-4">
                      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${card.color}`}>
                        <Icon className="h-5 w-5 text-white" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <h3 className="text-sm font-semibold text-foreground">{card.title}</h3>
                          <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                        </div>
                        <p className="mt-2 text-sm leading-6 text-muted-foreground">{card.description}</p>
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="border-border/60">
            <CardHeader>
              <CardTitle className="text-base">推荐工作流</CardTitle>
              <CardDescription>把整套工具链压成四步，帮助新用户快速建立操作顺序。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {flowSteps.map((step) => (
                <div key={step.step} className="flex items-start gap-3 rounded-2xl border border-border/60 bg-muted/20 p-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[oklch(0.70_0.15_280)] to-[oklch(0.65_0.18_200)] text-sm font-semibold text-white">
                    {step.step}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-foreground">{step.title}</p>
                      <Button asChild variant="ghost" size="sm" className="h-7 px-2">
                        <Link href={step.href}>进入</Link>
                      </Button>
                    </div>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">{step.desc}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="border-border/60">
            <CardHeader>
              <CardTitle className="text-base">最少必要状态</CardTitle>
              <CardDescription>首页只保留帮助决策的状态，不做监控大盘。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-2xl border border-border/60 bg-muted/20 p-4">
                <div className="flex items-center gap-2">
                  <Cpu className="h-4 w-4 text-muted-foreground" />
                  <p className="text-sm font-semibold text-foreground">AI 与查询配置</p>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="text-xs text-muted-foreground">当前模型</p>
                    <p className="truncate text-sm font-medium text-foreground">{modelName}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">当前 Provider</p>
                    <p className="text-sm font-medium text-foreground">{providerName}</p>
                  </div>
                  <div className="sm:col-span-2">
                    <p className="text-xs text-muted-foreground">快捷问题</p>
                    <p className="text-sm font-medium text-foreground">{quickQuestionCount} 条</p>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl bg-primary/5 p-4">
                <div className="flex items-center gap-2">
                  <Search className="h-4 w-4 text-primary" />
                  <p className="text-sm font-semibold text-foreground">首页的职责</p>
                </div>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  解释产品、梳理模块职责，并把你带进正确工作区。
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
