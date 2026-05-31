# Kenia WhatsApp Backend

Servidor Node/Express + Baileys que expõe `/api/whatsapp/*` para o frontend.

## Deploy no Render (Web Service)

1. Faça commit/push da pasta `backend/` no mesmo repo.
2. No Render: **New + → Web Service** → conecte o repo.
3. Configure:
   - **Root Directory:** `backend`
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Plan:** Free (ou superior)
4. Adicione um **Disk** (1 GB) montado em `/opt/render/project/src/backend/auth` e a variável `AUTH_DIR=/opt/render/project/src/backend/auth` — necessário para persistir a sessão Baileys entre restarts.
5. Após o deploy, copie a URL pública (ex.: `https://kenia-whatsapp-backend.onrender.com`).

> Alternativa: use **New + → Blueprint** apontando para o `backend/render.yaml` — todas as opções acima já estão definidas.

## Conectar o frontend

No serviço do frontend (Static Site), em **Environment**, adicione:

```
VITE_BACKEND_URL=https://kenia-whatsapp-backend.onrender.com
```

Depois rode **Manual Deploy → Clear build cache & deploy** no frontend (variáveis `VITE_*` só entram no bundle em build time).

## Parear o WhatsApp

1. Abra o painel do frontend → tela de WhatsApp.
2. Aparecerá o QR Code (vindo de `/api/whatsapp/qr`).
3. Escaneie no app WhatsApp → Dispositivos conectados.
4. O status muda para "Conectado" e o aviso de modo estático desaparece.

## Endpoints

- `GET  /api/health`
- `GET  /api/whatsapp/diagnostics`
- `GET  /api/whatsapp/baileys/status`
- `GET  /api/whatsapp/baileys/qr`
- `GET  /api/whatsapp/qr`           → `{ qr: dataURL }`
- `GET  /api/whatsapp/qr/image`     → PNG
- `POST /api/whatsapp/send`         → `{ to, message }`
- `POST /api/whatsapp/logout`
