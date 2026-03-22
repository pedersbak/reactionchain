# =============================================================
# Build stage — resolves iris-ui via path alias, outputs dist/
# =============================================================
FROM node:20-alpine AS builder
WORKDIR /app

# The build context is the reactionchain folder itself.
# iris-ui is a git submodule at iris-ui/ inside this repo.
COPY . ./reactionchain/

WORKDIR /app/reactionchain
RUN npm install
RUN npm run build

# =============================================================
# Runtime stage — serve with nginx on port 80
# =============================================================
FROM nginx:alpine

RUN rm /etc/nginx/conf.d/default.conf

RUN printf 'server {\n\
    listen 5173;\n\
    root /usr/share/nginx/html;\n\
    index index.html;\n\
\n\
    # Proxy auth API — strips /api/auth prefix, mirrors Vite dev proxy\n\
    location /api/auth/ {\n\
        proxy_pass https://netvrk.nu/;\n\
        proxy_set_header Host netvrk.nu;\n\
        proxy_ssl_server_name on;\n\
    }\n\
\n\
    # Proxy CVR network API\n\
    location /api/cvr/ {\n\
        proxy_pass https://netvrk.nu/cvradapter/;\n\
        proxy_set_header Host netvrk.nu;\n\
        proxy_set_header Authorization $http_authorization;\n\
        proxy_pass_header Authorization;\n\
        proxy_ssl_server_name on;\n\
    }\n\
\n\
    # Proxy suggest API\n\
    location /api/suggest {\n\
        proxy_pass https://netvrk.nu/suggest;\n\
        proxy_set_header Host netvrk.nu;\n\
        proxy_ssl_server_name on;\n\
    }\n\
\n\
    # SPA fallback\n\
    location / {\n\
        try_files $uri $uri/ /index.html;\n\
    }\n\
}\n' > /etc/nginx/conf.d/app.conf

COPY --from=builder /app/reactionchain/dist /usr/share/nginx/html

EXPOSE 5173
CMD ["nginx", "-g", "daemon off;"]
