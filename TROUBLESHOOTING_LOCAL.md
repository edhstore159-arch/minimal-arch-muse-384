# Troubleshooting Local — Lovable e Deploy

Use este arquivo quando você não conseguir abrir a documentação externa de troubleshooting.

## 1. Quando aparecer tela branca ou erro fatal

1. Leia a mensagem completa do erro.
2. Se o erro veio do `DebugErrorThrower`, ele pode ter sido disparado propositalmente pela ferramenta administrativa de debug.
3. Use o botão **Try to Fix** no overlay global da Lovable.
4. Se o erro continuar, volte para uma versão anterior pelo histórico e tente uma instrução menor e mais direta.

## 2. Quando o comportamento está estranho, mas não há erro claro

- Faça um hard refresh no navegador.
- Verifique o console do navegador.
- Teste uma rota por vez.
- Divida o problema em partes menores.
- Use uma instrução objetiva: “analise este erro e proponha uma abordagem diferente antes de editar código”.

## 3. Problemas de UI ou layout

- Envie print da área com problema.
- Explique exatamente o que deveria acontecer.
- Peça uma correção pequena por vez, por exemplo: “centralize este botão e corrija o espaçamento mobile”.

## 4. Problemas de deploy no Render

- Este projeto deve ser publicado como **Static Site**, não como **Web Service**.
- Build Command: `npm install --legacy-peer-deps && npm run build`
- Publish Directory: `dist`
- Start Command: deixe vazio em Static Site.
- Se aparecer `Cannot find module '/opt/render/project/src/server.js'`, o serviço foi criado como backend Node. Recrie como **Static Site** ou use **Blueprint** com o `render.yaml`.

## 5. Quando estiver completamente travado

1. Pare de repetir o mesmo prompt.
2. Volte uma versão estável pelo histórico.
3. Refaça o pedido em etapas menores.
4. Informe o erro completo, a página onde aconteceu e o que você esperava que acontecesse.
