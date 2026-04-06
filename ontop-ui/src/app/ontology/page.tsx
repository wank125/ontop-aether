'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Network } from 'vis-network';
import { DataSet } from 'vis-data';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { GitGraph, BookOpen, Info, Loader2, ZoomIn, ZoomOut, Maximize } from 'lucide-react';
import { mappings, ontology as ontologyApi, type MappingFile } from '@/lib/api';
import { OntologyDefinitionView } from './components/ontology-definition-view';

// ── Data types ──────────────────────────────────────────

interface ParsedGraph {
  classes: string[];
  edges: Array<{ id: string; source: string; target: string; label: string }>;
  nodeInfo: Record<string, { fields: string[] }>;
}

function parseMappingToGraph(mappingTargets: Array<{ target: string }>): ParsedGraph {
  const classSet = new Set<string>();
  const edges: ParsedGraph['edges'] = [];
  const nodeInfo: ParsedGraph['nodeInfo'] = {};

  const classFromUri = (uri: string): string => uri.split('/').pop()!;
  // Extract class name from a URI path like .../ClassName/key=value → ClassName
  const classFromPath = (uri: string): string => {
    const segments = uri.split('/').filter(Boolean);
    // Last segment is like "ClassName" or "key=value"
    const last = segments[segments.length - 1] || '';
    if (last.includes('=')) return segments[segments.length - 2] || last;
    return last;
  };

  // First pass: identify all classes from "a <...>" patterns only
  for (const m of mappingTargets) {
    for (const cm of m.target.matchAll(/a\s+<([^>]+)>/g)) {
      classSet.add(classFromUri(cm[1]));
    }
  }

  // Second pass: parse edges and fields
  for (const m of mappingTargets) {
    const target = m.target;

    if (target.includes('#ref-')) {
      // Retail-style: inline ref- relationship in class mapping
      const subjectUri = target.match(/^<([^>]+)>/)?.[1] || '';
      const subjectSegments = subjectUri.split('/').filter(Boolean);
      const subjectClass = subjectSegments.length >= 2 ? subjectSegments[subjectSegments.length - 2] : 'unknown';
      const objectUri = [...target.matchAll(/<[^>]+#ref-[^>]+>\s+<([^>]+)>/g)];
      const objectSegments = objectUri.length > 0 ? objectUri[0][1].split('/').filter(Boolean) : [];
      const objectClass = objectSegments.length >= 2 ? objectSegments[objectSegments.length - 2] : 'unknown';
      const propMatch = target.match(/#([^>]*ref-[^>]*)>/);
      const propName = propMatch?.[1] || 'ref';

      if (classSet.has(subjectClass) && classSet.has(objectClass)) {
        edges.push({
          id: `e-${subjectClass}-${propName}-${objectClass}`,
          source: subjectClass,
          target: objectClass,
          label: propName,
        });
      }
    } else if (target.match(/^<[^>]+>\s+<[^>]+>\s+<[^>]+>/)) {
      // Lvfa-style: standalone object property mapping: <subject> <predicate> <object> .
      // No "a <class>" pattern — this is a relationship triple
      const subjectMatch = target.match(/^<([^>]+)>/);
      const predMatch = [...target.matchAll(/\s+<([^>]+)>\s+/g)];
      const objectMatch = target.match(/<([^>]+>\s*\.\s*$)/) || target.match(/\s+<([^>]+)>\s*\.\s*$/);

      if (subjectMatch && predMatch.length >= 1 && objectMatch) {
        const subjectClass = classFromPath(subjectMatch[1]);
        const predUri = predMatch[0][1];
        const propName = classFromUri(predUri);
        const objectClass = classFromPath(objectMatch[1]);

        if (classSet.has(subjectClass) && classSet.has(objectClass) && propName !== 'type') {
          edges.push({
            id: `e-${subjectClass}-${propName}-${objectClass}`,
            source: subjectClass,
            target: objectClass,
            label: propName,
          });
        }
      }
    } else {
      // Class mapping with data properties
      const classMatch = target.match(/a\s+<([^>]+)>/);
      if (!classMatch) continue;
      const className = classFromUri(classMatch[1]);

      const props: string[] = [];
      for (const pm of target.matchAll(/<[^>]+#([^>]+)>\s+\{/g)) {
        if (!pm[1].startsWith('ref-')) props.push(pm[1]);
      }
      // Also handle full URI data properties (lvfa-style): <.../v1/projectId> {val}^^xsd:type
      for (const pm of target.matchAll(/<[^>]+\/v1\/([^>]+)>\s+\{/g)) {
        if (!props.includes(pm[1])) props.push(pm[1]);
      }

      if (nodeInfo[className]) {
        nodeInfo[className].fields = [...new Set([...nodeInfo[className].fields, ...props])];
      } else {
        nodeInfo[className] = { fields: props };
      }
    }
  }

  return { classes: Array.from(classSet), edges, nodeInfo };
}

// ── Vis.js network options (dark theme + physics) ────────

function getNetworkOptions() {
  return {
    physics: {
      enabled: true,
      barnesHut: {
        gravitationalConstant: -3000,
        centralGravity: 0.3,
        springLength: 200,
        springConstant: 0.04,
        damping: 0.09,
        avoidOverlap: 0.2,
      },
      stabilization: {
        enabled: true,
        iterations: 200,
        updateInterval: 25,
      },
      maxVelocity: 50,
      minVelocity: 0.3,
      solver: 'barnesHut',
      timestep: 0.5,
    },
    nodes: {
      shape: 'box',
      borderWidth: 2,
      borderWidthSelected: 3,
      color: {
        background: 'oklch(0.25 0.06 280)',
        border: 'oklch(0.55 0.15 280)',
        highlight: {
          background: 'oklch(0.30 0.10 280)',
          border: 'oklch(0.70 0.18 280)',
        },
        hover: {
          background: 'oklch(0.28 0.08 280)',
          border: 'oklch(0.65 0.16 280)',
        },
      },
      font: {
        color: '#e2e8f0',
        size: 14,
        face: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
        bold: { color: '#f1f5f9', size: 15 },
      },
      margin: { top: 10, bottom: 10, left: 15, right: 15 },
      shadow: {
        enabled: true,
        color: 'oklch(0.70 0.15 280 / 0.2)',
        size: 10,
        x: 0,
        y: 4,
      },
    },
    edges: {
      arrows: {
        to: {
          enabled: true,
          scaleFactor: 0.8,
          type: 'arrow',
        },
      },
      color: {
        color: 'oklch(0.50 0.08 270)',
        highlight: 'oklch(0.70 0.15 280)',
        hover: 'oklch(0.60 0.12 280)',
        opacity: 0.8,
      },
      font: {
        color: 'oklch(0.65 0.08 200)',
        size: 11,
        face: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
        strokeWidth: 3,
        strokeColor: 'oklch(0.13 0.02 270)',
        align: 'middle',
      },
      smooth: {
        enabled: true,
        type: 'continuous',
        roundness: 0.5,
      },
      width: 1.5,
      selectionWidth: 2,
      hoverWidth: 2,
    },
    interaction: {
      hover: true,
      tooltipDelay: 200,
      navigationButtons: false,
      keyboard: {
        enabled: true,
      },
      multiselect: false,
      dragNodes: true,
      dragView: true,
      zoomView: true,
    },
    layout: {
      improvedLayout: true,
    },
  };
}

// ── Page Component ──────────────────────────────────────

export default function OntologyPage() {
  // File lists
  const [obdaFiles, setObdaFiles] = useState<MappingFile[]>([]);
  const [ttlFiles, setTtlFiles] = useState<MappingFile[]>([]);

  // Active tab
  const [activeTab, setActiveTab] = useState<string>('graph');

  // Selected files
  const [selectedObdaPath, setSelectedObdaPath] = useState<string>('');
  const [selectedTtlPath, setSelectedTtlPath] = useState<string>('');

  // Graph state
  const [loading, setLoading] = useState(false);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [parsedData, setParsedData] = useState<ParsedGraph | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const networkRef = useRef<Network | null>(null);

  // Load file lists
  useEffect(() => {
    mappings.listFiles().then((list) => {
      setObdaFiles(list);
      if (list.length > 0) setSelectedObdaPath(list[0].path);
    });
    ontologyApi.listFiles().then((list) => {
      setTtlFiles(list);
      if (list.length > 0) setSelectedTtlPath(list[0].path);
    });
  }, []);

  // Fetch mapping data when selectedObdaPath changes
  useEffect(() => {
    if (!selectedObdaPath) return;
    setLoading(true);
    mappings
      .getContent(selectedObdaPath)
      .then((content) => {
        const graph = parseMappingToGraph(content.mappings);
        setParsedData(graph);
      })
      .catch(() => {
        setParsedData(null);
      })
      .finally(() => setLoading(false));
  }, [selectedObdaPath]);

  // Initialize Vis.js network when parsedData and container are ready
  useEffect(() => {
    if (!parsedData || parsedData.classes.length === 0 || !containerRef.current) return;

    // Destroy previous network
    if (networkRef.current) {
      networkRef.current.destroy();
      networkRef.current = null;
    }

    const visNodes = new DataSet(
      parsedData.classes.map((cls) => {
        const fields = parsedData.nodeInfo[cls]?.fields ?? [];
        const title = fields.length > 0
          ? `<div style="font-family:monospace;font-size:12px;padding:4px 0;"><strong>${cls}</strong><hr style="border-color:oklch(0.30 0.05 280);margin:4px 0"/>${fields.map((f) => `<div style="padding:2px 0">• ${f}</div>`).join('')}</div>`
          : `<div style="font-family:monospace;font-size:12px;"><strong>${cls}</strong></div>`;
        return { id: cls, label: cls, title };
      }),
    );

    const visEdges = new DataSet(
      parsedData.edges.map((e) => ({
        id: e.id,
        from: e.source,
        to: e.target,
        label: e.label.replace(/^ref-/, ''),
      })),
    );

    const network = new Network(
      containerRef.current,
      { nodes: visNodes, edges: visEdges },
      getNetworkOptions(),
    );

    network.on('click', (params) => {
      if (params.nodes && params.nodes.length > 0) {
        setSelectedNode(params.nodes[0] as string);
      } else {
        setSelectedNode(null);
      }
    });

    network.on('stabilizationIterationsDone', () => {
      network.fit({ animation: { duration: 500, easingFunction: 'easeInOutQuad' } });
    });

    networkRef.current = network;

    return () => {
      if (networkRef.current) {
        networkRef.current.destroy();
        networkRef.current = null;
      }
    };
  }, [parsedData]);

  const handleFit = useCallback(() => {
    networkRef.current?.fit({ animation: { duration: 300, easingFunction: 'easeInOutQuad' } });
  }, []);

  const handleZoomIn = useCallback(() => {
    const scale = networkRef.current?.getScale() ?? 1;
    networkRef.current?.moveTo({ scale: scale * 1.3, animation: { duration: 200, easingFunction: 'easeInOutQuad' } });
  }, []);

  const handleZoomOut = useCallback(() => {
    const scale = networkRef.current?.getScale() ?? 1;
    networkRef.current?.moveTo({ scale: scale / 1.3, animation: { duration: 200, easingFunction: 'easeInOutQuad' } });
  }, []);

  const nodeInfo = parsedData?.nodeInfo ?? {};
  const graphEdges = parsedData?.edges ?? [];
  const hasNodes = parsedData && parsedData.classes.length > 0;

  // File selector for current tab
  const currentFiles = activeTab === 'graph' ? obdaFiles : ttlFiles;
  const currentPath = activeTab === 'graph' ? selectedObdaPath : selectedTtlPath;
  const handleFileChange = activeTab === 'graph' ? setSelectedObdaPath : setSelectedTtlPath;

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 56px - 48px)' }}>
      {/* Header */}
      <div className="border-b border-border pb-4 mb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-[oklch(0.70_0.15_280)] to-[oklch(0.65_0.18_200)]">
              <GitGraph className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-foreground">本体可视化</h1>
              <p className="text-sm text-muted-foreground">物理模拟动态图谱</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Select value={currentPath} onValueChange={handleFileChange}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="选择文件" />
              </SelectTrigger>
              <SelectContent>
                {currentFiles.map((file) => (
                  <SelectItem key={file.path} value={file.path}>
                    {file.filename}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col flex-1 overflow-hidden">
        <div className="px-1">
          <TabsList>
            <TabsTrigger value="graph">
              <GitGraph className="mr-1.5 h-4 w-4" />
              关系图谱
            </TabsTrigger>
            <TabsTrigger value="ontology">
              <BookOpen className="mr-1.5 h-4 w-4" />
              本体定义
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Graph Tab */}
        <TabsContent value="graph" className="flex-1 overflow-hidden mt-0">
          <div className="flex h-full overflow-hidden">
            {/* Vis.js Canvas */}
            <div className="relative flex-1 bg-muted/20">
              <div ref={containerRef} className="h-full w-full" />

              {loading && (
                <div className="absolute inset-0 flex items-center justify-center bg-muted/20">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              )}

              {!loading && !hasNodes && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center text-muted-foreground">
                    <GitGraph className="mx-auto mb-3 h-12 w-12 opacity-50" />
                    <p>选择映射文件查看本体图谱</p>
                  </div>
                </div>
              )}

              {hasNodes && !loading && (
                <>
                  {/* Zoom controls */}
                  <div className="absolute bottom-4 left-4 flex flex-col gap-1.5">
                    <Button variant="outline" size="icon" className="h-8 w-8 bg-card border-border" onClick={handleZoomIn}>
                      <ZoomIn className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="icon" className="h-8 w-8 bg-card border-border" onClick={handleZoomOut}>
                      <ZoomOut className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="icon" className="h-8 w-8 bg-card border-border" onClick={handleFit}>
                      <Maximize className="h-4 w-4" />
                    </Button>
                  </div>

                  {/* Legend */}
                  <div className="absolute bottom-4 left-20 rounded-lg border border-border bg-card p-3">
                    <h4 className="mb-2 text-xs font-medium">图例</h4>
                    <div className="space-y-2 text-xs text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <div className="h-4 w-8 rounded border border-primary bg-primary/20" />
                        <span>类 (Entity Type)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <svg className="h-4 w-8" viewBox="0 0 32 16">
                          <line x1="4" y1="8" x2="28" y2="8" stroke="oklch(0.55 0.10 270)" strokeWidth="1.5" />
                          <polygon points="28,8 22,5 22,11" fill="oklch(0.55 0.10 270)" />
                        </svg>
                        <span>对象属性 (关系)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Info className="h-3 w-3" />
                        <span>点击节点查看详情 | 拖拽节点移动</span>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Right Panel */}
            <div className="w-72 border-l border-border p-4 overflow-y-auto">
              {selectedNode && nodeInfo[selectedNode] ? (
                <Card>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">{selectedNode}</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <h4 className="mb-2 text-xs font-medium text-muted-foreground">字段</h4>
                    <div className="space-y-1">
                      {nodeInfo[selectedNode].fields.length > 0 ? (
                        nodeInfo[selectedNode].fields.map((field) => (
                          <div key={field} className="rounded bg-muted/50 px-2 py-1 font-mono text-xs">
                            {field}
                          </div>
                        ))
                      ) : (
                        <p className="text-xs text-muted-foreground">无数据属性</p>
                      )}
                    </div>

                    {graphEdges.some((e) => e.source === selectedNode || e.target === selectedNode) && (
                      <>
                        <h4 className="mb-2 mt-4 text-xs font-medium text-muted-foreground">关系</h4>
                        <div className="space-y-1">
                          {graphEdges
                            .filter((e) => e.source === selectedNode)
                            .map((e) => (
                              <div key={e.id} className="rounded bg-muted/50 px-2 py-1 text-xs">
                                <span className="text-primary">{e.label}</span> → {e.target}
                              </div>
                            ))}
                          {graphEdges
                            .filter((e) => e.target === selectedNode)
                            .map((e) => (
                              <div key={e.id} className="rounded bg-muted/50 px-2 py-1 text-xs">
                                {e.source} → <span className="text-primary">{e.label}</span>
                              </div>
                            ))}
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>
              ) : (
                <Card className="border-dashed">
                  <CardContent className="flex flex-col items-center justify-center py-8 text-center">
                    <GitGraph className="mb-2 h-8 w-8 text-muted-foreground opacity-50" />
                    <p className="text-sm text-muted-foreground">点击节点查看详细信息</p>
                  </CardContent>
                </Card>
              )}

              {/* Stats */}
              <Card className="mt-4">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">图谱统计</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">实体类</span>
                    <Badge variant="secondary">{parsedData?.classes.length ?? 0}</Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">关系</span>
                    <Badge variant="secondary">{parsedData?.edges.length ?? 0}</Badge>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* Ontology Definition Tab */}
        <TabsContent value="ontology" className="flex-1 overflow-y-auto mt-0">
          {selectedTtlPath ? (
            <OntologyDefinitionView ttlPath={selectedTtlPath} />
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              <div className="text-center">
                <BookOpen className="mx-auto mb-3 h-12 w-12 opacity-50" />
                <p>选择 TTL 文件查看本体定义</p>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
