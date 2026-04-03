# =============================================================
# Build stage — resolves iris-ui via path alias, outputs dist/
# =============================================================
FROM node:20-alpine AS builder
WORKDIR /app/reactionchain

# Copy app files first, then overwrite iris-ui submodule with actual
# content — ensures it's populated even if the submodule wasn't
# initialised in the build context.
COPY . .
COPY iris-ui/ ./iris-ui/

# Install deps for iris-ui first so React types are available when
# TypeScript compiles iris-ui source files from reactionchain's build.
WORKDIR /app/reactionchain/iris-ui
RUN npm install

WORKDIR /app/reactionchain
RUN npm install
RUN npm run build

# =============================================================
# Runtime stage — serve static files with 'serve'
# No inner nginx needed — the outer nginx container handles
# SSL, routing, and proxying to upstream APIs.
# =============================================================
FROM node:20-alpine
RUN npm install -g serve
COPY --from=builder /app/reactionchain/dist /app/dist
EXPOSE 5173
CMD ["serve", "-s", "/app/dist", "-l", "5173"]
