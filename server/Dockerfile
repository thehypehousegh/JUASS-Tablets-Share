FROM node:20-alpine AS base
WORKDIR /app

COPY package.json package-lock.json* ./
COPY prisma ./prisma
RUN npm install

COPY tsconfig.json ./
COPY src ./src
RUN npm run prisma:generate && npm run build

RUN mkdir -p uploads
EXPOSE 4000
CMD ["sh", "-c", "npm run prisma:migrate && npm start"]
