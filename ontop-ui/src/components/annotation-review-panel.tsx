'use client';

/**
 * 语义注释审核面板
 * 展示 Bootstrap 后 LLM 生成的语义标注，支持逐条或批量接受/拒绝，并触发合并。
 */

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  Check,
  X,
  CheckCheck,
  GitMerge,
  RefreshCw,
  PencilLine,
  Filter,
  Loader2,
  Bot,
  User,
  BookOpen,
  Layers,
  Link2,
} from 'lucide-react';
import { annotations, type SemanticAnnotation, type AnnotationStatus, type AnnotationKind } from '@/lib/api';

// ── Types ──────────────────────────────────────────────

interface Props {
  dsId: string;
  /** Bootstrap 完成后外部传入，用于自动刷新 */
  bootstrapVersion?: string;
}

interface GroupedAnnotation {
  entity_uri:  string;
  entity_kind: AnnotationKind;
  zh?: SemanticAnnotation;
  en?: SemanticAnnotation;
  status: AnnotationStatus; // 取 zh 的状态，两者保持一致
}

const KIND_ICON: Record<AnnotationKind, React.ReactNode> = {
  class:           <BookOpen  className="h-3.5 w-3.5 text-violet-400" />,
  data_property:   <Layers    className="h-3.5 w-3.5 text-sky-400" />,
  object_property: <Link2     className="h-3.5 w-3.5 text-emerald-400" />,
};

const KIND_LABEL: Record<AnnotationKind, string> = {
  class:           '类',
  data_property:   '数据属性',
  object_property: '对象属性',
};

const STATUS_BADGE: Record<AnnotationStatus, React.ReactNode> = {
  pending:  <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-400 text-xs">待审核</Badge>,
  accepted: <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-400 text-xs">已接受</Badge>,
  rejected: <Badge variant="outline" className="border-red-500/40 bg-red-500/10 text-red-400 text-xs">已拒绝</Badge>,
};

// ── Helper ─────────────────────────────────────────────

function groupAnnotations(anns: SemanticAnnotation[]): GroupedAnnotation[] {
  const map = new Map<string, GroupedAnnotation>();
  for (const ann of anns) {
    const key = ann.entity_uri;
    if (!map.has(key)) {
      map.set(key, {
        entity_uri:  ann.entity_uri,
        entity_kind: ann.entity_kind as AnnotationKind,
        status:      ann.status as AnnotationStatus,
      });
    }
    const entry = map.get(key)!;
    if (ann.lang === 'zh') { entry.zh = ann; entry.status = ann.status as AnnotationStatus; }
    if (ann.lang === 'en') { entry.en = ann; }
  }
  return Array.from(map.values());
}

// ── Main Component ─────────────────────────────────────

export function AnnotationReviewPanel({ dsId, bootstrapVersion }: Props) {
  const [allAnnotations, setAllAnnotations]     = useState<SemanticAnnotation[]>([]);
  const [loading, setLoading]                   = useState(false);
  const [merging, setMerging]                   = useState(false);
  const [activeTab, setActiveTab]               = useState<'pending' | 'accepted' | 'rejected'>('pending');
  const [search, setSearch]                     = useState('');
  const [kindFilter, setKindFilter]             = useState<AnnotationKind | 'all'>('all');
  const [selected, setSelected]                 = useState<Set<string>>(new Set()); // entity_uri set
  const [editTarget, setEditTarget]             = useState<GroupedAnnotation | null>(null);
  const [editZhLabel, setEditZhLabel]           = useState('');
  const [editZhComment, setEditZhComment]       = useState('');
  const [editEnLabel, setEditEnLabel]           = useState('');
  const [editSaving, setEditSaving]             = useState(false);
  const [stats, setStats]                       = useState({ pending: 0, accepted: 0, rejected: 0, total: 0 });

  // ── Data loading ──────────────────────────────────────

  const load = useCallback(async () => {
    if (!dsId) return;
    setLoading(true);
    try {
      const [data, s] = await Promise.all([
        annotations.list(dsId),
        annotations.stats(dsId),
      ]);
      setAllAnnotations(data);
      setStats(s);
      setSelected(new Set());
    } catch (e: any) {
      toast.error('加载注释失败: ' + e.message);
    } finally {
      setLoading(false);
    }
  }, [dsId]);

  useEffect(() => { load(); }, [load, bootstrapVersion]);

  // ── Derived data ──────────────────────────────────────

  const filtered = allAnnotations.filter(a => {
    if (a.status !== activeTab) return false;
    if (kindFilter !== 'all' && a.entity_kind !== kindFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        a.entity_uri.toLowerCase().includes(q) ||
        a.label?.toLowerCase().includes(q) ||
        a.comment?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const grouped = groupAnnotations(filtered);

  // ── Selection helpers ─────────────────────────────────

  const toggleSelect = (uri: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(uri) ? next.delete(uri) : next.add(uri);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === grouped.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(grouped.map(g => g.entity_uri)));
    }
  };

  // ── Actions ───────────────────────────────────────────

  const batchAction = async (status: AnnotationStatus) => {
    const targets = selected.size > 0
      ? allAnnotations.filter(a => selected.has(a.entity_uri) && a.status === activeTab)
      : allAnnotations.filter(a => a.status === activeTab);

    const ids = targets.map(a => a.id);
    if (!ids.length) { toast.info('没有可操作的注释'); return; }

    try {
      const res = await annotations.batchStatus(dsId, ids, status);
      toast.success(`已${status === 'accepted' ? '接受' : '拒绝'} ${res.updated} 条注释`);
      await load();
    } catch (e: any) {
      toast.error('操作失败: ' + e.message);
    }
  };

  const singleAction = async (ann: GroupedAnnotation, status: AnnotationStatus) => {
    const ids = [ann.zh?.id, ann.en?.id].filter(Boolean) as string[];
    try {
      await annotations.batchStatus(dsId, ids, status);
      toast.success(status === 'accepted' ? '已接受' : '已拒绝');
      await load();
    } catch (e: any) {
      toast.error('操作失败: ' + e.message);
    }
  };

  const triggerMerge = async () => {
    setMerging(true);
    try {
      const res = await annotations.merge(dsId);
      toast.success(`合并完成：${res.merged_entities} 个实体写入 active TTL`);
    } catch (e: any) {
      toast.error('合并失败: ' + e.message);
    } finally {
      setMerging(false);
    }
  };

  // ── Edit dialog save ──────────────────────────────────

  const openEdit = (g: GroupedAnnotation) => {
    setEditTarget(g);
    setEditZhLabel(g.zh?.label || '');
    setEditZhComment(g.zh?.comment || '');
    setEditEnLabel(g.en?.label || '');
  };

  const saveEdit = async () => {
    if (!editTarget) return;
    setEditSaving(true);
    try {
      await Promise.all([
        annotations.create(dsId, {
          entity_uri:  editTarget.entity_uri,
          entity_kind: editTarget.entity_kind,
          lang:        'zh',
          label:       editZhLabel,
          comment:     editZhComment,
          source:      'human',
        }),
        annotations.create(dsId, {
          entity_uri:  editTarget.entity_uri,
          entity_kind: editTarget.entity_kind,
          lang:        'en',
          label:       editEnLabel,
          comment:     '',
          source:      'human',
        }),
      ]);
      toast.success('已保存（人工标注，自动 accepted）');
      setEditTarget(null);
      await load();
    } catch (e: any) {
      toast.error('保存失败: ' + e.message);
    } finally {
      setEditSaving(false);
    }
  };

  // ── Render ────────────────────────────────────────────

  if (!dsId) return null;

  return (
    <div className="space-y-4">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-violet-400" />
          <h2 className="text-base font-semibold text-[var(--foreground)]">语义标注审核</h2>
          <span className="text-xs text-[var(--muted-foreground)]">
            LLM 自动生成 · 人工审核后合并到 active 本体
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            刷新
          </Button>
          <Button
            size="sm"
            onClick={triggerMerge}
            disabled={merging || stats.accepted === 0}
            className="bg-gradient-to-r from-violet-600 to-indigo-600 text-white hover:opacity-90"
          >
            {merging
              ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              : <GitMerge className="h-4 w-4 mr-1.5" />
            }
            合并到本体
            {stats.accepted > 0 && (
              <span className="ml-1.5 rounded-full bg-white/20 px-1.5 py-0.5 text-xs">
                {stats.accepted}
              </span>
            )}
          </Button>
        </div>
      </div>

      {/* ── Stats bar ── */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: '待审核', value: stats.pending,  color: 'text-amber-400',   bg: 'bg-amber-500/10 border-amber-500/20' },
          { label: '已接受', value: stats.accepted, color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
          { label: '已拒绝', value: stats.rejected, color: 'text-red-400',     bg: 'bg-red-500/10 border-red-500/20' },
          { label: '合计',   value: stats.total,    color: 'text-[var(--foreground)]', bg: 'bg-[var(--card)] border-[var(--border)]' },
        ].map(stat => (
          <div key={stat.label} className={`rounded-lg border p-3 ${stat.bg}`}>
            <div className={`text-2xl font-bold ${stat.color}`}>{stat.value}</div>
            <div className="text-xs text-[var(--muted-foreground)]">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* ── Tabs ── */}
      <Tabs value={activeTab} onValueChange={v => { setActiveTab(v as typeof activeTab); setSelected(new Set()); }}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <TabsList className="bg-[var(--card)] border border-[var(--border)]">
            <TabsTrigger value="pending"  className="gap-1.5 data-[state=active]:bg-amber-500/20">
              待审核 <span className="text-xs opacity-70">({stats.pending})</span>
            </TabsTrigger>
            <TabsTrigger value="accepted" className="gap-1.5 data-[state=active]:bg-emerald-500/20">
              已接受 <span className="text-xs opacity-70">({stats.accepted})</span>
            </TabsTrigger>
            <TabsTrigger value="rejected" className="gap-1.5 data-[state=active]:bg-red-500/20">
              已拒绝 <span className="text-xs opacity-70">({stats.rejected})</span>
            </TabsTrigger>
          </TabsList>

          {/* Filter row */}
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-[var(--muted-foreground)]" />
            <Input
              placeholder="搜索实体名或标注..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="h-8 w-48 text-sm bg-[var(--card)] border-[var(--border)]"
            />
            <select
              value={kindFilter}
              onChange={e => setKindFilter(e.target.value as typeof kindFilter)}
              className="h-8 rounded-md border border-[var(--border)] bg-[var(--card)] px-2 text-xs text-[var(--foreground)]"
            >
              <option value="all">全部类型</option>
              <option value="class">类</option>
              <option value="data_property">数据属性</option>
              <option value="object_property">对象属性</option>
            </select>
          </div>
        </div>

        {/* ── Batch action bar ── */}
        {activeTab === 'pending' && grouped.length > 0 && (
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2">
            <input
              type="checkbox"
              checked={selected.size === grouped.length && grouped.length > 0}
              onChange={toggleAll}
              className="h-4 w-4 rounded border-[var(--border)] accent-violet-500"
            />
            <span className="text-xs text-[var(--muted-foreground)] flex-1">
              {selected.size > 0 ? `已选 ${selected.size} 项` : `共 ${grouped.length} 个实体`}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => batchAction('accepted')}
              className="h-7 border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10"
            >
              <CheckCheck className="h-3.5 w-3.5 mr-1" />
              {selected.size > 0 ? `接受所选 (${selected.size})` : '全部接受'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => batchAction('rejected')}
              className="h-7 border-red-500/40 text-red-400 hover:bg-red-500/10"
            >
              <X className="h-3.5 w-3.5 mr-1" />
              {selected.size > 0 ? `拒绝所选 (${selected.size})` : '全部拒绝'}
            </Button>
          </div>
        )}

        {/* ── Table content (shared across tabs) ── */}
        {(['pending', 'accepted', 'rejected'] as const).map(tab => (
          <TabsContent key={tab} value={tab} className="mt-3">
            {loading ? (
              <div className="flex h-40 items-center justify-center text-[var(--muted-foreground)]">
                <Loader2 className="h-5 w-5 animate-spin mr-2" />加载中…
              </div>
            ) : grouped.length === 0 ? (
              <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-[var(--border)] text-[var(--muted-foreground)] text-sm">
                {tab === 'pending' ? '暂无待审核的语义标注' :
                 tab === 'accepted' ? '暂无已接受的标注' : '暂无已拒绝的标注'}
              </div>
            ) : (
              <div className="rounded-lg border border-[var(--border)] overflow-hidden">
                {/* Table header */}
                <div className="grid grid-cols-[28px_180px_1fr_1fr_120px_96px] gap-0 border-b border-[var(--border)] bg-[var(--muted)]/30 px-3 py-2 text-xs font-medium text-[var(--muted-foreground)]">
                  <div />
                  <div>实体名称</div>
                  <div>中文标注</div>
                  <div>英文标注</div>
                  <div className="text-center">来源</div>
                  <div className="text-center">操作</div>
                </div>

                {/* Table rows */}
                <div className="divide-y divide-[var(--border)]">
                  {grouped.map(g => (
                    <AnnotationRow
                      key={g.entity_uri}
                      group={g}
                      isSelected={selected.has(g.entity_uri)}
                      tab={tab}
                      onToggle={() => toggleSelect(g.entity_uri)}
                      onAccept={() => singleAction(g, 'accepted')}
                      onReject={()  => singleAction(g, 'rejected')}
                      onRestore={()  => singleAction(g, 'pending')}
                      onEdit={() => openEdit(g)}
                    />
                  ))}
                </div>
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>

      {/* ── Edit Dialog ── */}
      <Dialog open={!!editTarget} onOpenChange={open => !open && setEditTarget(null)}>
        <DialogContent className="max-w-lg bg-[var(--card)] border-[var(--border)]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PencilLine className="h-4 w-4 text-violet-400" />
              编辑语义标注
              <code className="ml-1 text-xs font-normal bg-[var(--muted)] px-1.5 py-0.5 rounded text-[var(--muted-foreground)]">
                {editTarget?.entity_uri}
              </code>
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <label className="text-xs font-medium text-[var(--muted-foreground)] mb-1.5 block">中文名称</label>
              <Input
                value={editZhLabel}
                onChange={e => setEditZhLabel(e.target.value)}
                placeholder="如：账单、订阅合同..."
                className="bg-[var(--background)] border-[var(--border)]"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-[var(--muted-foreground)] mb-1.5 block">中文说明</label>
              <Textarea
                value={editZhComment}
                onChange={e => setEditZhComment(e.target.value)}
                placeholder="一句话描述业务含义..."
                rows={2}
                className="bg-[var(--background)] border-[var(--border)] resize-none"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-[var(--muted-foreground)] mb-1.5 block">English Label</label>
              <Input
                value={editEnLabel}
                onChange={e => setEditEnLabel(e.target.value)}
                placeholder="e.g. Bill, Subscription Contract..."
                className="bg-[var(--background)] border-[var(--border)]"
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setEditTarget(null)}>取消</Button>
              <Button
                onClick={saveEdit}
                disabled={editSaving}
                className="bg-gradient-to-r from-violet-600 to-indigo-600 text-white hover:opacity-90"
              >
                {editSaving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <User className="h-4 w-4 mr-1.5" />}
                保存（人工标注）
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Row component ──────────────────────────────────────

interface RowProps {
  group:      GroupedAnnotation;
  isSelected: boolean;
  tab:        'pending' | 'accepted' | 'rejected';
  onToggle:   () => void;
  onAccept:   () => void;
  onReject:   () => void;
  onRestore:  () => void;
  onEdit:     () => void;
}

function AnnotationRow({ group, isSelected, tab, onToggle, onAccept, onReject, onRestore, onEdit }: RowProps) {
  const source = group.zh?.source ?? group.en?.source ?? 'llm';

  return (
    <div className={`grid grid-cols-[28px_180px_1fr_1fr_120px_96px] gap-0 items-start px-3 py-2.5 text-sm transition-colors
      ${isSelected ? 'bg-violet-500/10' : 'hover:bg-[var(--muted)]/30'}`}
    >
      {/* Checkbox (only for pending) */}
      <div className="flex items-center pt-0.5">
        {tab === 'pending' ? (
          <input
            type="checkbox"
            checked={isSelected}
            onChange={onToggle}
            className="h-4 w-4 rounded border-[var(--border)] accent-violet-500"
          />
        ) : (
          <div className="w-4" />
        )}
      </div>

      {/* Entity name */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-1.5 font-mono text-xs font-medium text-[var(--foreground)]">
          {KIND_ICON[group.entity_kind]}
          <span className="truncate max-w-[140px]" title={group.entity_uri}>
            {group.entity_uri}
          </span>
        </div>
        <span className="text-[10px] text-[var(--muted-foreground)]">
          {KIND_LABEL[group.entity_kind]}
        </span>
      </div>

      {/* ZH annotation */}
      <div className="pr-3">
        {group.zh ? (
          <div>
            <div className="font-medium text-[var(--foreground)] text-xs">{group.zh.label}</div>
            {group.zh.comment && (
              <div className="text-[11px] text-[var(--muted-foreground)] mt-0.5 line-clamp-2">{group.zh.comment}</div>
            )}
          </div>
        ) : <span className="text-[var(--muted-foreground)] text-xs">—</span>}
      </div>

      {/* EN annotation */}
      <div className="pr-3">
        {group.en ? (
          <div className="text-xs text-[var(--muted-foreground)]">{group.en.label}</div>
        ) : <span className="text-[var(--muted-foreground)] text-xs">—</span>}
      </div>

      {/* Source badge */}
      <div className="flex items-center justify-center">
        {source === 'llm' ? (
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
        {tab === 'pending' && (
          <>
            <button
              onClick={onAccept}
              title="接受"
              className="flex h-7 w-7 items-center justify-center rounded-md border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 transition-colors hover:bg-emerald-500/20"
            >
              <Check className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={onReject}
              title="拒绝"
              className="flex h-7 w-7 items-center justify-center rounded-md border border-red-500/30 bg-red-500/10 text-red-400 transition-colors hover:bg-red-500/20"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </>
        )}
        {tab === 'accepted' && (
          <button
            onClick={onRestore}
            title="退回待审"
            className="flex h-7 w-7 items-center justify-center rounded-md border border-[var(--border)] text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        )}
        {tab === 'rejected' && (
          <button
            onClick={onRestore}
            title="重新审核"
            className="flex h-7 w-7 items-center justify-center rounded-md border border-amber-500/30 text-amber-400 transition-colors hover:bg-amber-500/10"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        )}
        <button
          onClick={onEdit}
          title="编辑"
          className="flex h-7 w-7 items-center justify-center rounded-md border border-[var(--border)] text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
        >
          <PencilLine className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
