FROM node:14 AS builder
WORKDIR /home/node/app
COPY . .
RUN yarn install
RUN yarn build-module

FROM heroiclabs/nakama:3.3.0
COPY --from=builder /home/node/app/data/modules /nakama/data/modules
ENTRYPOINT [ "/bin/sh", "-ecx", "/nakama/nakama migrate up --database.address $DATABASE_URL?sslmode=require && exec /nakama/nakama --name nakama1 --database.address $DATABASE_URL?sslmode=require --logger.level DEBUG --session.token_expiry_sec 7200 --runtime.js_entrypoint index.js --match.max_empty_sec 30 --socket.port $PORT" ]


