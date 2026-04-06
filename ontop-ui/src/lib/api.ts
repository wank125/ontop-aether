const API_BASE = '/api/v1';

function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token');
}

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getAuthToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Internal-Request': 'true',
    ...(options?.headers as Record<string, string>),
  };
  // Attach Bearer token if available (skip for auth endpoints)
  if (token && !path.startsWith('/auth/')) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  // Auto-redirect on 401
  if (res.status === 401 && !path.startsWith('/auth/')) {
    localStorage.removeItem('auth_token');
    sessionStorage.removeItem('auth_token');
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
    throw new Error('未登录或会话已过期');
  }

  if (res.status === 204) return undefined as T;
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || res.statusText);
  }
  return res.json();
}

// ── Types ──────────────────────────────────────────────

export interface DataSource {
  id: string;
  name: string;
  jdbc_url: string;
  user: string;
  password: string;
  driver: string;
  created_at: string;
}

export interface BootstrapRequest {
  base_iri?: string;
  output_dir?: string;
  mode?: 'full' | 'partial';
  tables?: string[];
  include_dependencies?: boolean;
  activate_after_generate?: boolean;
}

export interface BootstrapPreview {
  requested_tables: string[];
  resolved_tables: string[];
  added_dependencies: string[];
  warnings: string[];
  estimated_classes: string[];
  estimated_object_properties: Array<{
    from: string;
    name: string;
    to: string;
  }>;
}

export interface BootstrapResult {
  version: string;
  mode: 'full' | 'partial';
  requested_tables: string[];
  resolved_tables: string[];
  added_dependencies: string[];
  ontology_path: string;
  mapping_path: string;
  properties_path: string;
  manifest_path: string;
  selected_tables_path: string;
  output: string;
}

export interface MappingRule {
  mapping_id: string;
  target: string;
  source: string;
}

export interface MappingContent {
  prefixes: Record<string, string>;
  mappings: MappingRule[];
}

export interface MappingFile {
  path: string;
  filename: string;
  modified_at?: number;
}

export interface QueryHistoryEntry {
  id: string;
  query: string;
  timestamp: string;
  result_count?: number;
}

export interface SparqlResults {
  head: { vars: string[] };
  results: { bindings: Array<Record<string, { value: string; type?: string }>> };
}

// ── Data Sources ───────────────────────────────────────

export const datasources = {
  list: () => api<DataSource[]>('/datasources'),
  get: (id: string) => api<DataSource>(`/datasources/${id}`),
  create: (data: { name: string; jdbc_url: string; user: string; password: string; driver: string }) =>
    api<DataSource>('/datasources', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<Omit<DataSource, 'id' | 'created_at'>>) =>
    api<DataSource>(`/datasources/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) =>
    api<void>(`/datasources/${id}`, { method: 'DELETE' }),
  test: (id: string) =>
    api<{ connected: boolean; message: string }>(`/datasources/${id}/test`, { method: 'POST' }),
  schemas: (id: string) =>
    api<{ schemas: string[] }>(`/datasources/${id}/schemas`),
  schema: (id: string, schemaFilter?: string) =>
    api<any>(`/datasources/${id}/schema${schemaFilter ? `?schema_filter=${encodeURIComponent(schemaFilter)}` : ''}`),
  bootstrapPreview: (id: string, data: BootstrapRequest) =>
    api<BootstrapPreview>(`/datasources/${id}/bootstrap-preview`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  bootstrap: (id: string, data: BootstrapRequest) =>
    api<BootstrapResult>(
      `/datasources/${id}/bootstrap`,
      { method: 'POST', body: JSON.stringify(data) },
    ),
  getLatestBootstrap: (id: string) =>
    api<BootstrapResult | null>(`/datasources/${id}/bootstrap/latest`),
};

// ── Mappings ───────────────────────────────────────────

export const mappings = {
  listFiles: () => api<MappingFile[]>('/mappings'),
  getContent: (path: string) =>
    api<MappingContent>(`/mappings/content?path=${encodeURIComponent(path)}`),
  saveContent: (path: string, content: MappingContent) =>
    api<{ success: boolean }>(`/mappings/content?path=${encodeURIComponent(path)}`, {
      method: 'PUT',
      body: JSON.stringify(content),
    }),
  validate: (path: string, data?: { ontology_path?: string; properties_path?: string }) =>
    api<{ valid: boolean; errors: string[] }>(`/mappings/validate?path=${encodeURIComponent(path)}`, {
      method: 'POST',
      body: JSON.stringify(data || {}),
    }),
  restartEndpoint: (data?: { ontology_path?: string; mapping_path?: string; properties_path?: string; port?: number }) =>
    api<{ success: boolean; message: string }>('/mappings/restart-endpoint', {
      method: 'POST',
      body: JSON.stringify(data || {}),
    }),
};

// ── SPARQL ─────────────────────────────────────────────

export const sparql = {
  query: (query: string, format = 'json') =>
    api<SparqlResults>('/sparql/query', {
      method: 'POST',
      body: JSON.stringify({ query, format }),
    }),
  reformulate: (query: string) =>
    api<{ sql: string }>('/sparql/reformulate', {
      method: 'POST',
      body: JSON.stringify({ query }),
    }),
  history: () => api<QueryHistoryEntry[]>('/sparql/history'),
  deleteHistory: (id: string) =>
    api<void>(`/sparql/history/${id}`, { method: 'DELETE' }),
  endpointStatus: () =>
    api<{ running: boolean; port: number; ontology_path: string; mapping_path: string; properties_path: string }>('/sparql/endpoint-status'),
};

// ── Ontology (TTL) ────────────────────────────────────

export interface BilingualLabel {
  zh: string;
  en: string;
}

export interface OwlClass {
  name: string;
  local_name: string;
  labels: BilingualLabel;
  comments: BilingualLabel;
  examples: string[];
  domain_tag: string;
}

export interface OwlObjectProperty {
  name: string;
  local_name: string;
  labels: BilingualLabel;
  comments: BilingualLabel;
  domain: string;
  range: string;
  inverse_of: string;
}

export interface OwlDataProperty {
  name: string;
  local_name: string;
  labels: BilingualLabel;
  comments: BilingualLabel;
  domain: string;
  range: string;
}

export interface ShaclPropertyConstraint {
  path: string;
  path_inverse: string;
  min_count: number | null;
  min_inclusive: number | null;
  min_exclusive: number | null;
  datatype: string;
  has_value: string;
  in_values: string[];
}

export interface ShaclSparqlConstraint {
  message: string;
  select: string;
}

export interface ShaclConstraint {
  name: string;
  local_name: string;
  labels: BilingualLabel;
  comments: BilingualLabel;
  target_class: string;
  properties: ShaclPropertyConstraint[];
  sparql_constraints: ShaclSparqlConstraint[];
}

export interface TtlOntology {
  metadata: {
    labels: BilingualLabel;
    comments: BilingualLabel;
    version: string;
    version_iri: string;
  };
  classes: OwlClass[];
  object_properties: OwlObjectProperty[];
  data_properties: OwlDataProperty[];
  shacl_constraints: ShaclConstraint[];
}

export const ontology = {
  listFiles: () => api<MappingFile[]>('/ontology'),
  getContent: (path: string) =>
    api<TtlOntology>(`/ontology/content?path=${encodeURIComponent(path)}`),
};

// ── AI ─────────────────────────────────────────────────

export interface AIStep {
  step: string;
  message?: string;
  sparql?: string;
  sql?: string;
  results?: string;
  answer?: string;
}

export interface AIConfig {
  llm_provider?: string;
  llm_base_url: string;
  llm_api_key: string;
  llm_model: string;
  llm_temperature: number;
  max_tokens: number;
}

export interface QuickQuestion {
  id: string;
  question: string;
}

export interface OntologySummary {
  classes: string[];
  data_properties: string[];
  object_properties: string[];
  prefixes: Record<string, string>;
}

export interface ProviderPreset {
  label: string;
  base_url: string;
  models: string[];
}

export interface ModelDiscoveryResponse {
  provider: string;
  base_url: string;
  models: string[];
  source: 'remote' | 'preset' | 'manual';
  warning?: string | null;
  error?: string;
}

// ── Workbench Types ────────────────────────────────────

export interface ClassCandidate {
  table_name: string;
  class_name: string;
  class_iri: string;
  label: string;
  status: 'accepted' | 'renamed' | 'ignored';
}

export interface DataPropertyCandidate {
  table_name: string;
  column_name: string;
  property_name: string;
  property_iri: string;
  datatype: string;
  is_nullable: boolean;
  is_pk: boolean;
  is_fk: boolean;
  status: 'accepted' | 'renamed' | 'ignored' | 'system';
  is_label?: boolean;
}

export interface ObjectPropertyCandidate {
  from_table: string;
  to_table: string;
  property_name: string;
  property_iri: string;
  fk_columns: string[];
  target_columns?: string[];
  status: 'accepted' | 'renamed' | 'ignored' | 'external';
}

export interface SemanticCandidates {
  candidates: {
    classes: ClassCandidate[];
    data_properties: DataPropertyCandidate[];
    object_properties: ObjectPropertyCandidate[];
  };
}

export const workbench = {
  analyze: (datasourceId: string, tables: string[], baseIri?: string) =>
    api<SemanticCandidates>('/workbench/analyze', {
      method: 'POST',
      body: JSON.stringify({
        datasource_id: datasourceId,
        tables,
        base_iri: baseIri || 'http://example.com/ontop/',
      }),
    }),
  generate: (datasourceId: string, tables: string[], baseIri?: string) =>
    api<BootstrapResult>('/workbench/generate', {
      method: 'POST',
      body: JSON.stringify({
        datasource_id: datasourceId,
        tables,
        base_iri: baseIri || 'http://example.com/ontop/',
      }),
    }),
};

export const ai = {
  ontologySummary: () =>
    api<OntologySummary>('/ai/ontology-summary'),
  streamQuery: async function* (question: string): AsyncGenerator<AIStep> {
    const res = await fetch(`${API_BASE}/ai/query?question=${encodeURIComponent(question)}`);
    if (!res.ok) throw new Error(`AI query failed: ${res.statusText}`);
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            yield JSON.parse(line.slice(6));
          } catch { /* skip malformed */ }
        }
      }
    }
    // flush remaining
    if (buffer.startsWith('data: ')) {
      try { yield JSON.parse(buffer.slice(6)); } catch { /* skip */ }
    }
  },

  // ── AI Config ────────────────────────────────────
  getConfig: () =>
    api<AIConfig>('/ai/config'),
  updateConfig: (data: Partial<AIConfig>) =>
      api<{ success: boolean; message: string }>('/ai/config', {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
  discoverModels: (data: { provider?: string; base_url?: string; api_key?: string }) =>
    api<ModelDiscoveryResponse>('/ai/models', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  getSystemPrompt: () =>
    api<{ system_prompt: string }>('/ai/system-prompt'),
  updateSystemPrompt: (system_prompt: string) =>
    api<{ success: boolean; message: string }>('/ai/system-prompt', {
      method: 'PUT',
      body: JSON.stringify({ system_prompt }),
    }),
  getQuickQuestions: () =>
    api<{ questions: QuickQuestion[] }>('/ai/quick-questions'),
  updateQuickQuestions: (questions: QuickQuestion[]) =>
    api<{ success: boolean; message: string }>('/ai/quick-questions', {
      method: 'PUT',
      body: JSON.stringify({ questions }),
    }),
};

// ── Publishing ───────────────────────────────────────

export interface PublishingConfig {
  id: string;
  api_enabled: boolean;
  api_key: string;
  cors_origins: string;
  mcp_enabled: boolean;
  mcp_port: number;
  mcp_selected_tools: string[];
  skills_enabled: boolean;
  skills_selected_formats: string[];
}

export interface McpStatus {
  running: boolean;
  tools: string[];
  transport: string;
}

export interface AuditLogEntry {
  id: string;
  query: string;
  timestamp: string;
  result_count?: number;
  source_ip: string;
  caller: string;
  duration_ms?: number;
  status: string;
  error_message: string;
}

export interface AuditStats {
  total_queries: number;
  ok_count: number;
  error_count: number;
  success_rate: number;
  avg_duration_ms: number;
  by_caller: Record<string, number>;
  recent_errors: AuditLogEntry[];
}

export interface AuditLogsResponse {
  items: AuditLogEntry[];
  total: number;
  page: number;
  page_size: number;
}

export interface DataCard {
  schema_version: string;
  generated_at: string;
  ontology: { title: string; version: string; iri: string };
  statistics: {
    class_count: number;
    data_property_count: number;
    object_property_count: number;
    shacl_constraint_count: number;
    mapping_rule_count: number;
  };
  class_breakdown: Array<{ name: string; property_count: number; uri?: string }>;
  data_source: { type: string; mapping_path: string; ontology_path: string };
  data_source_health: { endpoint_reachable: boolean; endpoint_url: string };
  instance_estimates: Record<string, number>;
  last_updated: string;
}

export const publishing = {
  getConfig: () =>
    api<PublishingConfig>('/publishing/config'),
  updateConfig: (data: Partial<PublishingConfig>) =>
    api<PublishingConfig>('/publishing/config', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  getApiStatus: () =>
    api<{ status: string; url: string; error?: string }>('/publishing/api/status'),
  generateApiKey: () =>
    api<{ api_key: string }>('/publishing/api/generate-key', { method: 'POST' }),
  getMcpStatus: () =>
    api<McpStatus>('/publishing/mcp/status'),
  startMcp: () =>
    api<McpStatus>('/publishing/mcp/start', { method: 'POST' }),
  stopMcp: () =>
    api<McpStatus>('/publishing/mcp/stop', { method: 'POST' }),
  listMcpTools: () =>
    api<Array<{ name: string; description: string; parameters: any }>>('/publishing/mcp/tools'),
  getMcpConfigSnippet: (target: string) =>
    api<{ target: string; config: any }>(`/publishing/mcp/config-snippet?target=${encodeURIComponent(target)}`),
  generateSkills: (format: string, tools?: string[]) =>
    api<any>(`/publishing/skills/generate?format=${encodeURIComponent(format)}${tools ? `&tools=${tools.join(',')}` : ''}`),
  getAuditLogs: (page: number, pageSize: number, caller?: string, status?: string) =>
    api<AuditLogsResponse>(`/publishing/audit/logs?page=${page}&page_size=${pageSize}${caller ? `&caller=${caller}` : ''}${status ? `&status=${status}` : ''}`),
  getAuditStats: () =>
    api<AuditStats>('/publishing/audit/stats'),
  getDatacard: () =>
    api<DataCard>('/publishing/datacard'),
};

// ── Semantic Annotations ─────────────────────────────────

export type AnnotationStatus = 'pending' | 'accepted' | 'rejected';
export type AnnotationSource = 'llm' | 'human';
export type AnnotationKind  = 'class' | 'data_property' | 'object_property';

export interface SemanticAnnotation {
  id:          string;
  ds_id:       string;
  entity_uri:  string;
  entity_kind: AnnotationKind;
  lang:        string;
  label:       string;
  comment:     string;
  source:      AnnotationSource;
  status:      AnnotationStatus;
  created_at:  string;
  updated_at:  string | null;
}

export interface AnnotationStats {
  pending:  number;
  accepted: number;
  rejected: number;
  total:    number;
}

export interface AnnotationUpsert {
  entity_uri:  string;
  entity_kind: AnnotationKind;
  lang:        string;
  label?:      string;
  comment?:    string;
  source?:     AnnotationSource;
}

export const annotations = {
  /** 列出指定数据源的注释，可按 status 或 entity_kind 过滤 */
  list: (dsId: string, params?: { status?: AnnotationStatus; entity_kind?: AnnotationKind }) => {
    const q = new URLSearchParams();
    if (params?.status)      q.set('status', params.status);
    if (params?.entity_kind) q.set('entity_kind', params.entity_kind);
    const qs = q.toString() ? `?${q}` : '';
    return api<SemanticAnnotation[]>(`/annotations/${dsId}${qs}`);
  },

  /** 各状态数量统计 */
  stats: (dsId: string) =>
    api<AnnotationStats>(`/annotations/${dsId}/stats`),

  /** 手动新增/覆盖一条注释（source=human，直接 accepted） */
  create: (dsId: string, body: AnnotationUpsert) =>
    api<SemanticAnnotation>(`/annotations/${dsId}`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  /** 更新单条注释的状态 */
  updateStatus: (dsId: string, annId: string, status: AnnotationStatus) =>
    api<SemanticAnnotation>(`/annotations/${dsId}/${annId}`, {
      method: 'PUT',
      body: JSON.stringify({ status }),
    }),

  /** 删除单条注释 */
  delete: (dsId: string, annId: string) =>
    api<void>(`/annotations/${dsId}/${annId}`, { method: 'DELETE' }),

  /** 批量更新状态（如"全部接受"） */
  batchStatus: (dsId: string, ids: string[], status: AnnotationStatus) =>
    api<{ updated: number; status: string }>(`/annotations/${dsId}/batch-status`, {
      method: 'POST',
      body: JSON.stringify({ ids, status }),
    }),

  /** 手动触发将 accepted 注释合并到 active TTL */
  merge: (dsId: string) =>
    api<{ merged_entities: number; output_path: string; message: string }>(
      `/annotations/${dsId}/merge`,
      { method: 'POST' },
    ),
};

// ── Business Glossary ────────────────────────────────────

export type GlossaryEntityKind = 'class' | 'data_property' | 'object_property';

export interface GlossaryTerm {
  id:                string;
  ds_id:             string;
  term:              string;
  aliases:           string[];
  entity_uri:        string;
  entity_kind:       GlossaryEntityKind;
  description:       string;
  example_questions: string[];
  source:            'human' | 'llm';
  created_at:        string;
  updated_at:        string | null;
}

export interface GlossaryStats {
  human: number;
  llm:   number;
  total: number;
}

export interface GlossaryTermCreate {
  term:              string;
  entity_uri:        string;
  entity_kind?:      GlossaryEntityKind;
  aliases?:          string[];
  description?:      string;
  example_questions?: string[];
  source?:           'human' | 'llm';
}

export const glossary = {
  /** 列出词汇（默认合并全局词汇） */
  list: (dsId: string, params?: { q?: string; entity_kind?: GlossaryEntityKind; include_global?: boolean }) => {
    const q = new URLSearchParams();
    if (params?.q)              q.set('q', params.q);
    if (params?.entity_kind)    q.set('entity_kind', params.entity_kind);
    if (params?.include_global === false) q.set('include_global', 'false');
    const qs = q.toString() ? `?${q}` : '';
    return api<GlossaryTerm[]>(`/glossary/${dsId}${qs}`);
  },

  /** 各来源数量统计 */
  stats: (dsId: string) =>
    api<GlossaryStats>(`/glossary/${dsId}/stats`),

  /** 创建/覆盖一条词汇 */
  create: (dsId: string, body: GlossaryTermCreate) =>
    api<GlossaryTerm>(`/glossary/${dsId}`, {
      method: 'POST',
      body:   JSON.stringify(body),
    }),

  /** 编辑词汇 */
  update: (dsId: string, termId: string, body: GlossaryTermCreate) =>
    api<GlossaryTerm>(`/glossary/${dsId}/${termId}`, {
      method: 'PUT',
      body:   JSON.stringify(body),
    }),

  /** 删除词汇 */
  delete: (dsId: string, termId: string) =>
    api<{ deleted: boolean }>(`/glossary/${dsId}/${termId}`, { method: 'DELETE' }),

  /** LLM 自动从注释层生成词汇（后台任务） */
  generate: (dsId: string) =>
    api<{ message: string; accepted_annotations: number; estimated_terms: number }>(
      `/glossary/${dsId}/generate`,
      { method: 'POST' },
    ),

  /** 导出全部词汇为 JSON */
  exportJson: (dsId: string) =>
    api<{ ds_id: string; terms: GlossaryTerm[] }>(`/glossary/${dsId}/export`),

  /** 批量导入词汇 */
  importJson: (dsId: string, terms: GlossaryTermCreate[], overwrite = false) =>
    api<{ imported: number; overwrite: boolean }>(`/glossary/${dsId}/import`, {
      method: 'POST',
      body:   JSON.stringify({ terms, overwrite }),
    }),
};

// ── Endpoint Registry ─────────────────────────────────────

export interface EndpointRegistration {
  id:              string;
  ds_id:           string;
  ds_name:         string;
  active_dir:      string;
  ontology_path:   string;
  mapping_path:    string;
  properties_path: string;
  endpoint_url:    string;
  last_bootstrap:  string | null;
  is_current:      number;   // 1 = active
  created_at:      string;
  updated_at:      string | null;
}

export const endpointRegistry = {
  list: () =>
    api<EndpointRegistration[]>('/endpoint-registry'),

  current: () =>
    api<EndpointRegistration | { message: string; current: null }>('/endpoint-registry/current'),

  activate: (dsId: string) =>
    api<{ message: string; ds_id: string; note: string }>(
      `/endpoint-registry/${dsId}/activate`,
      { method: 'PUT' },
    ),
};

// ── Ontology Suggestions ─────────────────────────────────

export type SuggestionType     = 'RENAME_CLASS' | 'RENAME_PROPERTY' | 'ADD_SUBCLASS' | 'REFINE_TYPE' | 'ADD_LABEL';
export type SuggestionPriority = 'high' | 'medium' | 'low';
export type SuggestionStatus   = 'pending' | 'accepted' | 'rejected' | 'applied';

export interface OntologySuggestion {
  id:           string;
  ds_id:        string;
  type:         SuggestionType;
  current_val:  string;
  proposed_val: string;
  reason:       string;
  priority:     SuggestionPriority;
  auto_apply:   boolean;
  status:       SuggestionStatus;
  created_at:   string;
  updated_at:   string | null;
}

export interface SuggestionStats {
  pending:  number;
  accepted: number;
  rejected: number;
  applied:  number;
  total:    number;
}

export const suggestions = {
  analyze: (dsId: string) =>
    api<{ message: string; ds_id: string }>(
      `/suggestions/${dsId}/analyze`,
      { method: 'POST' },
    ),

  list: (dsId: string, params?: { status?: SuggestionStatus; type?: SuggestionType; priority?: SuggestionPriority }) => {
    const q = new URLSearchParams();
    if (params?.status)   q.set('status', params.status);
    if (params?.type)     q.set('type', params.type);
    if (params?.priority) q.set('priority', params.priority);
    const qs = q.toString() ? `?${q}` : '';
    return api<OntologySuggestion[]>(`/suggestions/${dsId}${qs}`);
  },

  stats: (dsId: string) =>
    api<SuggestionStats>(`/suggestions/${dsId}/stats`),

  updateStatus: (dsId: string, sugId: string, status: SuggestionStatus) =>
    api<OntologySuggestion>(`/suggestions/${dsId}/${sugId}/status`, {
      method: 'PUT',
      body:   JSON.stringify({ status }),
    }),

  apply: (dsId: string, sugId: string) =>
    api<{ success: boolean; message: string }>(`/suggestions/${dsId}/${sugId}/apply`, {
      method: 'POST',
    }),

  batchApply: (dsId: string) =>
    api<{ applied: number; skipped: number; results: Array<{ id: string; type: string; success: boolean; message: string }> }>(
      `/suggestions/${dsId}/batch-apply`,
      { method: 'POST' },
    ),
};



