import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "launcher"))

from move_card import ACTIONS, CardError, User, build_plan  # noqa: E402

VIEWER = User("U_viewer", "matheuslrd")
STATUS_OPTIONS = [
    {"id": "opt-todo", "name": "TO DO"},
    {"id": "opt-review", "name": "CODE REVIEW IN PROGRESS"},
    {"id": "opt-validation", "name": "AWAITING DEV VALIDATION"},
]


def board_item(title, status="AWAITING CODE REVIEW", responsible=None, closed=False,
               has_responsible_field=True, status_options=STATUS_OPTIONS):
    fields = [{"id": f"{title}-status", "name": "Status", "dataType": "SINGLE_SELECT",
               "options": status_options}]
    values = [{}, {"name": status, "field": {"name": "Status"}}]
    if has_responsible_field:
        fields.append({"id": f"{title}-resp", "name": "Responsável",
                       "dataType": "SINGLE_SELECT", "options": []})
    if responsible:
        values.append({"name": responsible, "field": {"name": "Responsável"}})
    return {
        "id": f"{title}-item",
        "project": {"id": f"{title}-id", "title": title, "closed": closed,
                    "fields": {"nodes": fields}},
        "fieldValues": {"nodes": values},
    }


def issue(items, assignees=()):
    return {
        "id": "I_issue",
        "assignees": {"nodes": [{"id": f"U_{login}", "login": login} for login in assignees]},
        "projectItems": {"nodes": items},
    }


class StartReviewTest(unittest.TestCase):
    def test_leaves_only_viewer_and_targets_review_column(self):
        plan = build_plan(issue([board_item("Vox")], ["gabizaor"]), VIEWER, ACTIONS["start-review"])

        self.assertEqual(plan.add, "matheuslrd")
        self.assertEqual(plan.remove, (User("U_gabizaor", "gabizaor"),))
        self.assertEqual(plan.status_option_id, "opt-review")
        self.assertEqual(plan.expected_assignees(), {"matheuslrd"})

    def test_removes_others_when_viewer_is_already_assigned(self):
        plan = build_plan(
            issue([board_item("Vox")], ["gabizaor", "matheuslrd"]), VIEWER, ACTIONS["start-review"]
        )

        self.assertIsNone(plan.add)
        self.assertEqual(plan.remove, (User("U_gabizaor", "gabizaor"),))
        self.assertEqual(plan.expected_assignees(), {"matheuslrd"})

    def test_skips_changes_when_viewer_is_the_only_assignee(self):
        plan = build_plan(issue([board_item("Vox")], ["matheuslrd"]), VIEWER, ACTIONS["start-review"])

        self.assertIsNone(plan.add)
        self.assertEqual(plan.remove, ())

    def test_does_not_require_responsible_field(self):
        item = board_item("Galáticos", has_responsible_field=False)

        plan = build_plan(issue([item]), VIEWER, ACTIONS["start-review"])

        self.assertEqual(plan.project_title, "Galáticos")


class HandBackTest(unittest.TestCase):
    def test_leaves_only_the_mapped_responsible(self):
        item = board_item("Vox", responsible="João Cirne")

        plan = build_plan(
            issue([item], ["matheuslrd", "pedrosobucki"]), VIEWER, ACTIONS["advance-validation"]
        )

        self.assertEqual(
            plan.remove,
            (User("U_matheuslrd", "matheuslrd"), User("U_pedrosobucki", "pedrosobucki")),
        )
        self.assertEqual(plan.add, "JoaoMoraess")
        self.assertEqual(plan.status_option_id, "opt-validation")
        self.assertEqual(plan.expected_assignees(), {"JoaoMoraess"})

    def test_removes_others_when_responsible_is_already_assigned(self):
        item = board_item("Vox", responsible="Gabrielly Reis")

        plan = build_plan(
            issue([item], ["gabizaor", "matheuslrd", "pedrosobucki"]), VIEWER,
            ACTIONS["return-todo"],
        )

        self.assertEqual(
            plan.remove,
            (User("U_matheuslrd", "matheuslrd"), User("U_pedrosobucki", "pedrosobucki")),
        )
        self.assertIsNone(plan.add)
        self.assertEqual(plan.status_option_id, "opt-todo")
        self.assertEqual(plan.expected_assignees(), {"gabizaor"})

    def test_keeps_viewer_when_viewer_is_the_responsible(self):
        item = board_item("Vox", responsible="Matheus Laurindo")

        plan = build_plan(issue([item], ["matheuslrd"]), VIEWER, ACTIONS["return-todo"])

        self.assertEqual(plan.remove, ())
        self.assertIsNone(plan.add)

    def test_rejects_board_without_responsible_field(self):
        item = board_item("Galáticos", has_responsible_field=False)

        with self.assertRaisesRegex(CardError, 'não tem o campo "Responsável"'):
            build_plan(issue([item]), VIEWER, ACTIONS["return-todo"])

    def test_rejects_empty_responsible(self):
        with self.assertRaisesRegex(CardError, "está vazio"):
            build_plan(issue([board_item("Vox")]), VIEWER, ACTIONS["return-todo"])

    def test_rejects_unmapped_responsible(self):
        item = board_item("Vox", responsible="Pessoa Nova")

        with self.assertRaisesRegex(CardError, "RESPONSIBLE_LOGINS"):
            build_plan(issue([item]), VIEWER, ACTIONS["return-todo"])


class BoardSelectionTest(unittest.TestCase):
    def test_ignores_product_and_closed_boards(self):
        items = [
            board_item("Contato Seguro - Produtos"),
            board_item("Antigo", closed=True),
            board_item("Vox"),
        ]

        plan = build_plan(issue(items), VIEWER, ACTIONS["start-review"])

        self.assertEqual(plan.project_title, "Vox")
        self.assertEqual(plan.item_id, "Vox-item")
        self.assertEqual(plan.current_status, "AWAITING CODE REVIEW")

    def test_rejects_issue_without_team_board(self):
        with self.assertRaisesRegex(CardError, "nenhum board"):
            build_plan(issue([board_item("Contato Seguro - Produtos")]), VIEWER,
                       ACTIONS["start-review"])

    def test_rejects_issue_on_several_team_boards(self):
        with self.assertRaisesRegex(CardError, "mais de um board de time: Vega, Vox"):
            build_plan(issue([board_item("Vox"), board_item("Vega")]), VIEWER,
                       ACTIONS["start-review"])

    def test_rejects_missing_status_column(self):
        item = board_item("Ops", status_options=[{"id": "x", "name": "REVIEW"}])

        with self.assertRaisesRegex(CardError, 'não tem a coluna "CODE REVIEW IN PROGRESS"'):
            build_plan(issue([item]), VIEWER, ACTIONS["start-review"])

    def test_rejects_duplicated_status_column(self):
        options = [{"id": "a", "name": "TO DO"}, {"id": "b", "name": "TO DO"}]
        item = board_item("Compliance", responsible="Beatriz Costa", status_options=options)

        with self.assertRaisesRegex(CardError, '2 colunas chamadas "TO DO"'):
            build_plan(issue([item]), VIEWER, ACTIONS["return-todo"])


if __name__ == "__main__":
    unittest.main()
