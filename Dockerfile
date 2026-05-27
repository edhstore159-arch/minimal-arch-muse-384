# ---------- Stage 1: build Vite frontend ----------
FROM node:20-alpine AS build
WORKDIR /app

# Vite envs precisam estar disponíveis no build (Render injeta automaticamente como build args)
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ARG VITE_SUPABASE_PROJECT_ID
ARG VITE_GOOGLE_MAPS_API_KEY
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY \
    VITE_SUPABASE_PROJECT_ID=$VITE_SUPABASE_PROJECT_ID \
    VITE_GOOGLE_MAPS_API_KEY=$VITE_GOOGLE_MAPS_API_KEY

# Copia manifestos primeiro para cache de deps
COPY package.json package-lock.json* ./

# npm ci falha quando lockfile diverge — fallback para install garante deploy
RUN npm ci --no-audit --no-fund || npm install --no-audit --no-fund --legacy-peer-deps

COPY . .
RUN npm run build

# ---------- Stage 2: nginx serve ----------
FROM nginx:alpine

# Template para usar a porta que Render fornecer em runtime ($PORT)
COPY nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html

ENV PORT=8080
EXPOSE 8080

CMD ["/bin/sh", "-c", "envsubst '$PORT' < /etc/nginx/templates/default.conf.template > /etc/nginx/conf.d/default.conf && nginx -g 'daemon off;'"]
