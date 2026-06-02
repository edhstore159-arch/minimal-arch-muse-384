# Manual de Deploy no Render — Site Estático

Este projeto está configurado para rodar no Render como **Static Site**. Nesse modo, a aplicação funciona sem servidor Node/Express próprio e usa apenas os arquivos gerados pelo Vite em `dist/`.

Se você não conseguir abrir a documentação externa de troubleshooting, consulte também `TROUBLESHOOTING_LOCAL.md` na raiz deste repositório.

## 1. Preparar o repositório

1. Envie o projeto para um repositório GitHub/GitLab.
2. Confirme que existe o arquivo `render.yaml` na raiz do projeto.
3. Não configure `VITE_BACKEND_URL` se o objetivo for rodar como site estático.

## 2. Criar o serviço no Render

1. Acesse o Render.
2. Clique em **New +**.
3. Escolha **Static Site** — não escolha **Web Service** para este deploy estático.
4. Conecte o repositório deste projeto.
5. Selecione a branch principal.

> Se você já criou como **Web Service**, o Render pode tentar executar `node server.js` e gerar o erro `Cannot find module '/opt/render/project/src/server.js'`. Este projeto não tem `server.js` porque é um frontend Vite estático. A correção recomendada é apagar esse serviço e criar novamente como **Static Site** ou usar **New + → Blueprint**.

## 3. Configurações do Render

Use exatamente estas configurações:

| Campo | Valor |
| --- | --- |
| Runtime | `Static Site` |
| Build Command | `npm install --legacy-peer-deps && npm run build` |
| Publish Directory | `dist` |
| Auto-Deploy | Ativado, se quiser publicar a cada push |
| Start Command | deixe vazio; Static Site não usa start command |

> ⚠️ ATENÇÃO ao colar o Build Command: não inclua aspas (`'` ou `"`) nem crase (`` ` ``) em volta do comando. Cole apenas o texto puro:
> `npm install --legacy-peer-deps && npm run build`
>
> Se aparecer no log `bash: -c: line 1: unexpected EOF while looking for matching \`\`'`, significa que sobrou uma crase ou aspa no campo. Apague tudo e cole novamente sem nenhum caractere extra.
>
> Melhor ainda: use **New + → Blueprint** apontando para o repositório. O Render lê o `render.yaml` automaticamente e evita erros de digitação.

O arquivo `render.yaml` já define essas opções automaticamente quando o Render usa Blueprint.

### Erro: `Cannot find module '/opt/render/project/src/server.js'`

Esse erro significa que o serviço foi configurado como backend Node/Web Service, não como Static Site. Para corrigir:

1. No Render, crie um novo serviço usando **New + → Static Site** ou **New + → Blueprint**.
2. Não use `node server.js` em nenhum campo.
3. Se houver campo **Start Command**, deixe em branco no Static Site.
4. Use somente o **Build Command** `npm install --legacy-peer-deps && npm run build` e **Publish Directory** `dist`.

Alternativa emergencial se você insistir em manter como **Web Service**: use **Build Command** `npm install --legacy-peer-deps && npm run build` e **Start Command** `npm start`. O `npm start` deste projeto apenas serve o `dist/` com Vite Preview; ele não cria backend real nem habilita Baileys.

## 4. Variáveis de ambiente

Configure apenas as variáveis públicas usadas pelo frontend:

```env
VITE_SUPABASE_URL=https://kzlxysxvvlupjtrmxqmb.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt6bHh5c3h2dmx1cGp0cm14cW1iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4OTM3MDUsImV4cCI6MjA5MjQ2OTcwNX0.iU5enYnsJExOHtbwpJKQ4bMGZS8hzQIURi6T2y2EQVM
VITE_SUPABASE_PROJECT_ID=kzlxysxvvlupjtrmxqmb
```

Não adicione `VITE_BACKEND_URL` no deploy estático. Se essa variável for adicionada apontando para uma API inexistente, o painel pode voltar a mostrar erro de backend offline.

> Chat IA, agenda e gerador de imagens usam as funções do Lovable Cloud diretamente no frontend. Se você mantiver `VITE_BACKEND_URL` para o backend do WhatsApp/Baileys, publique também a versão mais recente do frontend e do backend para que o Render receba as novas rotas e prompts.

## 5. Rewrites para React Router

O Render precisa redirecionar todas as rotas para `index.html`, porque o app usa rotas como `/app/whatsapp`.

O `render.yaml` já inclui:

```yaml
routes:
  - type: rewrite
    source: /*
    destination: /index.html
```

## 6. O que funciona em modo estático

- Login e telas do frontend.
- Dados demonstrativos locais via `localStorage`.
- CRM, agenda, financeiro e telas administrativas em modo demonstração.
- Diagnóstico informando quando uma integração real depende de backend.

## 7. O que não funciona sem backend

Estas funções exigem um servidor externo ativo e não funcionam em Static Site puro:

- Conexão real do WhatsApp via Baileys.
- Sidecar Baileys.
- QR Code real de pareamento Baileys.
- Webhooks reais de WhatsApp.
- Envio real de mensagens por API própria.
- Geração real por serviços privados que dependam de servidor.

Quando aparecer **“Modo site estático: sidecar Baileys indisponível”**, isso significa que o deploy estático está correto, mas o recurso de WhatsApp real precisa de backend separado.

## 8. Como publicar

1. Faça commit/push das alterações.
2. No Render, clique em **Manual Deploy** ou aguarde o Auto-Deploy.
3. Depois do deploy, abra a URL pública.
4. Teste rotas internas como `/app/whatsapp` e recarregue a página para confirmar que o rewrite está funcionando.

## 9. Se quiser WhatsApp real depois

Para conectar WhatsApp real, será necessário criar um serviço backend separado e então configurar:

```env
VITE_BACKEND_URL=https://sua-api.onrender.com
```

Só adicione essa variável quando a API estiver online e respondendo em `/api`.