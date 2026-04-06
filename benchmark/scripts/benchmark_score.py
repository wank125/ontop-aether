#!/usr/bin/env python3
"""Score benchmark predictions and mapping coverage reports."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


def load_json(path: str) -> Any:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def normalize_scalar(value: Any) -> str:
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "true" if value else "false"
    return str(value).strip()


def normalize_row(row: dict[str, Any]) -> tuple[tuple[str, str], ...]:
    return tuple(sorted((str(key), normalize_scalar(value)) for key, value in row.items()))


def rows_match(expected_rows: list[dict[str, Any]], predicted_rows: list[dict[str, Any]]) -> bool:
    expected = sorted(normalize_row(row) for row in expected_rows)
    predicted = sorted(normalize_row(row) for row in predicted_rows)
    return expected == predicted


def score_questions(questions: list[dict[str, Any]], predictions: dict[str, Any]) -> dict[str, Any]:
    results = []
    passed = 0
    executable = 0

    for question in questions:
        question_id = question["id"]
        prediction = predictions.get(question_id)

        if not prediction:
            results.append({
                "id": question_id,
                "status": "missing",
                "exact_match": False,
                "executable": False,
            })
            continue

        status = prediction.get("status", "missing")
        predicted_rows = prediction.get("predicted_rows", [])
        exact_match = status == "passed" and rows_match(question.get("expected_rows", []), predicted_rows)
        is_executable = status in {"passed", "failed"}

        if exact_match:
            passed += 1
        if is_executable:
            executable += 1

        results.append({
            "id": question_id,
            "status": status,
            "exact_match": exact_match,
            "executable": is_executable,
        })

    total = len(questions)
    return {
        "total": total,
        "passed": passed,
        "exact_match_accuracy": round(passed / total, 4) if total else 0.0,
        "executable_count": executable,
        "execution_rate": round(executable / total, 4) if total else 0.0,
        "details": results,
    }


def score_mapping(mapping_report: dict[str, Any], checklist: dict[str, Any]) -> dict[str, Any]:
    required = checklist.get("required_metrics", {})
    actual = mapping_report.get("mapping_metrics", {})
    details = []
    passed = 0

    for metric_name, threshold in required.items():
        actual_value = float(actual.get(metric_name, 0.0))
        ok = actual_value >= float(threshold)
        if ok:
            passed += 1
        details.append({
            "metric": metric_name,
            "actual": round(actual_value, 4),
            "threshold": round(float(threshold), 4),
            "passed": ok,
        })

    total = len(required)
    return {
      "total": total,
      "passed": passed,
      "pass_rate": round(passed / total, 4) if total else 0.0,
      "details": details,
    }


def render_summary(question_score: dict[str, Any], mapping_score: dict[str, Any]) -> dict[str, Any]:
    return {
        "query_metrics": {
            "total_questions": question_score["total"],
            "exact_match_accuracy": question_score["exact_match_accuracy"],
            "execution_rate": question_score["execution_rate"],
        },
        "mapping_metrics": {
            "required_checks": mapping_score["total"],
            "passed_checks": mapping_score["passed"],
            "pass_rate": mapping_score["pass_rate"],
        },
        "overall_notes": [
            "Exact match requires the predicted rows to equal the expected rows after normalization.",
            "Execution rate counts both passed and failed executions, but excludes missing, skipped, and error predictions."
        ],
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Score benchmark predictions and mapping coverage.")
    parser.add_argument("--questions", required=True, help="Path to the benchmark question JSON file.")
    parser.add_argument("--predictions", required=True, help="Path to the run prediction JSON file.")
    parser.add_argument("--mapping", required=True, help="Path to the mapping report JSON file.")
    parser.add_argument("--mapping-checklist", required=True, help="Path to the mapping checklist JSON file.")
    parser.add_argument("--output", help="Optional path to save the scored summary JSON.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    questions = load_json(args.questions)
    predictions = load_json(args.predictions)
    mapping_report = load_json(args.mapping)
    mapping_checklist = load_json(args.mapping_checklist)

    question_score = score_questions(questions, predictions)
    mapping_score = score_mapping(mapping_report, mapping_checklist)
    summary = {
        "summary": render_summary(question_score, mapping_score),
        "query_score": question_score,
        "mapping_score": mapping_score,
        "sources": {
            "questions": str(Path(args.questions)),
            "predictions": str(Path(args.predictions)),
            "mapping": str(Path(args.mapping)),
            "mapping_checklist": str(Path(args.mapping_checklist)),
        },
    }

    rendered = json.dumps(summary, ensure_ascii=False, indent=2)
    print(rendered)

    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(rendered)
            f.write("\n")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
