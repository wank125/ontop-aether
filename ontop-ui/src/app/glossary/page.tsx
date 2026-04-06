'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  BookMarked,
  Bot,
  Database,
  Filter,
  Loader2,
  PencilLine,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  Upload,
  Download,
  User,
  BookOpen,
  Layers,
  Link2,
} from 'lucide-react';
import {
  glossary,
  datasources,
  endpointRegistry,
  type GlossaryTerm,
  type GlossaryEntityKind,
  type DataSource,
} from '@/lib/api';

// ── Constants ─────────────────────────────────────────────

const KIND_ICON: Record<GlossaryEntityKind, React.ReactNode> = {
  class:           <BookOpen  className="h-3.5 w-3.5 text-violet-400" />,
  data_property:   <Layers    className="h-3.5 w-3.5 text-sky-400" />,
  object_property: <Link2     className="h-3.5 w-3.5 text-emerald-400" />,
};

const KIND_LABEL: Record<GlossaryEntityKind, string> = {
  class:           '类',
  data_property:   '数据属性',
  object_property: '对象属性',
};

const EMPTY_FORM = {
  term: '',
  aliases: '',
  entity_uri: '',
  entity_kind: 'data_property' as GlossaryEntityKind,
  description: '',
  example_questions: '',
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
  icon: typeof BookMarked;
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

// ── Main Component ─────────────────────────────────────────

export default function GlossaryPage() {
  const [dsList, setDsList]     = useState<DataSource[]>([]);
  const [dsId, setDsId]         = useState('');
  const [terms, setTerms]       = useState<GlossaryTerm[]>([]);
  const [stats, setStats]       = useState({ human: 0, llm: 0, total: 0 });
  const [loading, setLoading]   = useState(false);
  const [generating, setGen]    = useState(false);
  const [search, setSearch]     = useState('');
  const [kindFilter, setKind]   = useState<GlossaryEntityKind | 'all'>('all');
  const [editTarget, setEdit]   = useState<GlossaryTerm | null>(null);
  const [form, setForm]         = useState(EMPTY_FORM);
  const [formSaving, setSaving] = useState(false);
  const [showCreate, setCreate] = useState(false);

  // Load datasources
  useEffect(() => {
    Promise.all([datasources.list(), endpointRegistry.current()])
      .then(([list, current]) => {
        setDsList(list);

        const currentDsId = 'ds_id' in current ? current.ds_id : '';
        const initialDsId =
          (currentDsId && list.some((item) => item.id === currentDsId) && currentDsId) ||
          list[0]?.id ||
          '';

        setDsId(initialDsId);
      })
      .catch(e => toast.error('获取数据源失败: ' + e.message));
  }, []);

  // Load glossary
  const load = useCallback(async () => {
    if (!dsId) return;
    setLoading(true);
    try {
      const [ts, s] = await Promise.all([
        glossary.list(dsId),
        glossary.stats(dsId),
      ]);
      setTerms(ts);
      setStats(s);
    } catch (e: any) {
      toast.error('加载词汇表失败: ' + e.message);
    } finally {
      setLoading(false);
    }
  }, [dsId]);

  useEffect(() => { load(); }, [load]);

  // Filter
  const filtered = terms.filter(t => {
    if (kindFilter !== 'all' && t.entity_kind !== kindFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        t.term.toLowerCase().includes(q) ||
        t.entity_uri.toLowerCase().includes(q) ||
        t.aliases.some(a => a.toLowerCase().includes(q)) ||
        t.description?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  // Generate
  const handleGenerate = async () => {
    setGen(true);
    try {
      const res = await glossary.generate(dsId);
      toast.success(res.message + `（预计生成 ${res.estimated_terms} 条）`);
      setTimeout(load, 3000); // 后台任务，稍后刷新
    } catch (e: any) {
      toast.error('生成失败: ' + e.message);
    } finally {
      setGen(false);
    }
  };

  // Delete
  const handleDelete = async (t: GlossaryTerm) => {
    try {
      await glossary.delete(dsId, t.id);
      toast.success(`已删除 "${t.term}"`);
      await load();
    } catch (e: any) {
      toast.error('删除失败: ' + e.message);
    }
  };

  // Open edit dialog
  const openEdit = (t: GlossaryTerm) => {
    setEdit(t);
    setForm({
      term: t.term,
      aliases: t.aliases.join('、'),
      entity_uri: t.entity_uri,
      entity_kind: t.entity_kind,
      description: t.description,
      example_questions: t.example_questions.join('\n'),
    });
  };

  // Open create dialog
  const openCreate = () => {
    setEdit(null);
    setForm(EMPTY_FORM);
    setCreate(true);
  };

  // Save
  const handleSave = async () => {
    if (!form.term || !form.entity_uri) {
      toast.error('词汇和映射属性不能为空');
      return;
    }
    setSaving(true);
    try {
      const body = {
        term:              form.term,
        entity_uri:        form.entity_uri,
        entity_kind:       form.entity_kind,
        aliases:           form.aliases.split(/[,，、\s]+/).filter(Boolean),
        description:       form.description,
        example_questions: form.example_questions.split('\n').filter(Boolean),
        source:            'human' as const,
      };
      if (editTarget) {
        await glossary.update(dsId, editTarget.id, body);
        toast.success('已更新');
      } else {
        await glossary.create(dsId, body);
        toast.success('已创建');
      }
      setEdit(null);
      setCreate(false);
      await load();
    } catch (e: any) {
      toast.error('保存失败: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  // Export
  const handleExport = async () => {
    try {
      const data = await glossary.exportJson(dsId);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `glossary_${dsId}.json`;
      a.click();
    } catch (e: any) {
      toast.error('导出失败: ' + e.message);
    }
  };

  // ── Render ───────────────────────────────────────────────
  const selectedDs = dsList.find(ds => ds.id === dsId);
  const hostLabel = selectedDs?.jdbc_url.split('//')[1]?.split('/')[0] ?? '未选择';

  return (
    <div className="space-y-6 pb-8">
      <div className="flex flex-col gap-4 border-b border-border pb-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-[oklch(0.65_0.18_200)] to-[oklch(0.70_0.15_280)] shadow-sm">
              <BookMarked className="h-5 w-5 text-white" />
            </div>
            <div className="space-y-1">
              <h1 className="text-2xl font-semibold text-foreground">业务词汇表</h1>
              <p className="text-sm text-muted-foreground">
                将业务口语词显式映射到本体属性和类，并自动注入 AI 查询上下文。
              </p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="border-primary/30 bg-primary/5 text-primary">
            当前激活数据源: {selectedDs?.name ?? '未选择'}
          </Badge>
          <Badge variant="outline" className="border-border/70 bg-card/70">
            Host: {hostLabel}
          </Badge>
          <Badge variant="outline" className="border-sky-500/30 bg-sky-500/10 text-sky-400">
            人工条目优先
          </Badge>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard title="词汇总数" value={String(stats.total)} hint="当前审核数据源已收录条目" icon={BookMarked} />
        <StatCard title="LLM 生成" value={String(stats.llm)} hint="由已审核注释自动推导" icon={Sparkles} />
        <StatCard title="人工添加" value={String(stats.human)} hint="手工维护且不会被覆盖" icon={User} />
        <StatCard title="映射范围" value={dsId ? '当前审核数据源' : '未选择'} hint="可映射到本体属性 / 类" icon={Database} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="border-border/70 bg-card/80">
          <CardContent className="space-y-3 p-4">
            <div className="text-sm font-medium text-foreground">使用说明</div>
            <p className="text-sm leading-6 text-muted-foreground">
              点击「自动生成」从已审核的语义注释中推导业务词汇；也可手动添加。
              词汇会在 AI 查询时按用户问题关键词自动筛选注入，人工添加的词汇不会被自动生成覆盖。
            </p>
          </CardContent>
        </Card>
        <Card className="border-border/70 bg-card/80">
          <CardContent className="space-y-3 p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Database className="h-4 w-4 text-muted-foreground" />
              审核数据源
            </div>
            <Select value={dsId} onValueChange={setDsId}>
              <SelectTrigger className="w-full bg-background border-[var(--border)]">
                <SelectValue placeholder="选择数据源…" />
              </SelectTrigger>
              <SelectContent className="bg-[var(--card)] border-[var(--border)]">
                {dsList.map(ds => <SelectItem key={ds.id} value={ds.id}>{ds.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>
      </div>

      {/* Stats + Actions */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        {/* Stats cards */}
        <div className="flex items-center gap-3">
          {[
            { label: '全部', value: stats.total,   color: 'text-[var(--foreground)]' },
            { label: 'LLM',  value: stats.llm,    color: 'text-violet-400' },
            { label: '人工', value: stats.human,  color: 'text-sky-400' },
          ].map(s => (
            <div key={s.label} className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-1.5">
              <span className={`text-lg font-bold ${s.color}`}>{s.value}</span>
              <span className="text-xs text-[var(--muted-foreground)]">{s.label}</span>
            </div>
          ))}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            刷新
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="h-4 w-4 mr-1.5" />
            导出
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleGenerate}
            disabled={generating || !dsId}
            className="border-violet-500/30 text-violet-400 hover:bg-violet-500/10"
          >
            {generating
              ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              : <Sparkles className="h-4 w-4 mr-1.5" />
            }
            自动生成
          </Button>
          <Link
            href="/ai-assistant"
            className="inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-background px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Bot className="h-4 w-4" />
            AI 查询
          </Link>
          <Button
            size="sm"
            onClick={openCreate}
            className="bg-gradient-to-r from-sky-600 to-indigo-600 text-white hover:opacity-90"
          >
            <Plus className="h-4 w-4 mr-1.5" />
            新增词汇
          </Button>
        </div>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-2">
        <Search className="h-4 w-4 text-[var(--muted-foreground)]" />
        <Input
          placeholder="搜索词汇、别名或属性名…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="h-8 w-56 text-sm bg-[var(--card)] border-[var(--border)]"
        />
        <Filter className="h-4 w-4 text-[var(--muted-foreground)]" />
        <select
          value={kindFilter}
          onChange={e => setKind(e.target.value as typeof kindFilter)}
          className="h-8 rounded-md border border-[var(--border)] bg-[var(--card)] px-2 text-xs text-[var(--foreground)]"
        >
          <option value="all">全部类型</option>
          <option value="class">类</option>
          <option value="data_property">数据属性</option>
          <option value="object_property">对象属性</option>
        </select>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-[var(--border)] overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-[160px_1fr_180px_80px_96px] gap-0 border-b border-[var(--border)] bg-[var(--muted)]/30 px-4 py-2 text-xs font-medium text-[var(--muted-foreground)]">
          <div>业务词汇</div>
          <div>别名</div>
          <div>映射属性/类</div>
          <div className="text-center">来源</div>
          <div className="text-center">操作</div>
        </div>

        {loading ? (
          <div className="flex h-40 items-center justify-center text-[var(--muted-foreground)]">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />加载中…
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex h-40 flex-col items-center justify-center gap-2 text-[var(--muted-foreground)] text-sm">
            <BookMarked className="h-8 w-8 opacity-30" />
            {terms.length === 0
              ? '暂无词汇表，点击「自动生成」或「新增词汇」开始'
              : '没有匹配的词汇'}
          </div>
        ) : (
          <div className="divide-y divide-[var(--border)]">
            {filtered.map(t => (
              <div
                key={t.id}
                className="grid grid-cols-[160px_1fr_180px_80px_96px] gap-0 items-start px-4 py-2.5 text-sm hover:bg-[var(--muted)]/20 transition-colors"
              >
                {/* Term */}
                <div>
                  <div className="font-semibold text-[var(--foreground)]">{t.term}</div>
                  {t.description && (
                    <div className="text-[11px] text-[var(--muted-foreground)] mt-0.5 line-clamp-2">{t.description}</div>
                  )}
                </div>

                {/* Aliases */}
                <div className="flex flex-wrap gap-1 pr-3 pt-0.5">
                  {t.aliases.map(a => (
                    <span key={a} className="rounded bg-[var(--muted)] px-1.5 py-0.5 text-[11px] text-[var(--muted-foreground)]">{a}</span>
                  ))}
                </div>

                {/* Entity URI */}
                <div className="flex items-start gap-1.5 pt-0.5">
                  {KIND_ICON[t.entity_kind]}
                  <div>
                    <code className="text-xs font-mono text-[var(--foreground)] break-all">{t.entity_uri}</code>
                    <div className="text-[10px] text-[var(--muted-foreground)]">{KIND_LABEL[t.entity_kind]}</div>
                  </div>
                </div>

                {/* Source */}
                <div className="flex justify-center pt-0.5">
                  {t.source === 'llm' ? (
                    <Badge variant="outline" className="border-violet-500/30 bg-violet-500/10 text-violet-400 text-[10px] gap-1">
                      <Bot className="h-2.5 w-2.5" /> LLM
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="border-sky-500/30 bg-sky-500/10 text-sky-400 text-[10px] gap-1">
                      <User className="h-2.5 w-2.5" /> 人工
                    </Badge>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center justify-center gap-1">
                  <button
                    onClick={() => openEdit(t)}
                    className="flex h-7 w-7 items-center justify-center rounded-md border border-[var(--border)] text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
                  >
                    <PencilLine className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(t)}
                    className="flex h-7 w-7 items-center justify-center rounded-md border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create/Edit Dialog */}
      <Dialog
        open={!!editTarget || showCreate}
        onOpenChange={open => { if (!open) { setEdit(null); setCreate(false); } }}
      >
        <DialogContent className="max-w-lg bg-[var(--card)] border-[var(--border)]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {editTarget ? <PencilLine className="h-4 w-4 text-sky-400" /> : <Plus className="h-4 w-4 text-sky-400" />}
              {editTarget ? '编辑词汇' : '新增词汇'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-[var(--muted-foreground)] mb-1.5 block">业务词汇 *</label>
                <Input
                  value={form.term}
                  onChange={e => setForm(f => ({ ...f, term: e.target.value }))}
                  placeholder="如：欠款、物业费"
                  className="bg-[var(--background)] border-[var(--border)]"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-[var(--muted-foreground)] mb-1.5 block">类型</label>
                <select
                  value={form.entity_kind}
                  onChange={e => setForm(f => ({ ...f, entity_kind: e.target.value as GlossaryEntityKind }))}
                  className="h-9 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-2 text-xs text-[var(--foreground)]"
                >
                  <option value="class">类</option>
                  <option value="data_property">数据属性</option>
                  <option value="object_property">对象属性</option>
                </select>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-[var(--muted-foreground)] mb-1.5 block">映射属性/类 URI *</label>
              <Input
                value={form.entity_uri}
                onChange={e => setForm(f => ({ ...f, entity_uri: e.target.value }))}
                placeholder="如：bill#balance_overdue"
                className="bg-[var(--background)] border-[var(--border)] font-mono text-xs"
              />
              <p className="text-[10px] text-[var(--muted-foreground)] mt-1">填写本体 local name，类名直接写类名（如 Customer），属性写 ClassName#attrName</p>
            </div>
            <div>
              <label className="text-xs font-medium text-[var(--muted-foreground)] mb-1.5 block">别名（逗号或顿号分隔）</label>
              <Input
                value={form.aliases}
                onChange={e => setForm(f => ({ ...f, aliases: e.target.value }))}
                placeholder="逾期金额、拖欠、欠费"
                className="bg-[var(--background)] border-[var(--border)]"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-[var(--muted-foreground)] mb-1.5 block">业务说明（选填）</label>
              <Textarea
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="一句话描述业务含义…"
                rows={2}
                className="bg-[var(--background)] border-[var(--border)] resize-none text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-[var(--muted-foreground)] mb-1.5 block">示例问法（每行一条，选填）</label>
              <Textarea
                value={form.example_questions}
                onChange={e => setForm(f => ({ ...f, example_questions: e.target.value }))}
                placeholder={"查询本月有欠款的客户\n欠款金额超过1000的有哪些"}
                rows={2}
                className="bg-[var(--background)] border-[var(--border)] resize-none text-sm"
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => { setEdit(null); setCreate(false); }}>取消</Button>
              <Button
                onClick={handleSave}
                disabled={formSaving}
                className="bg-gradient-to-r from-sky-600 to-indigo-600 text-white hover:opacity-90"
              >
                {formSaving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <User className="h-4 w-4 mr-1.5" />}
                保存
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
