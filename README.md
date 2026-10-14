# Contato Seguro

Extensão para o Google Chrome com botões customizados em contextos diferentes.
Os botões não usam IA: cada clique abre o GNOME Terminal com um script local
que segue regras fixas e mostra o resultado.

- **Checkout branches**: nas issues da organização `ContatoSeguro`, troca a
  issue e as sub-issues para as branches `issue/<N>` com o pipeline
  `mass-checkout` do `developer-env`.
- **Começar revisão**, **Devolver para TO DO** e **Avançar para validação**:
  nas PRs com branch `issue/NUMBER`, movem o card da issue no board de time
  (ignora `Contato Seguro - Produtos`) e ajustam os assignees.

Novos botões entram como um módulo em `chrome-extension/src/buttons/` e são
registrados no manifesto, sem alterar o runtime. A extensão não guarda token:
as chamadas ao GitHub usam o `gh` CLI autenticado na máquina.

## Compatibilidade

O projeto atende a um ambiente específico:

| Componente | Requisito |
| --- | --- |
| Sistema | Ubuntu com GNOME Terminal |
| Navegador | Google Chrome |
| GitHub | Issues da organização `ContatoSeguro` |
| GitHub CLI | `gh` autenticado com o escopo `project` |
| Ambiente | `developer-env` em `~/projects/developer-env`, com `scripts/mass-checkout/` |
| Dependências do sistema | Python 3.10+ e `xdg-mime` |

A ação de checkout funciona em páginas comuns de issues e em painéis ou
modais do GitHub Projects. Em painéis de sub-issues, a ação usa o link da
issue exibida, sem confundi-lo com o link da issue mãe. Como a integração
depende do HTML do GitHub, alterações relevantes na interface podem exigir
ajustes no botão correspondente.

Não há dependências npm, pip, bundler ou etapa de build.

## Visão geral

O content script carrega um registro compartilhado, os botões e um runtime.
Cada botão declara onde aparece, como é criado e onde é inserido. O runtime
observa a navegação SPA, evita duplicatas e remove controles que saíram de
contexto.

O clique abre uma URI de protocolo externo. O handler do Ubuntu valida a URI e
abre o GNOME Terminal com o script da ação:

```text
GitHub issue                         GitHub PR (issue/N)
    |                                    |
    | Checkout branches                  | Começar revisão / Devolver / Avançar
    v                                    v
devin-checkout://run?issue=...       contato-seguro://run?action=...&issue=...
    |                                    |
    | launcher/open-checkout.py          | launcher/open-contato-seguro.py
    v                                    v
launcher/run_checkout.py             launcher/move_card.py
    |                                    |
    v                                    v
mass-checkout do developer-env       gh api graphql
```

O terminal fica aberto no fim, com a mensagem `Pressione Enter para fechar.`

## Checkout branches

`launcher/run_checkout.py` executa as três etapas de
`~/projects/developer-env/scripts/mass-checkout/`:

1. `list-sub-issues.sh` lista a issue e as sub-issues.
2. `check-local-status.sh` classifica cada repositório local.
3. `checkout.sh` faz o checkout ou para sem alterar nada quando há bloqueio.

Entre as etapas 2 e 3, o terminal mostra a tabela de status e pergunta antes de
clonar, guardar alterações ou substituir uma pasta:

| Status | Pergunta | Flag usada se a resposta for `s` |
| --- | --- | --- |
| `not_cloned` | clonar os repositórios que ainda não existem localmente | nenhuma |
| `dirty` | guardar as alterações com `git stash -u` | `--auto-stash` |
| `invalid_local_copy` | mover a pasta para `.bak.<data>` e clonar de novo | `--reclone` |

Qualquer resposta diferente de `s` ou `sim` (inclusive só Enter) cancela o
checkout inteiro, sem alterar nenhum repositório.

`repo_busy` e `branch_missing` nunca são resolvidos automaticamente. Nesses
casos, o terminal não pergunta nada e mostra a sugestão do `checkout.sh`.

| Resultado | Significado |
| --- | --- |
| `✅ Checkout concluído.` | todos os repositórios estão na branch da issue |
| `⛔ Checkout cancelado.` | você respondeu não a uma pergunta; nada foi alterado |
| `⛔ Checkout bloqueado.` | nada foi alterado; resolva os itens listados e clique de novo |
| `⛔ Checkout interrompido no meio.` | um comando git falhou; a lista mostra o que já foi processado |

## Regras do board

`launcher/move_card.py` lê a issue com uma única consulta GraphQL, monta um
plano, mostra o plano, aplica as mudanças e relê a issue para confirmar o
resultado.

O card usado é o único item da issue em um board aberto que não seja
`Contato Seguro - Produtos`. Se a issue não estiver em nenhum board de time,
ou estiver em mais de um, nada é alterado.

| Botão | Status | Assignees |
| --- | --- | --- |
| Começar revisão | `CODE REVIEW IN PROGRESS` | deixa só você |
| Devolver para TO DO | `TO DO` | deixa só o login do `Responsável` |
| Avançar para validação | `AWAITING DEV VALIDATION` | deixa só o login do `Responsável` |

"Você" é a conta autenticada no `gh` (`gh auth status`). Todos os outros
assignees são removidos.

O campo `Responsável` é uma seleção única com nomes, não com usuários do
GitHub. O nome é convertido em login pela tabela `RESPONSIBLE_LOGINS`, no
topo de `launcher/move_card.py`:

| Responsável | Login |
| --- | --- |
| Beatriz Costa | `beatrizsiqueiras` |
| Gabrielly Reis | `gabizaor` |
| João Cirne | `JoaoMoraess` |
| Matheus Laurindo | `matheuslrd` |

Quando uma pessoa nova entrar no campo `Responsável`, adicione o nome exato e
o login dela nessa tabela.

O script para sem alterar nada quando:

- o board não tem a coluna de destino, ou tem duas colunas com o mesmo nome;
- a ação devolve o card e o board não tem o campo `Responsável`;
- o `Responsável` está vazio ou não está em `RESPONSIBLE_LOGINS`.

## Instalação

### 1. Clonar o projeto

```bash
git clone https://github.com/matheuslrd/github-devin-checkout.git
cd github-devin-checkout
```

### 2. Registrar os protocolos no Ubuntu

```bash
./install.sh
```

O instalador valida os requisitos, cria
`~/.local/share/applications/devin-checkout.desktop` e
`~/.local/share/applications/contato-seguro.desktop` e registra os protocolos
`devin-checkout://` e `contato-seguro://` para o usuário atual.

O caminho real do clone é usado nos arquivos `.desktop`, então o projeto pode
ser clonado em qualquer diretório. Nenhum arquivo do `developer-env` é
alterado.

### 3. Carregar a extensão no Chrome

1. Abra `chrome://extensions`.
2. Ative **Modo do desenvolvedor**.
3. Clique em **Carregar sem compactação**.
4. Selecione a pasta `chrome-extension` deste repositório.

Selecione `chrome-extension`, não a raiz do projeto.

## Uso

Abra uma issue da organização `ContatoSeguro`. O ícone de branch aparecerá
próximo à ação **Copy link**, com o tooltip **Checkout branches**.

Abra uma PR cuja branch siga `issue/NUMBER`. Os três botões do board aparecem
no topo da PR.

No primeiro clique de cada protocolo, o Chrome solicitará autorização para
abrir o aplicativo externo. Confirme e, se disponível, marque a opção para
lembrar a escolha.

## Segurança

Os launchers aceitam somente URIs que atendam a todos estes critérios:

- protocolo `devin-checkout://` ou `contato-seguro://`;
- host interno `run`;
- somente os parâmetros esperados (`issue`, e `action` no board), sem repetição;
- `action` entre `start-review`, `return-todo` e `advance-validation`;
- URL HTTPS no host `github.com`;
- organização `ContatoSeguro`;
- caminho no formato `<repositorio>/issues/<numero>`;
- nenhuma credencial, query string ou fragmento na URL da issue.

Os scripts são iniciados com uma lista de argumentos e sem `shell=True`. A URL
recebida do navegador não é interpretada por um shell, e as variáveis do
GraphQL são enviadas como JSON.

## Verificação

### Conferir os handlers

```bash
xdg-mime query default x-scheme-handler/devin-checkout
xdg-mime query default x-scheme-handler/contato-seguro
```

Resultado esperado:

```text
devin-checkout.desktop
contato-seguro.desktop
```

### Simular sem alterar nada

Os dois scripts aceitam `--dry-run`, que mostra o plano e não altera
repositórios nem cards:

```bash
python3 launcher/run_checkout.py --dry-run https://github.com/ContatoSeguro/core/issues/123
python3 launcher/move_card.py --dry-run advance-validation https://github.com/ContatoSeguro/core/issues/123
```

### Testar o protocolo sem a extensão

```bash
URI='devin-checkout://run?issue=https%3A%2F%2Fgithub.com%2FContatoSeguro%2Fexample-repo%2Fissues%2F123'
xdg-open "$URI"
```

O comando deve abrir o GNOME Terminal em `~/projects/developer-env` e iniciar o
checkout da URL de exemplo.

### Validar os arquivos

```bash
python3 -m unittest discover -s tests
node --check chrome-extension/src/registry.js
node --check chrome-extension/src/config.js
node --check chrome-extension/src/shared.js
node --check chrome-extension/src/runtime.js
node --check chrome-extension/src/buttons/checkout-branches.js
node --check chrome-extension/src/buttons/review-pr-card.js
for file in launcher/*.py; do python3 -m py_compile "$file"; done
bash -n install.sh
python3 -m json.tool chrome-extension/manifest.json >/dev/null
```

## Diagnóstico

### O botão não aparece

- confirme que a extensão foi carregada a partir de `chrome-extension`;
- recarregue a extensão em `chrome://extensions` e atualize a página;
- confirme que a URL pertence à organização `ContatoSeguro`;
- no GitHub Projects, abra o painel da issue.

O painel precisa conter um link semântico para a issue original.

### Acompanhar o fluxo no Console

Abra o DevTools da página (`F12`) e selecione a aba **Console**. As mensagens
da extensão usam o prefixo `[Contato Seguro]`:

- `extensão inicializada`: confirma que o content script foi carregado;
- `estado atualizado`: mostra a página e as chaves ativas de cada botão;
- `botão adicionado`: confirma que a ação foi inserida no DOM;
- `checkout solicitado` / `ação de review solicitada`: registra o clique e a URI;
- `botão removido`: indica que o contexto deixou de estar visível.

No log `checkout solicitado`, um clique normal deve apresentar
`isTrusted: true` e `defaultPrevented: false`.

Se os quatro primeiros logs aparecerem e o terminal não abrir, a extensão
concluiu sua parte do fluxo e o diagnóstico deve continuar no registro do
protocolo.

### O clique não abre o terminal

Confira o registro dos protocolos:

```bash
xdg-mime query default x-scheme-handler/devin-checkout
gio mime x-scheme-handler/devin-checkout
xdg-mime query default x-scheme-handler/contato-seguro
gio mime x-scheme-handler/contato-seguro
```

Se o handler não estiver registrado, execute `./install.sh` novamente. Verifique
também se o Chrome está aguardando a confirmação para abrir o aplicativo
externo.

### O terminal abre e mostra um erro

| Mensagem | Causa provável |
| --- | --- |
| `gh: ...` | `gh` sem login ou sem acesso; rode `gh auth status` |
| `não foi possível executar .../mass-checkout/...` | o `developer-env` não tem os scripts do `mass-checkout` |
| `a issue está em mais de um board de time` | remova a issue dos boards extras ou mova o card à mão |
| `não tem o campo "Responsável"` | o board não indica para quem devolver o card |
| `não está em RESPONSIBLE_LOGINS` | adicione a pessoa na tabela de `launcher/move_card.py` |

### O launcher rejeita a URL

A URL precisa seguir exatamente este formato:

```text
https://github.com/ContatoSeguro/<repositorio>/issues/<numero>
```

Query strings, fragmentos e outros hosts não são aceitos.

## Estrutura do projeto

```text
github-devin-checkout/
├── chrome-extension/
│   ├── manifest.json
│   ├── content.css
│   └── src/
│       ├── registry.js
│       ├── config.js
│       ├── shared.js
│       ├── runtime.js
│       └── buttons/
│           ├── checkout-branches.js
│           └── review-pr-card.js
├── launcher/
│   ├── open-checkout.py
│   ├── open-contato-seguro.py
│   ├── run_checkout.py
│   ├── move_card.py
│   └── terminal.py
├── tests/
│   ├── test_move_card.py
│   └── test_run_checkout.py
├── install.sh
└── README.md
```

Um botão novo é um arquivo em `src/buttons/` que chama
`ContatoSeguro.register({ id, collect, create, place })`. Depois disso, o
arquivo entra na lista `js` do `manifest.json`.

## Atualização

```bash
git pull
./install.sh
```

Depois, recarregue a extensão em `chrome://extensions` e atualize as páginas do
GitHub que já estavam abertas.

## Desinstalação

Remova a extensão em `chrome://extensions` e execute:

```bash
rm -f -- "$HOME/.local/share/applications/devin-checkout.desktop"
rm -f -- "$HOME/.local/share/applications/contato-seguro.desktop"
if [ -f "$HOME/.config/mimeapps.list" ]; then
  sed -i '/^x-scheme-handler\/devin-checkout=/d' "$HOME/.config/mimeapps.list"
  sed -i '/^x-scheme-handler\/contato-seguro=/d' "$HOME/.config/mimeapps.list"
fi
if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database "$HOME/.local/share/applications" >/dev/null 2>&1 || true
fi
```

Para confirmar:

```bash
xdg-mime query default x-scheme-handler/devin-checkout
xdg-mime query default x-scheme-handler/contato-seguro
```
