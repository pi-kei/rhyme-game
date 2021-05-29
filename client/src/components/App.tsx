import React from 'react';
import { BrowserRouter as Router, Route } from 'react-router-dom';
import Game from './Game';
import Welcome from './Welcome';

function App() {
  return (
    <Router>
      <Route path="/" exact component={Welcome} />
      <Route path="/game/:id?" component={Game} />
    </Router>
  );
}

export default App;
