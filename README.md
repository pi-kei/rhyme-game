# rhyme-game
Multiplayer game based on rhyming

**Work in progress...**

## Tech

- Server part is a module that runs inside [heroiclabs/nakama](https://heroiclabs.com/).
- Client part is a [React](https://create-react-app.dev/) app.
- TypeScript is used for both client and server parts.


## Dev setup

You can run all in one docker compose command from the project root:

```
docker-compose up
```

Alternatively you can run server part separately from client part.

To run server locally:

```
cd server && docker-compose up
```

To run client locally:

```
cd client && yarn install && yarn start
```
