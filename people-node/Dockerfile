FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
COPY apps ./apps
COPY packages ./packages
COPY turbo.json tsconfig.base.json ./
RUN npm install
RUN npm run build

FROM node:22-alpine AS node
WORKDIR /app
COPY --from=build /app /app
ENV PEER_ID=node-1
ENV PORT=4001
ENV GOSSIP_PORT=4002
ENV DATA_DIR=/data/node-1
ENV NODE_ENV=production
# OPS-M2: fail closed by default; `docker run` without the dev compose override must not
# expose dev endpoints. docker-compose.yml's dev profile sets this back to "1".
ENV ALLOW_DEV_ENDPOINTS=0
EXPOSE 4001 4002
CMD ["npm", "--workspace", "@people/node", "run", "start"]

FROM node:22-alpine AS web
WORKDIR /app
COPY --from=build /app /app
ENV NODE_API_URL=http://node:4001
EXPOSE 3000
CMD ["npm", "--workspace", "@people/web", "run", "start"]
