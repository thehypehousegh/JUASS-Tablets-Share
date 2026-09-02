# Builds the whole app (React client + Express/Prisma server) as a single
# deployable image. The server serves the built client itself, so this is
# the only image that needs to run in production.
#
# Build context must be the repository root, e.g.:
#   docker build -t juass-tablets-share -f Dockerfile .

# ---- client ----
FROM node:20-alpine AS client-build
WORKDIR /app/client
COPY client/package.json client/package-lock.json* ./
RUN npm install
COPY client ./
RUN npm run build

# ---- server (compile TypeScript) ----
FROM node:20-alpine AS server-build
WORKDIR /app/server
COPY server/package.json server/package-lock.json* ./
COPY server/prisma ./prisma
RUN npm install
COPY server/tsconfig.json ./
COPY server/src ./src
RUN npm run build

# ---- runtime ----
FROM node:20-alpine AS runtime
WORKDIR /app/server
ENV NODE_ENV=production

COPY server/prisma ./prisma
COPY --from=server-build /app/server/package.json /app/server/package-lock.json* ./
RUN npm install --omit=dev

COPY --from=server-build /app/server/dist ./dist
COPY --from=client-build /app/client/dist /app/client/dist

RUN mkdir -p uploads
EXPOSE 4000
CMD ["sh", "-c", "npm run prisma:migrate && node dist/index.js"]
