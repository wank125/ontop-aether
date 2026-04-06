# LVFA 与 Mondial 查询样例

更新时间：2026-04-05

本文档记录默认栈 `ontop-ui/docker-compose.yml` 下两套已验证可用的数据源、Bootstrap 产物和 SPARQL 查询样例。

## 数据源

### LVFA PostgreSQL Host

- 数据源名称：`LVFA PostgreSQL Host`
- 数据源 ID：`2adc5235`
- JDBC URL：`jdbc:postgresql://host.docker.internal:5436/lvfa_db`
- Bootstrap 版本：`bootstrap-full-20260405-125212`
- Ontology：`/app/data/2adc5235/bootstrap-full-20260405-125212/LVFA_PostgreSQL_Host_ontology.ttl`
- Mapping：`/app/data/2adc5235/bootstrap-full-20260405-125212/LVFA_PostgreSQL_Host_mapping.obda`
- Properties：`/app/data/2adc5235/bootstrap-full-20260405-125212/LVFA_PostgreSQL_Host.properties`

### Mondial PostgreSQL Host

- 数据源名称：`Mondial PostgreSQL Host`
- 数据源 ID：`6f8f5a37`
- JDBC URL：`jdbc:postgresql://host.docker.internal:5436/mondial_db`
- Bootstrap 版本：`bootstrap-full-20260405-125215`
- Ontology：`/app/data/6f8f5a37/bootstrap-full-20260405-125215/Mondial_PostgreSQL_Host_ontology.ttl`
- Mapping：`/app/data/6f8f5a37/bootstrap-full-20260405-125215/Mondial_PostgreSQL_Host_mapping.obda`
- Properties：`/app/data/6f8f5a37/bootstrap-full-20260405-125215/Mondial_PostgreSQL_Host.properties`

## 当前状态

- 两个数据源都已完成：创建、连接测试、Schema 探测、Bootstrap、Endpoint 重启
- `ASK { ?s ?p ?o }` 在两套产物下都返回 `true`
- 当前在线 endpoint 最后切换到：`LVFA PostgreSQL Host`

## LVFA 查询样例

注意：这次 `LVFA` 是用 Native Bootstrap 直接从表结构生成的本体，命名空间不是旧版手工本体的 `http://ontology.lvfa-property.com/v1/`，而是以表名展开的 `http://example.com/lvfa/...`。

### 查询项目列表

```sparql
SELECT ?projectId ?projectName WHERE {
  ?p a <http://example.com/lvfa/property_project> ;
     <http://example.com/lvfa/property_project#project_id> ?projectId ;
     <http://example.com/lvfa/property_project#project_name> ?projectName .
}
LIMIT 10
```

实测结果片段：

- `P100123` / `望京花园`
- `P200456` / `三亚湾度假村`
- `P300789` / `翡翠湾公寓`

### 查询客户列表

```sparql
SELECT ?customerId ?name WHERE {
  ?c a <http://example.com/lvfa/customer> ;
     <http://example.com/lvfa/customer#global_id> ?customerId ;
     <http://example.com/lvfa/customer#legal_name> ?name .
}
LIMIT 10
```

实测结果片段：

- `G-20260401-000001` / `张三`
- `G-20260401-000002` / `李四`
- `G-20260401-000003` / `绿发物业三亚分公司`

### 查询金额最高的账单

```sparql
SELECT ?billId ?amountDue WHERE {
  ?b a <http://example.com/lvfa/bill> ;
     <http://example.com/lvfa/bill#bill_id> ?billId ;
     <http://example.com/lvfa/bill#amount_due> ?amountDue .
}
ORDER BY DESC(?amountDue)
LIMIT 10
```

实测结果片段：

- `BL-P800567-202603-00001` / `5400.00`
- `BL-P800567-202604-00001` / `5400.00`
- `BL-P400321-202604-00002` / `3720.00`

## Mondial 查询样例

如果要执行以下 Mondial 查询，需要先把 endpoint 切回 `Mondial PostgreSQL Host` 对应产物。

### 查询国家名称和人口

```sparql
SELECT ?name ?population WHERE {
  ?c <http://example.com/mondial/country#name> ?name .
  ?c <http://example.com/mondial/country#population> ?population .
}
LIMIT 5
```

实测结果片段：

- `Qatar` / `2846118`
- `United Arab Emirates` / `9121167`
- `Oman` / `4471148`

### 查询最长河流

```sparql
SELECT ?name ?length WHERE {
  ?r <http://example.com/mondial/river#name> ?name .
  ?r <http://example.com/mondial/river#length> ?length .
}
ORDER BY DESC(?length)
LIMIT 5
```

### 查询亚洲人口最多的国家

```sparql
SELECT ?name ?population WHERE {
  ?c <http://example.com/mondial/country#name> ?name .
  ?c <http://example.com/mondial/country#population> ?population .
  ?c <http://example.com/mondial/country#code> ?code .
  ?e <http://example.com/mondial/encompasses#country> ?code .
  ?e <http://example.com/mondial/encompasses#continent> "Asia" .
}
ORDER BY DESC(?population)
LIMIT 5
```

## Endpoint 切换

如果要在两套数据之间切换在线查询，调用 backend 的 endpoint 重启接口即可：

```bash
curl -X POST http://localhost:8000/api/v1/mappings/restart-endpoint \
  -H 'Content-Type: application/json' \
  -d '{
    "ontology_path": "/app/data/<datasource-id>/<version>/<name>_ontology.ttl",
    "mapping_path": "/app/data/<datasource-id>/<version>/<name>_mapping.obda",
    "properties_path": "/app/data/<datasource-id>/<version>/<name>.properties"
  }'
```

切换后可用以下接口确认：

```bash
curl http://localhost:8000/api/v1/sparql/endpoint-status
```
