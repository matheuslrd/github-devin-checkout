# AGENTS.md

Este arquivo orienta agentes de código que trabalham neste repositório.

## Visão geral

Extensão do Chrome (Manifest V3, JS puro) que injeta botões no GitHub e, a cada clique, abre uma URI de protocolo externo. Handlers registrados no Ubuntu (`install.sh`) validam a URI e abrem o GNOME Terminal com um script Python determinístico. Não há IA no fluxo, nem dependências npm/pip, nem etapa de build. O ambiente-alvo é fixo: Ubuntu + GNOME Terminal, Chrome, `gh` autenticado com escopo `project`, e `~/projects/developer-env/scripts/mass-checkout/`.

Documentação de usuário, regras de negócio e diagnóstico ficam no `README.md`, em PT-BR. Mensagens ao usuário, logs e textos de terminal também ficam em PT-BR.

## Comandos

```bash
python3 -m unittest discover -s tests                          # todos os testes
python3 -m unittest tests.test_move_card.StartReviewTest       # uma classe
python3 -m unittest tests.test_move_card.StartReviewTest.test_leaves_only_viewer_and_targets_review_column

# Validação de sintaxe (não há linter configurado)
for f in chrome-extension/src/*.js chrome-extension/src/buttons/*.js; do node --check "$f"; done
for f in launcher/*.py; do python3 -m py_compile "$f"; done
bash -n install.sh
python3 -m json.tool chrome-extension/manifest.json >/dev/null

# Executar sem efeitos colaterais (lê o GitHub, não altera repositórios nem cards)
python3 launcher/run_checkout.py --dry-run https://github.com/ContatoSeguro/core/issues/123
python3 launcher/move_card.py --dry-run advance-validation https://github.com/ContatoSeguro/core/issues/123
```

Depois de mudar a extensão, é preciso recarregá-la em `chrome://extensions`. Depois de mudar caminhos de launcher, rode `./install.sh` de novo, porque os `.desktop` gravam o caminho absoluto do clone.

## Arquitetura

### Extensão (`chrome-extension/`)

Os content scripts compartilham o namespace global `window.ContatoSeguro`, e a ordem da lista `js` do `manifest.json` importa: `registry.js` → `config.js` → `shared.js` → `buttons/*.js` → `runtime.js` (sempre por último).

- Cada botão é um módulo em `src/buttons/` que chama `ContatoSeguro.register({ id, collect, create, place, sync? })`. `collect()` devolve os *placements* ativos na página (cada um com uma `key` estável), `create` monta o controle, `place` o insere no DOM e o `sync` opcional atualiza um controle já existente.
- `runtime.js` observa a navegação SPA do GitHub, chama `collect` de cada botão, cria ou reaproveita controles (marcados com `data-cs-button`/`data-cs-key`) e remove os que saíram de contexto. Um botão novo não exige mudança no runtime, só o arquivo novo e a entrada no manifesto.
- Os links usam a ação nativa de `<a href="scheme://...">` com `stopPropagation()`. Não troque isso por `preventDefault` ou navegação via JS: o gesto do usuário precisa ser preservado para o Chrome abrir o handler externo.
- Logs de debug usam o prefixo `[Contato Seguro]` (ver README → Diagnóstico).

### Protocolos e launchers (`launcher/`)

| Protocolo | Handler (valida e abre o terminal) | Runner |
| --- | --- | --- |
| `devin-checkout://run?issue=…` | `open-checkout.py` | `run_checkout.py` |
| `contato-seguro://run?action=…&issue=…` | `open-contato-seguro.py` | `move_card.py` |

O nome `devin-checkout` é histórico: o fluxo usava o Devin antes. Ele continua sendo o scheme registrado, então renomeá-lo exige mudar a extensão, o `install.sh`, os handlers e o README juntos.

- Os handlers são a fronteira de segurança. Aceitam só o host `run`, os parâmetros exatos sem repetição, a `action` dentro de `move_card.ACTIONS`, e uma URL `https://github.com/ContatoSeguro/<repo>/issues/<n>` sem query nem fragmento. Os subprocessos rodam com lista de argumentos, nunca `shell=True`, e as variáveis GraphQL vão como JSON via stdin para `gh api graphql --input -`.
- `run_checkout.py` encadeia os três scripts do `mass-checkout` do `developer-env` (`list-sub-issues.sh` → `check-local-status.sh` → `checkout.sh`). Ele interpreta as linhas `repo -> branch -> status` e pede confirmação antes de cada status que exige flag (`CONFIRMATIONS`). Qualquer "não" cancela tudo antes de alterar algo. Os status bloqueantes (`repo_busy`, `branch_missing`) nunca são resolvidos automaticamente.
- `move_card.py` segue o ciclo: uma query GraphQL → `build_plan` (puro, coberto pelos testes) → imprime o plano → `apply` → relê a issue e confere se o GitHub refletiu o plano. O card escolhido é o único item em board aberto que não seja `Contato Seguro - Produtos`. `start-review` deixa só o usuário do `gh` como assignee. As ações com `hand_back` trocam os assignees pelo login do campo `Responsável`, mapeado pela tabela `RESPONSIBLE_LOGINS`. Qualquer ambiguidade levanta `CardError` sem alterar nada.
- `terminal.py` tem `confirm` (aceita `s`/`sim`/`y`/`yes`) e `pause`. A flag `--wait`, passada pelos handlers, mantém o terminal aberto no fim.

### Testes

Os testes em `tests/` usam `unittest`, inserem `launcher/` no `sys.path` e cobrem só a lógica pura (`build_plan`, `parse_statuses`, `choose_flags`). Não há testes da extensão nem dos handlers. Para validar uma mudança no fluxo real, use `--dry-run` ou `xdg-open` com uma URI (ver README → Verificação).
