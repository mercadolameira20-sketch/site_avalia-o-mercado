# App de avaliação da loja (Netlify)

Páginas:
- `/`       → clientes (QR code aponta para cá)
- `/admin/` → painel do ADM (senha)

## Como publicar
1. Suba esta pasta para um repositório no GitHub (ou use o Netlify CLI: `npm i -g netlify-cli`, `netlify deploy --prod`).
2. No Netlify: Add new site → Import from Git → escolha o repositório. Publish directory: `public` (já está no netlify.toml).
3. Site configuration → Environment variables:
   - `ADMIN_PASSWORD` = senha do painel (obrigatória)
   - `NOME_LOJA` = nome que aparece no app e na imagem (opcional)
4. Faça um novo deploy (Deploys → Trigger deploy) para a senha valer.
5. Abra `https://SEU-SITE.netlify.app/admin/`, entre com a senha e baixe o cartaz com o QR Code.

Frequência de atualização: padrão 1 hora; o ADM ajusta de 15 min a 24 h no painel.

Observação: arrastar a pasta no "Netlify Drop" NÃO funciona, pois o app usa função de servidor (API) e banco (Netlify Blobs).
