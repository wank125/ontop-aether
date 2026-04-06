'use client';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ShieldAlert } from 'lucide-react';
import type { ShaclConstraint } from '@/lib/api';

export function ShaclConstraintsView({ constraints }: { constraints: ShaclConstraint[] }) {
  if (constraints.length === 0) {
    return <p className="text-sm text-muted-foreground">无约束规则</p>;
  }

  return (
    <Accordion type="multiple" className="space-y-2">
      {constraints.map((c) => (
        <AccordionItem
          key={c.local_name}
          value={c.local_name}
          className="rounded-lg border border-border bg-card"
        >
          <AccordionTrigger className="px-4 py-3 hover:no-underline">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-amber-500" />
              <span className="font-medium text-sm">{c.labels.zh || c.local_name}</span>
              <code className="rounded bg-muted/50 px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
                {c.local_name}
              </code>
              <Badge variant="secondary" className="text-xs">target: {c.target_class}</Badge>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            {c.comments.zh && (
              <p className="mb-4 text-sm leading-relaxed text-muted-foreground">{c.comments.zh}</p>
            )}

            {c.properties.length > 0 && (
              <div className="mb-4">
                <h5 className="mb-2 text-xs font-medium">属性约束</h5>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>路径</TableHead>
                      <TableHead>最小数量</TableHead>
                      <TableHead>最小值</TableHead>
                      <TableHead>数据类型</TableHead>
                      <TableHead>固定值</TableHead>
                      <TableHead>枚举值</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {c.properties.map((p, i) => (
                      <TableRow key={i}>
                        <TableCell>
                          {p.path ? (
                            <code className="text-xs">{p.path}</code>
                          ) : p.path_inverse ? (
                            <span className="text-xs">
                              <span className="text-muted-foreground">inverse(</span>
                              <code>{p.path_inverse}</code>
                              <span className="text-muted-foreground">)</span>
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground/50">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs">
                          {p.min_count != null ? p.min_count : '—'}
                        </TableCell>
                        <TableCell className="text-xs">
                          {p.min_inclusive != null ? `>= ${p.min_inclusive}` :
                           p.min_exclusive != null ? `> ${p.min_exclusive}` : '—'}
                        </TableCell>
                        <TableCell>
                          {p.datatype ? (
                            <code className="text-xs">{p.datatype}</code>
                          ) : '—'}
                        </TableCell>
                        <TableCell className="text-xs">
                          {p.has_value || '—'}
                        </TableCell>
                        <TableCell className="text-xs">
                          {p.in_values.length > 0 ? p.in_values.join(', ') : '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {c.sparql_constraints.length > 0 && (
              <div>
                <h5 className="mb-2 text-xs font-medium">SPARQL 约束</h5>
                {c.sparql_constraints.map((s, i) => (
                  <div key={i} className="mb-2 rounded-lg bg-destructive/5 border border-destructive/20 p-3">
                    <p className="mb-2 text-xs font-medium text-destructive">{s.message}</p>
                    <pre className="overflow-x-auto rounded bg-muted/50 p-3 text-xs font-mono leading-relaxed">
                      {s.select}
                    </pre>
                  </div>
                ))}
              </div>
            )}
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
