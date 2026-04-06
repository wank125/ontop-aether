'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollText, Search, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { governance } from '@/lib/api';

interface AuditEvent {
  id: string;
  event_type: string;
  event_category: string;
  actor_display: string;
  action: string;
  resource_type: string;
  resource_name: string;
  status: string;
  duration_ms: number | null;
  source_ip: string;
  created_at: string;
  metadata_json: string;
}

interface AuditPage {
  items: AuditEvent[];
  total: number;
  page: number;
  page_size: number;
}

export default function AuditPage() {
  const [data, setData] = useState<AuditPage>({ items: [], total: 0, page: 1, page_size: 20 });
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    event_type: '',
    actor: '',
    resource_type: '',
    status: '',
  });

  useEffect(() => {
    loadAudit();
  }, [data.page]);

  async function loadAudit() {
    setLoading(true);
    try {
      const result = await governance.audit.list({
        page: data.page,
        page_size: data.page_size,
        ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)),
      });
      setData(result);
    } catch {
      toast.error('加载审计日志失败');
    } finally {
      setLoading(false);
    }
  }

  function applyFilters() {
    setData((d) => ({ ...d, page: 1 }));
    setTimeout(loadAudit, 0);
  }

  const totalPages = Math.ceil(data.total / data.page_size);

  const statusColor = (s: string) => {
    if (s === 'success') return 'bg-emerald-500/10 text-emerald-500';
    if (s === 'failure') return 'bg-red-500/10 text-red-500';
    if (s === 'denied') return 'bg-amber-500/10 text-amber-500';
    return 'bg-muted text-muted-foreground';
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">审计日志</h1>
        <p className="text-sm text-muted-foreground">查看平台操作审计记录</p>
      </div>

      {/* 筛选栏 */}
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <div className="w-40 space-y-1">
            <label className="text-xs text-muted-foreground">事件类型</label>
            <Input
              placeholder="http_request"
              value={filters.event_type}
              onChange={(e) => setFilters((f) => ({ ...f, event_type: e.target.value }))}
            />
          </div>
          <div className="w-40 space-y-1">
            <label className="text-xs text-muted-foreground">操作者</label>
            <Input
              placeholder="用户名"
              value={filters.actor}
              onChange={(e) => setFilters((f) => ({ ...f, actor: e.target.value }))}
            />
          </div>
          <div className="w-40 space-y-1">
            <label className="text-xs text-muted-foreground">资源类型</label>
            <Input
              placeholder="datasource"
              value={filters.resource_type}
              onChange={(e) => setFilters((f) => ({ ...f, resource_type: e.target.value }))}
            />
          </div>
          <div className="w-32 space-y-1">
            <label className="text-xs text-muted-foreground">状态</label>
            <Select value={filters.status || '_all'} onValueChange={(v) => setFilters((f) => ({ ...f, status: v === '_all' ? '' : v }))}>
              <SelectTrigger><SelectValue placeholder="全部" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">全部</SelectItem>
                <SelectItem value="success">成功</SelectItem>
                <SelectItem value="failure">失败</SelectItem>
                <SelectItem value="denied">拒绝</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button size="sm" className="gap-2" onClick={applyFilters}>
            <Search className="h-4 w-4" />
            筛选
          </Button>
        </CardContent>
      </Card>

      {/* 审计表格 */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex h-32 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/60">
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground">时间</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground">操作者</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground">操作</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground">资源</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground">状态</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase text-muted-foreground">耗时</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((ev) => (
                  <tr key={ev.id} className="border-b border-border/30 hover:bg-muted/20">
                    <td className="px-4 py-3 text-xs whitespace-nowrap">
                      {new Date(ev.created_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm">{ev.actor_display || '-'}</span>
                      {ev.source_ip && (
                        <span className="ml-2 text-xs text-muted-foreground">{ev.source_ip}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className="text-xs">{ev.action}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm">{ev.resource_name || ev.resource_type || '-'}</p>
                      {ev.resource_type && (
                        <p className="text-xs text-muted-foreground">{ev.resource_type}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={`text-xs ${statusColor(ev.status)}`}>{ev.status}</Badge>
                    </td>
                    <td className="px-4 py-3 text-right text-xs tabular-nums text-muted-foreground">
                      {ev.duration_ms != null ? `${ev.duration_ms.toFixed(1)}ms` : '-'}
                    </td>
                  </tr>
                ))}
                {data.items.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                      暂无审计记录
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* 分页 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            共 {data.total} 条，第 {data.page}/{totalPages} 页
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={data.page <= 1}
              onClick={() => setData((d) => ({ ...d, page: d.page - 1 }))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={data.page >= totalPages}
              onClick={() => setData((d) => ({ ...d, page: d.page + 1 }))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
