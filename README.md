# GitHub Devin Checkout

Extensão local para o Google Chrome que adiciona uma ação de checkout às issues
da organização `ContatoSeguro`. Com um clique, ela abre o Devin CLI no
`developer-env` e solicita a execução da skill `checkout-issue-branches` para a
issue atual.

O projeto foi pensado para reduzir o trabalho manual de copiar a URL da issue,
abrir um terminal, navegar até o ambiente de desenvolvimento e montar o prompt
do Devin.

## Como funciona

```text
Issue no GitHub
    ↓ clique em "Checkout branches"
devin-checkout://run?issue=<URL>
    ↓ handler registrado no Ubuntu
launcher/open-checkout.py
    ↓ validação estrita da URI
GNOME Terminal em ~/projects/developer-env
    ↓
Devin CLI + skill checkout-issue-branches
```

A extensão funciona tanto em páginas comuns de issues quanto em painéis e
modais do GitHub Projects. Ela acompanha a navegação SPA do GitHub, mantém
somente uma ação por issue e ignora as próprias mudanças no DOM para evitar
loops visuais.

## Requisitos

- Ubuntu com GNOME Terminal;
- Google Chrome;
- Python 3;
- `xdg-mime`;
- Devin CLI instalado e executável em `~/.local/bin/devin`;
- repositório `developer-env` disponível em `~/projects/developer-env`;
- acesso às issues da organização `ContatoSeguro`.

Não há dependências npm, bundler ou etapa de build.

## Instalação

Clone o repositório e execute o instalador:

```bash
git clone git@github.com:matheuslrd/github-devin-checkout.git
cd github-devin-checkout
./install.sh
```

O instalador:

- valida todos os pré-requisitos locais;
- cria `~/.local/share/applications/devin-checkout.desktop`;
- registra `devin-checkout://` como protocolo do usuário atual;
- usa o caminho real do clone, portanto o projeto pode ser clonado em qualquer
  diretório;
- não altera arquivos dentro de `developer-env`.

### Carregar a extensão no Chrome

1. Abra `chrome://extensions`.
2. Ative **Modo do desenvolvedor**.
3. Clique em **Carregar sem compactação**.
4. Selecione a pasta `chrome-extension` dentro deste repositório.

> Selecione `chrome-extension`, não a raiz do projeto.

Abra uma issue da organização `ContatoSeguro`. O ícone de branch aparecerá
próximo à ação **Copy link**, com o tooltip **Checkout branches**.

No primeiro clique, o Chrome solicitará autorização para abrir o aplicativo
externo. Confirme **Abrir Devin Checkout** e, se disponível, marque a opção para
lembrar a escolha.

## Estrutura

```text
github-devin-checkout/
├── chrome-extension/
│   ├── manifest.json       # Manifest V3
│   ├── content.js          # integração com issues e navegação SPA
│   └── content.css         # apresentação do botão
├── launcher/
│   └── open-checkout.py    # valida a URI e inicia o Devin
├── install.sh              # registra o protocolo no Ubuntu
└── README.md
```

## Segurança

O launcher não executa conteúdo arbitrário recebido pelo navegador. Antes de
abrir o terminal, ele exige:

- protocolo `devin-checkout://`;
- host interno `run`;
- exatamente um parâmetro `issue`;
- URL HTTPS no host `github.com`;
- organização `ContatoSeguro`;
- caminho no formato `<repositorio>/issues/<numero>`;
- ausência de credenciais, query string ou fragmento na URL da issue.

O processo é iniciado com uma lista de argumentos, sem `shell=True`, evitando
interpretação da URL por um shell.

## Testes manuais

### Validar o registro do protocolo

```bash
xdg-mime query default x-scheme-handler/devin-checkout
```

Resultado esperado:

```text
devin-checkout.desktop
```

### Testar o fluxo sem a extensão

```bash
URI='devin-checkout://run?issue=https%3A%2F%2Fgithub.com%2FContatoSeguro%2Fexample-repo%2Fissues%2F123'
xdg-open "$URI"
```

O resultado esperado é um GNOME Terminal em `~/projects/developer-env`
executando o equivalente a:

```text
~/.local/bin/devin -- "Use the checkout-issue-branches skill for https://github.com/ContatoSeguro/example-repo/issues/123"
```

### Validar sintaxe

```bash
node --check chrome-extension/content.js
python3 -m py_compile launcher/open-checkout.py
bash -n install.sh
python3 -m json.tool chrome-extension/manifest.json >/dev/null
```

## Diagnóstico

### O botão não aparece

- confirme que a extensão foi carregada a partir de `chrome-extension`;
- recarregue a extensão em `chrome://extensions` e atualize a página;
- confirme que a URL pertence à organização `ContatoSeguro`;
- no GitHub Projects, abra o painel da issue — ele precisa expor um link
  semântico para a issue.

### O clique não abre o terminal

Confira o handler:

```bash
xdg-mime query default x-scheme-handler/devin-checkout
gio mime x-scheme-handler/devin-checkout
```

Se necessário, execute `./install.sh` novamente. Confira também se o Chrome
está aguardando a confirmação para abrir o protocolo externo.

### O terminal abre, mas o Devin não inicia

```bash
test -x "$HOME/.local/bin/devin"
test -d "$HOME/projects/developer-env"
```

Os dois comandos devem terminar sem erro.

### O launcher rejeita a URL

Use exatamente:

```text
https://github.com/ContatoSeguro/<repositorio>/issues/<numero>
```

A URL não pode conter query string, fragmento ou outro host.

## Atualização

Depois de atualizar o clone:

```bash
git pull
./install.sh
```

Em seguida, abra `chrome://extensions`, recarregue a extensão e atualize as
páginas do GitHub já abertas.

## Desinstalação

Remova a extensão em `chrome://extensions` e depois execute:

```bash
rm -f -- "$HOME/.local/share/applications/devin-checkout.desktop"
if [ -f "$HOME/.config/mimeapps.list" ]; then
  sed -i '/^x-scheme-handler\/devin-checkout=/d' "$HOME/.config/mimeapps.list"
fi
if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database "$HOME/.local/share/applications" >/dev/null 2>&1 || true
fi
```

Confirme a remoção:

```bash
xdg-mime query default x-scheme-handler/devin-checkout
```

## Compatibilidade

Este projeto é específico para o fluxo da organização `ContatoSeguro` e para o
layout de ambiente descrito nos requisitos. Mudanças relevantes no HTML do
GitHub podem exigir ajustes no content script.
