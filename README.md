# rhyme-game
Multiplayer game based on rhyming, collaborative poetry (versification)

Check it out here [rhymes-sometimes.ru](https://rhymes-sometimes.ru)

**Work in progress...**

## Tech

- Server part is a module that runs inside [heroiclabs/nakama](https://heroiclabs.com/).
- Client part is a [React](https://create-react-app.dev/) app.
- TypeScript is used for both client and server parts.
- Tested on NodeJs v14.


## Dev setup

To install dependencies and build server code:

```
cd client && yarn install && cd ../server && yarn install && yarn build
```

Then you can run all in one docker compose command from the project root:

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

For pre-commit git-hook to work you have to run this command from project directory `git config core.hooksPath .githooks`. 

### VSCode

Install extensions `dbaeumer.vscode-eslint` and `esbenp.prettier-vscode`.
For prettier to work you have to have in `.vscode/settings.json`:

```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "prettier.requireConfig": true
}
```
