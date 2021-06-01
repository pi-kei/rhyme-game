const express = require('express');
const helmet = require("helmet");
const cors = require('cors');
const path = require('path');
const multiavatar = require('@multiavatar/multiavatar');

const app = express();

app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: false, // TODO: fix
  crossOriginEmbedderPolicy: true,
  crossOriginOpenerPolicy: true,
  crossOriginResourcePolicy: true,
  expectCt: false,
  hsts: false,
  frameguard: { action: 'sameorigin' },
  hidePoweredBy: true,
  xssFilter: true
}));
app.options('*', cors());
app.use(cors({origin: false}));

// TODO: force https
// TODO: proxy settings

app.use(express.static(path.join(__dirname, '..', 'build'))); // TODO: set options

app.get('/avatar/:id', function (req, res) {
    const svg = multiavatar(req.params.id);
    res.type('image/svg+xml');
    res.setHeader('Cache-Control', `public, max-age=${365 * 24 * 60 * 60}`);
    res.send(Buffer.from(svg));
});

app.get('/*', function (req, res) {
  res.sendFile(path.join(__dirname, '..', 'build', 'index.html'));
});

app.listen(process.env.PORT || 9000);