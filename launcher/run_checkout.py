#!/usr/bin/env python3
"""Run the developer-env mass-checkout pipeline for one ContatoSeguro issue."""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
from pathlib import Path

from terminal import confirm, pause

STAGES_DIR = Path.home() / "projects" / "developer-env" / "scripts" / "mass-checkout"
STATUS_LINE = re.compile(r"(\S+)\s*->\s*(\S+)\s*->\s*([a-z_]+)")
UNBLOCKED_STATUSES = {"ready_to_checkout", "no_action_needed", "dirty_on_target"}
CONFIRMATIONS = {
    "not_cloned": (
        None,
        "Clonar os repositórios que ainda não existem localmente",
    ),
    "dirty": (
        "--auto-stash",
        "Guardar as alterações com git stash -u e trocar de branch em",
    ),
    "invalid_local_copy": (
        "--reclone",
        "Mover a pasta para <repo>.bak.<data> e clonar de novo",
    ),
}
RESULTS = {
    0: "✅ Checkout concluído.",
    1: "⛔ Checkout bloqueado. Nada foi alterado; resolva os itens acima e clique de novo.",
    2: "⛔ Checkout interrompido no meio. Veja acima os repositórios já processados.",
}


class CheckoutError(Exception):
    """Raised when the checkout stops before checkout.sh changes anything."""


def run_stage(
    name: str, arguments: list[str], stdin: str | None, capture: bool
) -> subprocess.CompletedProcess:
    script = STAGES_DIR / name
    try:
        return subprocess.run(
            [str(script), *arguments],
            input=stdin,
            stdout=subprocess.PIPE if capture else None,
            text=True,
        )
    except OSError as error:
        raise CheckoutError(f"não foi possível executar {script}: {error}") from error


def capture_stage(name: str, arguments: list[str], stdin: str | None = None) -> str:
    result = run_stage(name, arguments, stdin, capture=True)
    if result.returncode != 0:
        raise CheckoutError(f"{name} terminou com código {result.returncode}")
    return result.stdout


def parse_statuses(report: str) -> list[tuple[str, str, str]]:
    return [
        match.groups()
        for line in report.splitlines()
        if (match := STATUS_LINE.fullmatch(line))
    ]


def choose_flags(statuses: list[tuple[str, str, str]], ask) -> list[str]:
    found = {status for _repo, _branch, status in statuses}
    if not found <= UNBLOCKED_STATUSES | CONFIRMATIONS.keys():
        return []

    flags = []
    for status, (flag, question) in CONFIRMATIONS.items():
        repos = [repo for repo, _branch, repo_status in statuses if repo_status == status]
        if not repos:
            continue
        if not ask(f"{question}: {', '.join(repos)}?"):
            raise CheckoutError("Checkout cancelado. Nada foi alterado.")
        if flag:
            flags.append(flag)
    return flags


def print_statuses(statuses: list[tuple[str, str, str]]) -> None:
    repo_width = max(len(repo) for repo, _branch, _status in statuses)
    branch_width = max(len(branch) for _repo, branch, _status in statuses)
    for repo, branch, status in statuses:
        print(f"  {repo:<{repo_width}}  {branch:<{branch_width}}  {status}")


def checkout(issue_url: str, dry_run: bool) -> int:
    print(f"Checkout branches\nIssue: {issue_url}\n")
    try:
        print("Buscando sub-issues...")
        issues = capture_stage("list-sub-issues.sh", [issue_url])
        print("Analisando os repositórios locais...")
        report = capture_stage("check-local-status.sh", [], issues)
        statuses = parse_statuses(report)
        if not statuses:
            raise CheckoutError("check-local-status.sh não retornou nenhum repositório")

        print()
        print_statuses(statuses)
        print()
        flags = choose_flags(statuses, confirm)
        if dry_run:
            flags.append("--dry-run")
        code = run_stage("checkout.sh", flags, report, capture=False).returncode
    except CheckoutError as error:
        print(f"\n⛔ {error}")
        return 1

    if dry_run and code == 0:
        print("\n✅ Dry run concluído. Nada foi alterado.")
    else:
        print(f"\n{RESULTS.get(code, f'⛔ Checkout falhou com código {code}.')}")
    return code


def main(arguments: list[str]) -> int:
    parser = argparse.ArgumentParser(
        description="Troca a issue e as sub-issues para as branches issue/<N>."
    )
    parser.add_argument("issue_url")
    parser.add_argument("--dry-run", action="store_true", help="mostra o plano sem alterar nada")
    parser.add_argument("--wait", action="store_true", help="aguarda Enter antes de sair")
    args = parser.parse_args(arguments)
    sys.stdout.reconfigure(line_buffering=True)

    try:
        return checkout(args.issue_url, args.dry_run)
    finally:
        if args.wait:
            pause()


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
