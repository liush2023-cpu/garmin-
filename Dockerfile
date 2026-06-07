FROM node:20-slim AS build

WORKDIR /app

COPY client/package*.json client/
RUN npm --prefix client install

COPY server/package*.json server/
RUN npm --prefix server install

COPY client client
COPY server server

RUN npm --prefix client run build
RUN npm --prefix server run build


FROM node:20-slim

WORKDIR /app

COPY --from=build /app/server/package*.json server/
RUN npm --prefix server install --omit=dev

COPY --from=build /app/server/dist server/dist
COPY --from=build /app/client/dist client/dist

ENV NODE_ENV=production
EXPOSE 4000

CMD ["node", "server/dist/index.js"]
