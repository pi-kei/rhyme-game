import React from "react";
import { BrowserRouter as Router, Route, Redirect } from "react-router-dom";
import { AlertProvider } from "./Alert";
import Game from "./Game";
import Welcome from "./Welcome";

function App() {
  return (
    <AlertProvider>
      <Router>
        <Route path="/" exact component={Welcome} />
        <Route path="/game/:id?" component={Game} />
      </Router>
    </AlertProvider>
  );
}

export default App;
