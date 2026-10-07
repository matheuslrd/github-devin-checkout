"""Terminal helpers shared by the runners opened in GNOME Terminal."""

from __future__ import annotations


def confirm(question: str) -> bool:
    try:
        answer = input(f"{question} [s/N] ")
    except EOFError:
        return False
    return answer.strip().lower() in {"s", "sim", "y", "yes"}


def pause() -> None:
    try:
        input("\nPressione Enter para fechar.")
    except (EOFError, KeyboardInterrupt):
        pass
