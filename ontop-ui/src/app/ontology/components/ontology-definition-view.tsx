'use client';

import { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2 } from 'lucide-react';
import { ontology as ontologyApi, type TtlOntology } from '@/lib/api';
import { ClassCardsView } from './class-cards-view';
import { PropertiesTableView } from './properties-table';
import { ShaclConstraintsView } from './shacl-constraints-view';

export function OntologyDefinitionView({ ttlPath }: { ttlPath: string }) {
  const [data, setData] = useState<TtlOntology | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!ttlPath) return;
    setLoading(true);
    ontologyApi
      .getContent(ttlPath)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [ttlPath]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        选择 TTL 文件查看本体定义
      </div>
    );
  }

  const { classes, object_properties, data_properties, shacl_constraints } = data;

  return (
    <div className="flex-1 overflow-y-auto p-4 h-full">
      {/* Stats bar */}
      <div className="mb-4 flex gap-3 text-xs text-muted-foreground">
        <span>{classes.length} 个类</span>
        <span>·</span>
        <span>{object_properties.length} 个对象属性</span>
        <span>·</span>
        <span>{data_properties.length} 个数据属性</span>
        <span>·</span>
        <span>{shacl_constraints.length} 条约束</span>
      </div>

      <Tabs defaultValue="classes">
        <TabsList className="bg-muted/50">
          <TabsTrigger value="classes">类定义 ({classes.length})</TabsTrigger>
          <TabsTrigger value="obj-props">对象属性 ({object_properties.length})</TabsTrigger>
          <TabsTrigger value="data-props">数据属性 ({data_properties.length})</TabsTrigger>
          <TabsTrigger value="shacl">SHACL约束 ({shacl_constraints.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="classes" className="mt-4">
          <ClassCardsView classes={classes} />
        </TabsContent>

        <TabsContent value="obj-props" className="mt-4">
          <PropertiesTableView properties={object_properties} type="object" />
        </TabsContent>

        <TabsContent value="data-props" className="mt-4">
          <PropertiesTableView properties={data_properties} type="data" />
        </TabsContent>

        <TabsContent value="shacl" className="mt-4">
          <ShaclConstraintsView constraints={shacl_constraints} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
