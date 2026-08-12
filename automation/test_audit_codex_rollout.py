import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).with_name("audit-codex-rollout.py")


class AuditCodexRolloutTests(unittest.TestCase):
    def run_audit(self, records):
        with tempfile.TemporaryDirectory() as directory:
            rollout = Path(directory) / "rollout.jsonl"
            rollout.write_text("\n".join(
                record if isinstance(record, str) else json.dumps(record)
                for record in records
            ) + "\n", encoding="utf-8")
            return subprocess.run(
                [sys.executable, str(SCRIPT), str(rollout)],
                check=False,
                capture_output=True,
                text=True,
            )

    def test_accepts_completed_terra_coder_then_sol_verifier_chain(self):
        result = self.run_audit([
            {
                "event": "workflow_declared",
                "task_id": "release-1",
                "production_code_change": True,
                "required_children": ["terra_coder", "sol_verifier"],
            },
            {"event": "child_started", "task_id": "release-1", "agent_type": "terra_coder", "required": True},
            {"event": "child_completed", "task_id": "release-1", "agent_type": "terra_coder"},
            {"event": "child_started", "task_id": "release-1", "agent_type": "sol_verifier", "required": True},
            {
                "event": "child_completed",
                "task_id": "release-1",
                "agent_type": "sol_verifier",
                "outcome": "passed",
            },
            {"event": "final", "task_id": "release-1"},
        ])

        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("0 violation(s)", result.stdout)

    def test_rejects_code_change_without_completed_verifier(self):
        result = self.run_audit([
            {"event": "workflow_declared", "task_id": "release-2", "production_code_change": True},
            {"event": "child_completed", "task_id": "release-2", "agent_type": "terra_coder"},
            {"event": "final", "task_id": "release-2"},
        ])

        self.assertEqual(result.returncode, 1)
        self.assertIn("missing-sol-verifier", result.stdout)

    def test_rejects_verifier_completed_before_coder(self):
        result = self.run_audit([
            {"event": "workflow_declared", "task_id": "release-3", "production_code_change": True},
            {
                "event": "child_completed",
                "task_id": "release-3",
                "agent_type": "sol_verifier",
                "outcome": "passed",
            },
            {"event": "child_completed", "task_id": "release-3", "agent_type": "terra_coder"},
        ])

        self.assertEqual(result.returncode, 1)
        self.assertIn("verifier-before-coder", result.stdout)

    def test_rejects_verifier_started_while_coder_is_running(self):
        result = self.run_audit([
            {"event": "workflow_declared", "task_id": "release-3a", "production_code_change": True},
            {"event": "child_started", "task_id": "release-3a", "agent_type": "terra_coder"},
            {"event": "child_started", "task_id": "release-3a", "agent_type": "sol_verifier"},
            {"event": "child_completed", "task_id": "release-3a", "agent_type": "terra_coder"},
            {
                "event": "child_completed",
                "task_id": "release-3a",
                "agent_type": "sol_verifier",
                "outcome": "passed",
            },
        ])

        self.assertEqual(result.returncode, 1)
        self.assertIn("verifier-started-before-coder-complete", result.stdout)

    def test_rejects_verifier_completion_without_explicit_pass_fail_outcome(self):
        result = self.run_audit([
            {"event": "workflow_declared", "task_id": "release-3b", "production_code_change": True},
            {"event": "child_completed", "task_id": "release-3b", "agent_type": "terra_coder"},
            {
                "event": "child_completed",
                "task_id": "release-3b",
                "agent_type": "sol_verifier",
                "status": "completed",
            },
        ])

        self.assertEqual(result.returncode, 1)
        self.assertIn("verifier-missing-pass-fail", result.stdout)

    def test_rejects_generic_implementation_child(self):
        result = self.run_audit([
            {"event": "workflow_declared", "task_id": "release-4", "production_code_change": True},
            {
                "event": "child_spawned",
                "task_id": "release-4",
                "agent_type": "worker",
                "intent": "production implementation",
            },
            {"event": "child_completed", "task_id": "release-4", "agent_type": "terra_coder"},
            {
                "event": "child_completed",
                "task_id": "release-4",
                "agent_type": "sol_verifier",
                "outcome": "passed",
            },
        ])

        self.assertEqual(result.returncode, 1)
        self.assertIn("generic-implementation-child", result.stdout)

    def test_ignores_policy_text_without_structured_workflow_declaration(self):
        result = self.run_audit([
            {
                "type": "session_meta",
                "payload": {
                    "session_id": "policy-text-only",
                    "base_instructions": {
                        "text": (
                            "Every production code implementation must use a verifier. "
                            "Security analysis requires a specialist."
                        ),
                    },
                    "developer_instructions": [
                        {"text": "Do not use a generic implementation child."},
                    ],
                },
            },
        ])

        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("0 violation(s)", result.stdout)

    def test_rejects_native_agent_tool_call_without_workflow_declaration(self):
        result = self.run_audit([
            {
                "type": "function_call",
                "name": "spawn_agent",
                "arguments": {"task_name": "implement-fix"},
            },
        ])

        self.assertEqual(result.returncode, 1)
        self.assertIn(
            "INCONCLUSIVE: native-agent-activity-without-structured-lifecycle-evidence",
            result.stdout,
        )

    def test_rejects_nested_native_agent_tool_call_without_workflow_declaration(self):
        result = self.run_audit([
            {
                "type": "response_item",
                "payload": {
                    "type": "function_call",
                    "name": "spawn_agent",
                },
            },
        ])

        self.assertEqual(result.returncode, 1)
        self.assertIn(
            "INCONCLUSIVE: native-agent-activity-without-structured-lifecycle-evidence",
            result.stdout,
        )

    def test_reports_malformed_jsonl_without_crashing(self):
        result = self.run_audit([
            '{"event": "workflow_declared", "task_id": "release-5", "production_code_change": true}',
            '{"event":',
        ])

        self.assertEqual(result.returncode, 1)
        self.assertIn("malformed-jsonl", result.stdout)


if __name__ == "__main__":
    unittest.main()
