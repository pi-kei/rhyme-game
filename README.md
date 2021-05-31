# rhyme-game
Multiplayer game based on rhyming

**Work in progress...**

## Dev setup

Server based on [heroiclabs/nakama](https://heroiclabs.com/). Install docker and docker compose. To run server locally:

```
cd server && docker-compose -f docker-compose.yml up
```

Client is [React](https://create-react-app.dev/) app. Install nodejs (v14) and yarn. To run client locally:

```
cd client && yarn install && yarn start
```

TypeScript is used for both client and server sides.
