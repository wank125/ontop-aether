# Mondial Benchmark

`Mondial` is the primary benchmark for this project because it is close to the target capability:

- multiple tables and foreign keys
- semantically clear domain entities
- suitable for ontology bootstrap and SPARQL
- suitable for multi-hop geography QA

## What To Measure

### 1. Schema ingestion

- total tables recognized
- total columns recognized
- total foreign keys recognized
- bridge tables or association tables recognized

### 2. Mapping quality

- table to class coverage
- column to datatype property coverage
- foreign key to object property coverage
- identifier / IRI stability

### 3. Query quality

- SPARQL execution success rate
- exact match against expected rows
- aggregation correctness
- multi-hop correctness

### 4. NL QA quality

- natural language to SQL exact or executable accuracy
- natural language to SPARQL executable accuracy
- final answer accuracy

## Expected Inputs

You should produce these files per run:

1. `dataset.json`
   Declares connection info, source SQL files, and generated artifacts.
2. `predictions.json`
   Stores benchmark question results.
3. `mapping_report.json`
   Stores the measured coverage of classes, datatype properties, object properties, and identifiers.

See the template and fixtures in this directory.

## Prediction Format

Each prediction entry is keyed by question id:

```json
{
  "SPARQL-001": {
    "status": "passed",
    "predicted_rows": [
      {"country": "Egypt"}
    ],
    "generated_query": "SELECT ..."
  }
}
```

Allowed `status` values:

- `passed`
- `failed`
- `error`
- `skipped`

## Mapping Report Format

```json
{
  "dataset": "mondial",
  "mapping_metrics": {
    "table_to_class_coverage": 0.93,
    "column_to_datatype_property_coverage": 0.88,
    "foreign_key_to_object_property_coverage": 0.91,
    "identifier_coverage": 1.0
  },
  "notes": [
    "Bridge table inference needs manual confirmation."
  ]
}
```

## First Real Run

The first practical target should be:

1. load Mondial into PostgreSQL
2. run Ontop bootstrap
3. answer the SPARQL question set
4. export one mapping report
5. score the run

After that, add `text_to_sql.json` and `text_to_sparql.json` into the same loop.
