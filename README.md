# Gerador de Certificados

Aplicação web para gerar certificados em PDF a partir de uma planilha CSV.

Com ela, você pode:

- importar uma lista de participantes
- personalizar o texto do certificado com variáveis como `{{nome}}`
- visualizar o layout antes de exportar
- baixar um PDF por pessoa ou gerar vários certificados em sequência

## Requisitos

- Node.js 20+
- pnpm 11+

## Instalação

```bash
corepack enable
pnpm install
```

## Rodar localmente

```bash
pnpm run dev:web
```

Abra:

```bash
http://localhost:8080
```

## Build de produção

```bash
pnpm run build:web
```

Os arquivos gerados ficam em:

```bash
artifacts/certificados/dist/public
```

## Estrutura principal

```text
artifacts/certificados/   app principal
artifacts/mockup-sandbox/ área de testes visuais
lib/                      código compartilhado
```