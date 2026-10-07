#!/usr/bin/env python3
"""Move the team board card of a ContatoSeguro issue with fixed rules."""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from collections.abc import Iterable
from dataclasses import dataclass

from terminal import pause

ORGANIZATION = "ContatoSeguro"
IGNORED_BOARD = "Contato Seguro - Produtos"
STATUS_FIELD = "Status"
RESPONSIBLE_FIELD = "Responsável"
RESPONSIBLE_LOGINS = {
    "Beatriz Costa": "beatrizsiqueiras",
    "Gabrielly Reis": "gabizaor",
    "João Cirne": "JoaoMoraess",
    "Matheus Laurindo": "matheuslrd",
}
ISSUE_URL = re.compile(
    rf"^https://github\.com/{ORGANIZATION}/([A-Za-z0-9._-]+)/issues/([1-9][0-9]*)$"
)


@dataclass(frozen=True)
class Action:
    label: str
    status: str
    hand_back: bool


ACTIONS = {
    "start-review": Action("Começar revisão", "CODE REVIEW IN PROGRESS", hand_back=False),
    "return-todo": Action("Devolver para TO DO", "TO DO", hand_back=True),
    "advance-validation": Action(
        "Avançar para validação", "AWAITING DEV VALIDATION", hand_back=True
    ),
}

ISSUE_QUERY = """
query($owner: String!, $repo: String!, $number: Int!) {
  viewer { id login }
  repository(owner: $owner, name: $repo) {
    issue(number: $number) {
      id
      url
      title
      assignees(first: 50) { nodes { id login } }
      projectItems(first: 50, includeArchived: false) {
        nodes {
          id
          project {
            id
            title
            closed
            fields(first: 100) {
              nodes {
                ... on ProjectV2FieldCommon { id name dataType }
                ... on ProjectV2SingleSelectField { options { id name } }
              }
            }
          }
          fieldValues(first: 100) {
            nodes {
              ... on ProjectV2ItemFieldSingleSelectValue {
                name
                field { ... on ProjectV2FieldCommon { name } }
              }
            }
          }
        }
      }
    }
  }
}
"""

USER_QUERY = "query($login: String!) { user(login: $login) { id } }"

ADD_ASSIGNEE_MUTATION = """
mutation($issue: ID!, $user: ID!) {
  addAssigneesToAssignable(input: { assignableId: $issue, assigneeIds: [$user] }) {
    clientMutationId
  }
}
"""

REMOVE_ASSIGNEE_MUTATION = """
mutation($issue: ID!, $user: ID!) {
  removeAssigneesFromAssignable(input: { assignableId: $issue, assigneeIds: [$user] }) {
    clientMutationId
  }
}
"""

UPDATE_STATUS_MUTATION = """
mutation($project: ID!, $item: ID!, $field: ID!, $option: String!) {
  updateProjectV2ItemFieldValue(input: {
    projectId: $project
    itemId: $item
    fieldId: $field
    value: { singleSelectOptionId: $option }
  }) {
    clientMutationId
  }
}
"""


class CardError(Exception):
    """Raised when the card cannot be moved by the fixed rules."""


@dataclass(frozen=True)
class User:
    id: str
    login: str


@dataclass(frozen=True)
class Plan:
    issue_id: str
    project_id: str
    project_title: str
    item_id: str
    status_field_id: str
    status_option_id: str
    current_status: str | None
    target_status: str
    responsible: str | None
    assignees: tuple[str, ...]
    remove: User | None
    add: str | None

    def expected_assignees(self) -> set[str]:
        expected = set(self.assignees)
        if self.remove:
            expected.discard(self.remove.login)
        if self.add:
            expected.add(self.add)
        return expected


def graphql(query: str, variables: dict) -> dict:
    body = json.dumps({"query": query, "variables": variables})
    try:
        result = subprocess.run(
            ["gh", "api", "graphql", "--input", "-"],
            input=body,
            capture_output=True,
            text=True,
        )
    except FileNotFoundError as error:
        raise CardError("o gh CLI não foi encontrado no PATH") from error

    if result.returncode != 0:
        raise CardError(result.stderr.strip() or "o gh api graphql falhou")
    return json.loads(result.stdout)["data"]


def parse_issue_url(issue_url: str) -> tuple[str, int]:
    match = ISSUE_URL.fullmatch(issue_url)
    if not match:
        raise CardError(
            f"a URL deve seguir https://github.com/{ORGANIZATION}/<repo>/issues/<numero>"
        )
    return match[1], int(match[2])


def fetch_issue(repository: str, number: int) -> tuple[dict, User]:
    data = graphql(
        ISSUE_QUERY, {"owner": ORGANIZATION, "repo": repository, "number": number}
    )
    viewer = data["viewer"]
    return data["repository"]["issue"], User(viewer["id"], viewer["login"])


def select_board_item(items: list[dict]) -> dict:
    eligible = [
        item
        for item in items
        if not item["project"]["closed"] and item["project"]["title"] != IGNORED_BOARD
    ]
    if len(eligible) == 1:
        return eligible[0]
    if not eligible:
        raise CardError(f'a issue não está em nenhum board além de "{IGNORED_BOARD}"')

    titles = ", ".join(sorted(item["project"]["title"] for item in eligible))
    raise CardError(f"a issue está em mais de um board de time: {titles}")


def single_select_field(project: dict, name: str) -> dict:
    fields = [field for field in project["fields"]["nodes"] if field.get("name") == name]
    if not fields:
        raise CardError(f'o board "{project["title"]}" não tem o campo "{name}"')
    if fields[0]["dataType"] != "SINGLE_SELECT":
        raise CardError(
            f'o campo "{name}" do board "{project["title"]}" não é de seleção única'
        )
    return fields[0]


def status_option_id(project: dict, status_field: dict, status: str) -> str:
    matches = [option["id"] for option in status_field["options"] if option["name"] == status]
    if not matches:
        raise CardError(f'o board "{project["title"]}" não tem a coluna "{status}"')
    if len(matches) > 1:
        raise CardError(
            f'o board "{project["title"]}" tem {len(matches)} colunas chamadas "{status}"'
        )
    return matches[0]


def item_values(item: dict) -> dict[str, str]:
    return {
        value["field"]["name"]: value["name"]
        for value in item["fieldValues"]["nodes"]
        if value
    }


def responsible_login(project: dict, responsible: str | None) -> str:
    if not responsible:
        raise CardError(
            f'o campo "{RESPONSIBLE_FIELD}" está vazio no board "{project["title"]}"'
        )
    if responsible not in RESPONSIBLE_LOGINS:
        raise CardError(
            f'"{responsible}" não está em RESPONSIBLE_LOGINS (launcher/move_card.py); '
            "adicione o login do GitHub dessa pessoa"
        )
    return RESPONSIBLE_LOGINS[responsible]


def build_plan(issue: dict, viewer: User, action: Action) -> Plan:
    item = select_board_item(issue["projectItems"]["nodes"])
    project = item["project"]
    status_field = single_select_field(project, STATUS_FIELD)
    values = item_values(item)
    assignees = {
        node["login"]: User(node["id"], node["login"])
        for node in issue["assignees"]["nodes"]
    }

    responsible = None
    remove = None
    assignee = viewer.login
    if action.hand_back:
        single_select_field(project, RESPONSIBLE_FIELD)
        responsible = values.get(RESPONSIBLE_FIELD)
        assignee = responsible_login(project, responsible)
        if assignee != viewer.login:
            remove = assignees.get(viewer.login)

    return Plan(
        issue_id=issue["id"],
        project_id=project["id"],
        project_title=project["title"],
        item_id=item["id"],
        status_field_id=status_field["id"],
        status_option_id=status_option_id(project, status_field, action.status),
        current_status=values.get(STATUS_FIELD),
        target_status=action.status,
        responsible=responsible,
        assignees=tuple(sorted(assignees)),
        remove=remove,
        add=None if assignee in assignees else assignee,
    )


def print_plan(plan: Plan) -> None:
    print(f"Board:       {plan.project_title}")
    print(f"Status:      {plan.current_status or 'sem status'} -> {plan.target_status}")
    if plan.responsible:
        print(f"Responsável: {plan.responsible} (@{RESPONSIBLE_LOGINS[plan.responsible]})")
    print(f"Assignees:   {format_logins(plan.assignees)}")
    print(f"Remover:     {format_logins([plan.remove.login] if plan.remove else [])}")
    print(f"Atribuir:    {format_logins([plan.add] if plan.add else [])}")


def format_logins(logins: Iterable[str]) -> str:
    return ", ".join(f"@{login}" for login in sorted(logins)) or "nenhum"


def apply(plan: Plan) -> None:
    add_id = graphql(USER_QUERY, {"login": plan.add})["user"]["id"] if plan.add else None
    if plan.remove:
        graphql(REMOVE_ASSIGNEE_MUTATION, {"issue": plan.issue_id, "user": plan.remove.id})
    if add_id:
        graphql(ADD_ASSIGNEE_MUTATION, {"issue": plan.issue_id, "user": add_id})
    if plan.current_status != plan.target_status:
        graphql(
            UPDATE_STATUS_MUTATION,
            {
                "project": plan.project_id,
                "item": plan.item_id,
                "field": plan.status_field_id,
                "option": plan.status_option_id,
            },
        )


def read_back(repository: str, number: int, item_id: str) -> tuple[str | None, set[str]]:
    issue, _viewer = fetch_issue(repository, number)
    item = next(item for item in issue["projectItems"]["nodes"] if item["id"] == item_id)
    assignees = {node["login"] for node in issue["assignees"]["nodes"]}
    return item_values(item).get(STATUS_FIELD), assignees


def run(action: Action, issue_url: str, dry_run: bool) -> int:
    print(f"{action.label}\nIssue: {issue_url}\n")
    try:
        repository, number = parse_issue_url(issue_url)
        issue, viewer = fetch_issue(repository, number)
        print(f"Título:      {issue['title']}")
        plan = build_plan(issue, viewer, action)
        print_plan(plan)
        if dry_run:
            print("\nDry run: nada foi alterado.")
            return 0

        apply(plan)
        status, assignees = read_back(repository, number, plan.item_id)
    except CardError as error:
        print(f"\n⛔ {error}")
        return 1

    print(f"\nStatus atual:     {status or 'sem status'}")
    print(f"Assignees atuais: {format_logins(assignees)}")
    if status != plan.target_status or assignees != plan.expected_assignees():
        print("\n⛔ O GitHub não refletiu todas as mudanças esperadas.")
        return 1

    print("\n✅ Card atualizado.")
    return 0


def main(arguments: list[str]) -> int:
    parser = argparse.ArgumentParser(description="Move o card da issue no board de time.")
    parser.add_argument("action", choices=ACTIONS)
    parser.add_argument("issue_url")
    parser.add_argument("--dry-run", action="store_true", help="mostra o plano sem alterar nada")
    parser.add_argument("--wait", action="store_true", help="aguarda Enter antes de sair")
    args = parser.parse_args(arguments)

    try:
        return run(ACTIONS[args.action], args.issue_url, args.dry_run)
    finally:
        if args.wait:
            pause()


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
