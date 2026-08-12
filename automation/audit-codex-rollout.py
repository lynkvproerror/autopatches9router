"""Audit a Codex rollout JSONL without changing the rollout, tasks, or databases."""

import argparse
import json
import re
import sys
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable


CODER = "terra_coder"
VERIFIER = "sol_verifier"
ANALYST = "sol_analyst"
GENERIC_IMPLEMENTERS = {"", "default", "generic", "untyped", "worker", "agent"}
FINAL_EVENTS = {"final", "final_answer", "task_complete", "completed", "complete"}
COMPLETE_EVENTS = {"child_completed", "agent_completed", "completed", "complete", "task_complete"}
START_EVENTS = {"child_started", "agent_started", "spawn_agent", "child_spawned", "agent_spawned", "started"}
NATIVE_AGENT_LIFECYCLE_EVENTS = {
    "child_started",
    "agent_started",
    "spawn_agent",
    "child_spawned",
    "agent_spawned",
    "child_completed",
    "agent_completed",
}
NATIVE_TOOL_CALL_EVENTS = {"function_call", "tool_call", "tool_use", "custom_tool_call"}
NATIVE_AGENT_TOOL_SUFFIXES = {
    "spawn_agent",
    "followup_task",
    "send_message",
    "interrupt_agent",
    "wait_agent",
    "list_agents",
}


@dataclass
class TaskState:
    code_change: bool = False
    hard_analysis: bool = False
    roles: list[tuple[int, str, str]] = field(default_factory=list)
    completed: dict[str, list[int]] = field(default_factory=lambda: defaultdict(list))
    running: set[str] = field(default_factory=set)
    required_roles: set[str] = field(default_factory=set)
    finals: list[int] = field(default_factory=list)


def normalized(value: Any) -> str:
    return re.sub(r"[^a-z0-9]+", "_", str(value or "").lower()).strip("_")


def true_value(value: Any) -> bool:
    return value is True or (isinstance(value, str) and value.lower() in {"true", "yes", "required"})


def record_value(record: dict[str, Any], *names: str) -> Any:
    payload = record.get("payload")
    maps = (record, payload) if isinstance(payload, dict) else (record,)
    for mapping in maps:
        for name in names:
            if name in mapping:
                return mapping[name]
    return None


def event_name(record: dict[str, Any]) -> str:
    return normalized(record_value(record, "event", "event_type", "type", "kind", "phase"))


def task_id(record: dict[str, Any], fallback: str) -> str:
    value = record_value(record, "task_id", "taskId", "thread_id", "threadId", "session_id", "sessionId", "turn_id", "turnId")
    return str(value) if value not in (None, "") else fallback


def role_name(record: dict[str, Any]) -> str:
    role = record_value(record, "agent_type", "agentType", "role", "agent_role", "agentRole")
    if role is None:
        role = record_value(record, "agent_name", "agentName", "task_name", "taskName")
    return normalized(role)


def is_native_agent_activity(record: dict[str, Any]) -> bool:
    """Recognize structured Codex agent lifecycle and collaboration calls only."""
    activity = record
    if event_name(record) == "response_item" and isinstance(record.get("payload"), dict):
        activity = record["payload"]

    event = event_name(activity)
    if event in NATIVE_AGENT_LIFECYCLE_EVENTS:
        return True
    if event not in NATIVE_TOOL_CALL_EVENTS:
        return False

    tool = normalized(record_value(
        activity,
        "name",
        "tool_name",
        "toolName",
        "function_name",
        "functionName",
    ))
    return any(tool == suffix or tool.endswith(f"_{suffix}") for suffix in NATIVE_AGENT_TOOL_SUFFIXES)


def verifier_pass_fail_outcome(record: dict[str, Any]) -> str | None:
    """Return a structured verifier outcome only when it is an explicit pass/fail."""
    values: list[Any] = []
    payload = record.get("payload")
    maps = (record, payload) if isinstance(payload, dict) else (record,)
    for mapping in maps:
        for name in ("outcome", "status"):
            values.append(mapping.get(name))
        result = mapping.get("result")
        if isinstance(result, dict):
            for name in ("outcome", "status"):
                values.append(result.get(name))
        else:
            values.append(result)

    for value in values:
        outcome = normalized(value)
        if outcome in {"pass", "passed", "fail", "failed"}:
            return outcome
    return None


def is_code_change(record: dict[str, Any], text: str) -> bool:
    del text
    if event_name(record) != "workflow_declared":
        return False
    for name in ("production_code_change", "productionCodeChange", "code_change", "codeChange"):
        if true_value(record_value(record, name)):
            return True
    return False


def is_hard_analysis(record: dict[str, Any], text: str) -> bool:
    del text
    if event_name(record) != "workflow_declared":
        return False
    for name in ("hard_analysis", "hardAnalysis", "requires_sol_analyst", "requiresSolAnalyst"):
        if true_value(record_value(record, name)):
            return True
    return False


def child_event(event: str, record: dict[str, Any], role: str) -> bool:
    return bool(role) and (
        event in START_EVENTS
        or event in COMPLETE_EVENTS
        or "child" in event
        or "agent" in event
        or record_value(record, "agent_type", "agentType", "agent_name", "agentName") is not None
    )


def is_implementation_child(role: str) -> bool:
    return role in GENERIC_IMPLEMENTERS


def audit_records(records: Iterable[tuple[int, dict[str, Any]]]) -> list[str]:
    tasks: dict[str, TaskState] = defaultdict(TaskState)
    violations: list[str] = []
    workflow_declared = False
    native_agent_activity = False

    for line_number, record in records:
        event = event_name(record)
        workflow_declared = workflow_declared or event == "workflow_declared"
        native_agent_activity = native_agent_activity or is_native_agent_activity(record)
        state = tasks[task_id(record, "rollout")]
        state.code_change = state.code_change or is_code_change(record, "")
        state.hard_analysis = state.hard_analysis or is_hard_analysis(record, "")

        required = record_value(record, "required_children", "requiredChildren", "required_roles", "requiredRoles")
        if isinstance(required, list):
            state.required_roles.update(normalized(item) for item in required)

        role = role_name(record)
        if child_event(event, record, role):
            if state.code_change and is_implementation_child(role):
                violations.append(f"line {line_number}: generic-implementation-child ({role or 'untyped'})")
            if role:
                state.roles.append((line_number, event, role))
            if event in START_EVENTS:
                if state.code_change and role == VERIFIER and CODER in state.running:
                    violations.append(f"line {line_number}: verifier-started-before-coder-complete")
                state.running.add(role)
                if true_value(record_value(record, "required", "is_required", "isRequired")):
                    state.required_roles.add(role)
            if event in COMPLETE_EVENTS and role:
                if state.code_change and role == VERIFIER and not verifier_pass_fail_outcome(record):
                    violations.append(f"line {line_number}: verifier-missing-pass-fail")
                state.running.discard(role)
                state.completed[role].append(line_number)

        if event in FINAL_EVENTS:
            state.finals.append(line_number)
            declared_running = record_value(record, "running_children", "runningChildren", "active_children", "activeChildren")
            active = {normalized(item) for item in declared_running} if isinstance(declared_running, list) else set()
            active.update(state.running.intersection(state.required_roles))
            if active:
                violations.append(
                    f"line {line_number}: final-with-required-child-running ({', '.join(sorted(active))})"
                )

    for identifier, state in tasks.items():
        if state.code_change:
            coder_lines = state.completed[CODER]
            verifier_lines = state.completed[VERIFIER]
            if not coder_lines:
                violations.append(f"task {identifier}: missing-terra-coder")
            if not verifier_lines:
                violations.append(f"task {identifier}: missing-sol-verifier")
            if coder_lines and verifier_lines and min(verifier_lines) < min(coder_lines):
                violations.append(f"task {identifier}: verifier-before-coder")
        if state.hard_analysis and not state.completed[ANALYST]:
            violations.append(f"task {identifier}: missing-sol-analyst")

    if native_agent_activity and not workflow_declared:
        violations.append("INCONCLUSIVE: native-agent-activity-without-structured-lifecycle-evidence")

    return violations


def read_jsonl(path: Path) -> tuple[list[tuple[int, dict[str, Any]]], list[str]]:
    records: list[tuple[int, dict[str, Any]]] = []
    violations: list[str] = []
    try:
        lines = path.read_text(encoding="utf-8-sig").splitlines()
    except OSError as error:
        return records, [f"input-error: {error}"]
    for line_number, line in enumerate(lines, 1):
        if not line.strip():
            continue
        try:
            record = json.loads(line)
        except json.JSONDecodeError as error:
            violations.append(f"line {line_number}: malformed-jsonl ({error.msg})")
            continue
        if not isinstance(record, dict):
            violations.append(f"line {line_number}: malformed-jsonl (record is not an object)")
            continue
        records.append((line_number, record))
    return records, violations


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Audit Codex rollout JSONL policy evidence without modifying it."
    )
    parser.add_argument("rollout_jsonl", type=Path, help="Path to a Codex rollout JSONL file.")
    args = parser.parse_args()

    records, violations = read_jsonl(args.rollout_jsonl)
    violations.extend(audit_records(records))
    if violations:
        for violation in violations:
            print(f"VIOLATION: {violation}")
        print(f"Audit failed: {len(violations)} violation(s) in {args.rollout_jsonl}")
        return 1

    print(f"Audit passed: 0 violation(s) in {args.rollout_jsonl} ({len(records)} record(s))")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
