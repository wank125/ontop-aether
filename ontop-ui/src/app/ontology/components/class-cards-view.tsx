'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { OwlClass } from '@/lib/api';

const DOMAIN_CONFIG: Record<string, { label: string; sublabel: string; color: string; bg: string; border: string }> = {
  W: { label: 'W 域', sublabel: '物（资产/空间）', color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/30' },
  H: { label: 'H 域', sublabel: '人（客户/账户）', color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30' },
  F: { label: 'F 域', sublabel: '财（合同/账单）', color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/30' },
  E: { label: 'E 域', sublabel: '事（工单/事件）', color: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/30' },
};

export function ClassCardsView({ classes }: { classes: OwlClass[] }) {
  const grouped = groupByDomain(classes);

  return (
    <div className="space-y-8">
      {(['W', 'H', 'F', 'E'] as const).map((tag) => {
        const group = grouped[tag];
        if (!group || group.length === 0) return null;
        const cfg = DOMAIN_CONFIG[tag];

        return (
          <div key={tag}>
            <div className="mb-3 flex items-center gap-2">
              <Badge variant="outline" className={`${cfg.bg} ${cfg.color} ${cfg.border}`}>
                {cfg.label}
              </Badge>
              <span className="text-sm text-muted-foreground">{cfg.sublabel}</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {group.map((cls) => (
                <ClassCard key={cls.local_name} cls={cls} domainConfig={cfg} />
              ))}
            </div>
          </div>
        );
      })}

      {/* Classes without domain tag */}
      {grouped[''] && grouped[''].length > 0 && (
        <div>
          <div className="mb-3 flex items-center gap-2">
            <Badge variant="outline">未分类</Badge>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {grouped[''].map((cls) => (
              <ClassCard key={cls.local_name} cls={cls} domainConfig={{ bg: '', color: '', border: '' }} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ClassCard({ cls, domainConfig }: { cls: OwlClass; domainConfig: { bg: string; color: string; border: string } }) {
  return (
    <Card className="border-border">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <CardTitle className="text-base">{cls.labels.zh || cls.local_name}</CardTitle>
            {cls.labels.en && (
              <p className="mt-0.5 text-xs text-muted-foreground">{cls.labels.en}</p>
            )}
          </div>
          <code className="shrink-0 rounded bg-muted/50 px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
            {cls.local_name}
          </code>
        </div>
      </CardHeader>
      <CardContent>
        {cls.comments.zh && (
          <p className="mb-2 text-xs leading-relaxed text-muted-foreground">{cls.comments.zh}</p>
        )}
        {cls.examples.length > 0 && (
          <p className="text-xs italic text-muted-foreground/70">
            示例: {cls.examples.join('、')}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function groupByDomain(classes: OwlClass[]): Record<string, OwlClass[]> {
  const result: Record<string, OwlClass[]> = { '': [] };
  for (const cls of classes) {
    const tag = cls.domain_tag || '';
    if (!result[tag]) result[tag] = [];
    result[tag].push(cls);
  }
  return result;
}
