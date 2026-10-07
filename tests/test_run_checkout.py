import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "launcher"))

from run_checkout import CheckoutError, choose_flags, parse_statuses  # noqa: E402


class ParseStatusesTest(unittest.TestCase):
    def test_reads_status_lines_and_skips_anything_else(self):
        report = "core -> issue/12 -> ready_to_checkout\nSkipping unrecognized line: x\n\n"

        self.assertEqual(parse_statuses(report), [("core", "issue/12", "ready_to_checkout")])


class ChooseFlagsTest(unittest.TestCase):
    def ask(self, answers):
        questions = []

        def ask(question):
            questions.append(question)
            return answers.pop(0)

        return ask, questions

    def test_asks_once_per_status_with_its_repos(self):
        statuses = [
            ("batch", "issue/5", "not_cloned"),
            ("core", "issue/1", "dirty"),
            ("admin", "issue/2", "dirty"),
            ("webhook-api", "issue/3", "invalid_local_copy"),
            ("portal-backend", "issue/4", "ready_to_checkout"),
        ]
        ask, questions = self.ask([True, True, True])

        flags = choose_flags(statuses, ask)

        self.assertEqual(flags, ["--auto-stash", "--reclone"])
        self.assertEqual(len(questions), 3)
        self.assertIn("batch", questions[0])
        self.assertIn("core, admin", questions[1])
        self.assertIn("webhook-api", questions[2])

    def test_asks_before_cloning(self):
        ask, questions = self.ask([True])

        self.assertEqual(choose_flags([("batch", "issue/5", "not_cloned")], ask), [])
        self.assertEqual(len(questions), 1)

    def test_cancels_on_the_first_refusal(self):
        statuses = [
            ("batch", "issue/5", "not_cloned"),
            ("core", "issue/1", "dirty"),
            ("webhook-api", "issue/3", "invalid_local_copy"),
        ]
        ask, questions = self.ask([True, False])

        with self.assertRaisesRegex(CheckoutError, "cancelado"):
            choose_flags(statuses, ask)
        self.assertEqual(len(questions), 2)

    def test_does_not_ask_when_another_repo_blocks_anyway(self):
        statuses = [("core", "issue/1", "not_cloned"), ("admin", "issue/2", "repo_busy")]
        ask, questions = self.ask([])

        self.assertEqual(choose_flags(statuses, ask), [])
        self.assertEqual(questions, [])

    def test_does_not_ask_when_nothing_needs_confirmation(self):
        statuses = [
            ("core", "issue/1", "no_action_needed"),
            ("admin", "issue/2", "ready_to_checkout"),
            ("batch", "issue/3", "dirty_on_target"),
        ]
        ask, questions = self.ask([])

        self.assertEqual(choose_flags(statuses, ask), [])
        self.assertEqual(questions, [])


if __name__ == "__main__":
    unittest.main()
