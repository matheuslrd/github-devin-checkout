# Contato Seguro

Extensão para o Google Chrome com botões customizados em contextos diferentes.
O primeiro botão, **Checkout branches**, abre o Devin CLI no `developer-env`
com a skill `checkout-issue-branches` e a URL da issue atual da organização
`ContatoSeguro`.

Novos botões entram como um módulo em `chrome-extension/src/buttons/` e são
registrados no manifesto, sem alterar o runtime.

Nas PRs com branch `issue/NUMBER`, o topo ganha três botões: **Começar
revisão**, **Devolver para TO DO** e **Avançar para validação**. Cada um abre
o Devin, como o checkout, e o Devin move o card no board de time (ignora
`Contato Seguro - Produtos`). Sem token na extensão.

## Compatibilidade

O projeto atende a um ambiente específico:

| Componente | Requisito |
| --- | --- |
| Sistema | Ubuntu com GNOME Terminal |
| Navegador | Google Chrome |
| GitHub | Issues da organização `ContatoSeguro` |
| Devin CLI | Executável em `~/.local/bin/devin` |
| Ambiente | `developer-env` em `~/projects/developer-env` |
| Dependências do sistema | Python 3 e `xdg-mime` |

A ação de checkout funciona em páginas comuns de issues e em painéis ou
modais do GitHub Projects. Em painéis de sub-issues, a ação usa o link da
issue exibida, sem confundi-lo com o link da issue mãe. Como a integração
depende do HTML do GitHub, alterações relevantes na interface podem exigir
ajustes no botão correspondente.

Não há dependências npm, bundler ou etapa de build.

## Visão geral

O content script carrega um registro compartilhado, os botões e um runtime.
Cada botão declara onde aparece, como é criado e onde é inserido. O runtime
observa a navegação SPA, evita duplicatas e remove controles que saíram de
contexto.

O fluxo do checkout continua dividido em três partes:

1. O botão identifica uma issue da `ContatoSeguro` e entra ao lado de **Copy link**.
2. O clique abre uma URI no formato
   `devin-checkout://run?issue=<URL_DA_ISSUE>`.
3. O handler do Ubuntu valida a URI e inicia o Devin no diretório
   `~/projects/developer-env`.

```text
GitHub issue
    |
    | Checkout branches
    v
devin-checkout://
    |
    | launcher/open-checkout.py
    v
GNOME Terminal -> Devin CLI -> checkout-issue-branches
```

## Instalação

### 1. Clonar o projeto

```bash
git clone https://github.com/matheuslrd/github-devin-checkout.git
cd github-devin-checkout
```

### 2. Registrar o protocolo no Ubuntu

```bash
./install.sh
```

O instalador valida os requisitos, cria
`~/.local/share/applications/devin-checkout.desktop` e registra o protocolo
`devin-checkout://` para o usuário atual.

O caminho real do clone é usado no arquivo `.desktop`, então o projeto pode ser
clonado em qualquer diretório. Nenhum arquivo do `developer-env` é alterado.

### 3. Carregar a extensão no Chrome

1. Abra `chrome://extensions`.
2. Ative **Modo do desenvolvedor**.
3. Clique em **Carregar sem compactação**.
4. Selecione a pasta `chrome-extension` deste repositório.

Selecione `chrome-extension`, não a raiz do projeto.

## Uso

Abra uma issue da organização `ContatoSeguro`. O ícone de branch aparecerá
próximo à ação **Copy link**, com o tooltip **Checkout branches**.

No primeiro clique, o Chrome solicitará autorização para abrir o protocolo
externo. Confirme **Abrir Devin Checkout** e, se disponível, marque a opção para
lembrar a escolha.

O terminal será aberto em `~/projects/developer-env` com o seguinte prompt:

```text
Use the checkout-issue-branches skill for <URL_DA_ISSUE>
```

## Segurança

O launcher aceita somente URIs que atendam a todos estes critérios:

- protocolo `devin-checkout://`;
- host interno `run`;
- exatamente um parâmetro `issue`;
- URL HTTPS no host `github.com`;
- organização `ContatoSeguro`;
- caminho no formato `<repositorio>/issues/<numero>`;
- nenhuma credencial, query string ou fragmento na URL da issue.

O Devin é iniciado com uma lista de argumentos e sem `shell=True`. A URL
recebida do navegador não é interpretada por um shell.

## Verificação

### Conferir o handler

```bash
xdg-mime query default x-scheme-handler/devin-checkout
```

Resultado esperado:

```text
devin-checkout.desktop
```

### Testar sem a extensão

```bash
URI='devin-checkout://run?issue=https%3A%2F%2Fgithub.com%2FContatoSeguro%2Fexample-repo%2Fissues%2F123'
xdg-open "$URI"
```

O comando deve abrir o GNOME Terminal em `~/projects/developer-env` e iniciar o
Devin com a URL de exemplo.

### Validar os arquivos

```bash
node --check chrome-extension/src/registry.js
node --check chrome-extension/src/config.js
node --check chrome-extension/src/shared.js
node --check chrome-extension/src/runtime.js
node --check chrome-extension/src/buttons/checkout-branches.js
node --check chrome-extension/src/buttons/review-pr-card.js
python3 -m py_compile launcher/open-checkout.py
python3 -m py_compile launcher/open-contato-seguro.py
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

Confira o registro do protocolo:

```bash
xdg-mime query default x-scheme-handler/devin-checkout
gio mime x-scheme-handler/devin-checkout
```

Se o handler não estiver registrado, execute `./install.sh` novamente. Verifique
também se o Chrome está aguardando a confirmação para abrir o aplicativo
externo.

### O terminal abre, mas o Devin não inicia

```bash
test -x "$HOME/.local/bin/devin"
test -d "$HOME/projects/developer-env"
```

Os dois comandos devem terminar sem erro.

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
│   └── open-contato-seguro.py
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
