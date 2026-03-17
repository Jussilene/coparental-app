# CoParental

Plataforma de coparentalidade para organização familiar, comunicação entre responsáveis, controle de pensão, despesas, calendário, relatórios e notificações.

## Stack

- Backend: Node.js + Express
- Banco: SQLite com `better-sqlite3`
- Frontend: React + Vite
- Autenticação: JWT em cookie `httpOnly`
- Uploads: arquivos locais em `backend/uploads`
- Relatórios: PDF via `pdfkit`
- Push: Web Push
- E-mail transacional: SMTP

## Estrutura

```text
/backend
  /src
    /config
    /db
    /middleware
    /routes
    /services
    /utils
/frontend
  /public
  /src
    /api
    /components
    /contexts
    /pages
    /styles
```

## Requisitos

- Node.js 20+
- npm 10+

## Instalação

```bash
npm run install:all
```

Ou separadamente:

```bash
npm install --prefix backend
npm install --prefix frontend
```

## Execução local

Terminal 1:

```bash
npm --prefix backend run dev
```

Terminal 2:

```bash
npm --prefix frontend run dev
```

Aplicação:

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:4000`

## Funcionalidades

- Cadastro, login e logout
- Recuperação de senha por código enviado por e-mail
- Onboarding do responsável principal
- Painéis familiares com filhos e responsáveis vinculados
- Convite do segundo responsável por link
- Dashboard com visão resumida
- Calendário de convivência e trocas
- Despesas com anexos, comentários e aprovação
- Pensão com vencimento, comprovante e histórico
- Chat com anexos
- Notificações internas
- Push web quando ativado no dispositivo
- Relatórios PDF
- Perfil do usuário
- CRM administrativo

## Variáveis de ambiente

Use `backend/.env.example` como base.

Principais variáveis:

```bash
NODE_ENV=production
CLIENT_URL=https://app.seudominio.com
CLIENT_URLS=https://app.seudominio.com,https://www.app.seudominio.com
APP_BASE_URL=https://app.seudominio.com
JWT_SECRET=troque-este-segredo
COOKIE_SECURE=true
COOKIE_SAME_SITE=none

MAIL_MODE=smtp
MAIL_FROM="CoParental <seuemail@dominio.com>"
SMTP_HOST=
SMTP_PORT=
SMTP_SECURE=
SMTP_USER=
SMTP_PASS=

VAPID_SUBJECT=mailto:seuemail@dominio.com
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
```

## Produção

- Configure domínio real com HTTPS
- Ajuste `CLIENT_URL`, `CLIENT_URLS` e `APP_BASE_URL`
- Defina um `JWT_SECRET` forte
- Ative SMTP real
- Configure VAPID para push
- O backend valida parte dessas configurações ao iniciar em produção

## Observações

- O fluxo principal foi validado com smoke test cobrindo cadastro, onboarding, convite, perfil, calendário, despesas, pensão, chat, notificações e relatórios.
- WhatsApp está preparado no backend, mas pode permanecer desativado sem afetar o fluxo principal de venda.
