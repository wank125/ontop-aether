# Benchmark Scaffold

This directory standardizes how to evaluate the project on external relational datasets.

The first target is `Mondial`, because it exercises the full path:

- relational schema ingestion
- automatic ontology / mapping generation
- SPARQL querying
- natural language to SQL / SPARQL

## Structure

```text
benchmark/
  README.md
  scripts/
    benchmark_score.py
  mondial/
    README.md
    dataset.template.json
    questions/
      sparql.json
      text_to_sql.json
      text_to_sparql.json
    gold/
      mapping_checklist.json
    fixtures/
      sample_predictions.json
      sample_mapping_report.json
```

## Evaluation Layers

Use the scaffold to score three layers separately.

1. Schema / mapping
2. Semantic querying
3. Natural language QA

## Recommended Workflow

1. Import the Mondial SQL schema and data into PostgreSQL or MySQL.
2. Create a dataset descriptor from `benchmark/mondial/dataset.template.json`.
3. Generate ontology and mapping artifacts with Ontop or your own pipeline.
4. Execute benchmark questions and export predictions as JSON.
5. Export a mapping coverage report as JSON.
6. Run `benchmark/scripts/benchmark_score.py` to compute metrics.

## Command

```bash
python3 benchmark/scripts/benchmark_score.py \
  --questions benchmark/mondial/questions/sparql.json \
  --predictions benchmark/mondial/fixtures/sample_predictions.json \
  --mapping benchmark/mondial/fixtures/sample_mapping_report.json \
  --mapping-checklist benchmark/mondial/gold/mapping_checklist.json
```

The sample fixture is only for verifying the framework. Replace it with real run outputs.
