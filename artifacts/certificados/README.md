# Gerador de Certificados — Como executar localmente

Aplicação web para gerar certificados em PDF em lote a partir de uma planilha CSV, mantendo fielmente o layout do template "Geração Cidadã de Dados".

**Autora:** Kezia Antero

---

## 1. Pré-requisitos

Antes de começar, instale na sua máquina:

| Ferramenta | Versão recomendada | Como obter |
|-----------|--------------------|------------|
| **Node.js** | 20 ou superior (24 é o que usamos) | https://nodejs.org/ ou via `nvm` |
| **pnpm**    | 10 ou superior | `npm install -g pnpm` |
| **Git**     | qualquer recente | https://git-scm.com/ |

Para conferir que está tudo certo:

```bash
node -v     # v20.x ou superior
pnpm -v     # 10.x ou superior
```

---

## 2. Baixar o projeto

```bash
git clone <URL_DO_REPOSITORIO>
cd <PASTA_DO_PROJETO>
```

Se você baixou um `.zip`, extraia e entre na pasta do projeto pelo terminal.

---

## 3. Instalar dependências

Na **raiz do projeto** (não dentro de `artifacts/certificados`), rode:

```bash
pnpm install
```

Isso instala as dependências de todo o monorepo, incluindo as do gerador de certificados.

---

## 4. Rodar a aplicação em modo desenvolvimento

Ainda na raiz do projeto:

```bash
pnpm run dev:web
```

Você deve ver algo como:

```
VITE v5.x.x  ready in 500 ms

➜  Local:   http://localhost:5173/
```

Abra **http://localhost:5173/** no navegador. A aplicação carrega já com o template do certificado.

> Se a porta 5173 estiver ocupada, o Vite tenta a próxima livre — basta abrir o endereço que aparecer no terminal.

Para parar o servidor, pressione `Ctrl + C` no terminal.

---

## 5. Usar a aplicação

1. **Baixar CSV de exemplo** (botão dentro da própria aplicação) para ver o formato esperado — basicamente uma coluna chamada `nome`.
2. **Subir o seu CSV** clicando em "Choose File".
3. **Ajustar o texto** do certificado se necessário, usando `{{nome}}` (ou outras colunas) como variáveis.
4. **Navegar** pelos participantes na pré-visualização.
5. **Gerar PDFs**:
   - "Baixar o atual" → só o participante exibido na pré-visualização
   - "Baixar todos (1 PDF por pessoa)" → um arquivo PDF separado por pessoa
   - "Baixar todos em um único PDF" → um único PDF com todos os certificados

> Tudo é processado **localmente no navegador** — nenhum dado da planilha sai da sua máquina.

---

## 6. Gerar build de produção (opcional)

Se quiser gerar uma versão estática para hospedar:

```bash
pnpm run build:web
```

O resultado fica em `artifacts/certificados/dist/public`. Qualquer servidor de arquivos estáticos (Nginx, Vercel, Netlify, GitHub Pages, etc.) consegue servir essa pasta.

Para testar o build localmente:

```bash
pnpm run preview:web
```

---

## 7. Problemas comuns

**`pnpm: command not found`**
Instale o pnpm globalmente: `npm install -g pnpm`.

**`Error: Cannot find module ...` ao rodar `dev`**
Você provavelmente esqueceu o `pnpm install` na raiz, ou rodou `npm install` por engano. Apague `node_modules` e refaça:

```bash
rm -rf node_modules
pnpm install
```

**Imagens do certificado não carregam**
A aplicação baixa o fundo, a assinatura e as logos de URLs públicas (postimg). Verifique sua conexão com a internet. Se as imagens originais saírem do ar, você pode trocar as URLs em `artifacts/certificados/src/App.tsx` (constantes `BKG_URL`, `SIG_URL`, `LOGOS_URL`).

**PDF saindo com fonte errada**
A fonte Libre Franklin vem do Google Fonts. Se você estiver offline ou bloqueando Google Fonts, os PDFs vão sair com uma fonte fallback do sistema. Permita o acesso a `fonts.googleapis.com` ou hospede a fonte localmente.

**Geração de muitos certificados está lenta**
Normal — cada certificado é renderizado em alta resolução (3072×1800 px) no próprio navegador. Para lotes grandes (centenas), prefira a opção "um único PDF" e tenha paciência. Fechar outras abas pesadas ajuda.

---

## 8. Onde estão os arquivos importantes

```
artifacts/certificados/
├── src/
│   ├── App.tsx        ← lógica da aplicação, CSV, geração de PDF
│   ├── index.css      ← estilos do certificado (posições, fontes, etc.)
│   └── main.tsx       ← ponto de entrada do React
├── package.json
└── README.md          ← este arquivo
```

Para mudar o **texto padrão** do certificado, edite a constante `DEFAULT_TEMPLATE` no topo de `src/App.tsx`.
Para mudar **posições, tamanhos ou cores** dos elementos do certificado, edite `src/index.css` (classes que começam com `.cert-`).
