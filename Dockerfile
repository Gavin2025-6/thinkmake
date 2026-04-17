FROM node:20-alpine
# force cache bust 2026-04-17
RUN apk add --no-cache openssl
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma
RUN npm install
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["sh", "-c", "npx next start -p ${PORT:-3000}"]
