'use client';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import type { OwlObjectProperty, OwlDataProperty } from '@/lib/api';

export function PropertiesTableView({
  properties,
  type,
}: {
  properties: OwlObjectProperty[] | OwlDataProperty[];
  type: 'object' | 'data';
}) {
  if (properties.length === 0) {
    return <p className="text-sm text-muted-foreground">无属性定义</p>;
  }

  if (type === 'object') {
    return <ObjectPropertiesTable properties={properties as OwlObjectProperty[]} />;
  }
  return <DataPropertiesTable properties={properties as OwlDataProperty[]} />;
}

function ObjectPropertiesTable({ properties }: { properties: OwlObjectProperty[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-40">中文名</TableHead>
          <TableHead className="w-32">属性名</TableHead>
          <TableHead className="w-28">域 (Domain)</TableHead>
          <TableHead className="w-28">范围 (Range)</TableHead>
          <TableHead className="w-28">逆向属性</TableHead>
          <TableHead>说明</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {properties.map((prop) => (
          <TableRow key={prop.local_name}>
            <TableCell className="font-medium">{prop.labels.zh || prop.local_name}</TableCell>
            <TableCell>
              <code className="rounded bg-muted/50 px-1.5 py-0.5 text-xs font-mono">{prop.local_name}</code>
            </TableCell>
            <TableCell>
              <Badge variant="secondary" className="text-xs">{prop.domain}</Badge>
            </TableCell>
            <TableCell>
              <Badge variant="secondary" className="text-xs">{prop.range}</Badge>
            </TableCell>
            <TableCell>
              {prop.inverse_of ? (
                <code className="text-xs text-muted-foreground">{prop.inverse_of}</code>
              ) : (
                <span className="text-xs text-muted-foreground/50">—</span>
              )}
            </TableCell>
            <TableCell className="text-xs text-muted-foreground">
              {prop.comments.zh || ''}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function DataPropertiesTable({ properties }: { properties: OwlDataProperty[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-40">中文名</TableHead>
          <TableHead className="w-32">属性名</TableHead>
          <TableHead className="w-28">所属类</TableHead>
          <TableHead className="w-28">类型</TableHead>
          <TableHead>说明</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {properties.map((prop) => (
          <TableRow key={prop.local_name}>
            <TableCell className="font-medium">{prop.labels.zh || prop.local_name}</TableCell>
            <TableCell>
              <code className="rounded bg-muted/50 px-1.5 py-0.5 text-xs font-mono">{prop.local_name}</code>
            </TableCell>
            <TableCell>
              <Badge variant="secondary" className="text-xs">{prop.domain}</Badge>
            </TableCell>
            <TableCell>
              <code className="text-xs text-muted-foreground">{prop.range}</code>
            </TableCell>
            <TableCell className="text-xs text-muted-foreground">
              {prop.comments.zh || ''}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
