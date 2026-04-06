'use client';

/**
 * 语义标注管理页面 — /annotations
 * 独立入口，管理当前激活数据源的全部语义注释。
 */

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Bot, CheckCircle2, Database, GitMerge, Loader2, Tags, Workflow } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AnnotationReviewPanel } from '@/components/annotation-review-panel';
import { annotations, datasources, type AnnotationStats, type DataSource } from '@/lib/api';

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

export default function AnnotationsPage() {
  const [dsList, setDsList]     = useState<DataSource[]>([]);
  const [dsId, setDsId]         = useState<string>('');
  const [loading, setLoading]   = useState(true);
  const [stats, setStats]       = useState<AnnotationStats>({ pending: 0, accepted: 0, rejected: 0, total: 0 });
  const [statsLoading, setStatsLoading] = useState(false);

  useEffect(() => {
    datasources.list()
      .then(list => {
        setDsList(list);
        if (list.length > 0) setDsId(list[0].id);
      })
      .catch(e => toast.error('获取数据源失败: ' + e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!dsId) {
      setStats({ pending: 0, accepted: 0, rejected: 0, total: 0 });
      return;
    }
    setStatsLoading(true);
    annotations.stats(dsId)
      .then(setStats)
      .catch(e => toast.error('获取标注统计失败: ' + e.message))
      .finally(() => setStatsLoading(false));
  }, [dsId]);

  const selectedDs = dsList.find(d => d.id === dsId);
  const hostLabel = selectedDs?.jdbc_url.split('//')[1]?.split('/')[0] ?? '未选择';
  const pendingDecisions = stats.pending + stats.accepted;

  return (
    <div className="space-y-6 pb-8">
      <div className="flex flex-col gap-4 border-b border-border pb-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-[oklch(0.70_0.15_280)] to-[oklch(0.65_0.18_200)] shadow-sm">
              <Tags className="h-5 w-5 text-white" />
            </div>
            <div className="space-y-1">
              <h1 className="text-2xl font-semibold text-foreground">语义标注管理</h1>
              <p className="text-sm text-muted-foreground">
                审核 LLM 生成的本体语义标注，并在确认后合并到 active ontology。
              </p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="border-primary/30 bg-primary/5 text-primary">
            当前数据源: {selectedDs?.name ?? '未选择'}
          </Badge>
          <Badge variant="outline" className="border-border/70 bg-card/70">
            Host: {hostLabel}
          </Badge>
          {pendingDecisions > 0 && (
            <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-500">
              {pendingDecisions} 条待决策
            </Badge>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="当前数据源"
          value={selectedDs?.name ?? '未选择'}
          hint={selectedDs ? '当前审核上下文' : '选择后加载待审核标注'}
          icon={Database}
        />
        <StatCard
          title="待审核"
          value={statsLoading ? '...' : String(stats.pending)}
          hint="需要人工确认的候选标注"
          icon={Workflow}
        />
        <StatCard
          title="已接受"
          value={statsLoading ? '...' : String(stats.accepted)}
          hint="可合并进 active ontology"
          icon={CheckCircle2}
        />
        <StatCard
          title="合并候选"
          value={statsLoading ? '...' : String(stats.total)}
          hint="当前数据源累计标注总数"
          icon={GitMerge}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="border-border/70 bg-card/80">
          <CardContent className="space-y-3 p-4">
            <div className="text-sm font-medium text-foreground">使用说明</div>
            <p className="text-sm leading-6 text-muted-foreground">
              Bootstrap 后先由 LLM 生成候选标注，再人工审核；accepted 标注会在合并后写入 active TTL，
              并立即供查询与 AI 页面复用，人工标注不会被 Bootstrap 覆盖。
            </p>
          </CardContent>
        </Card>
        <Card className="border-border/70 bg-card/80">
          <CardContent className="space-y-3 p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Database className="h-4 w-4 text-muted-foreground" />
              审核上下文
            </div>
            <Select value={dsId} onValueChange={setDsId} disabled={loading}>
              <SelectTrigger className="w-full bg-background border-[var(--border)]">
                <SelectValue placeholder="选择数据源…" />
              </SelectTrigger>
              <SelectContent className="bg-[var(--card)] border-[var(--border)]">
                {dsList.map(ds => (
                  <SelectItem key={ds.id} value={ds.id}>
                    {ds.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>
      </div>

      {/* Panel */}
      {dsId ? (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
          <AnnotationReviewPanel dsId={dsId} />
        </div>
      ) : (
        <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-[var(--border)] text-[var(--muted-foreground)] text-sm">
          {loading ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              正在加载数据源…
            </span>
          ) : '请先选择数据源'}
        </div>
      )}
    </div>
  );
}
