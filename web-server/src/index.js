const express = require('express');
const helmet = require("helmet");
const cors = require('cors');
const path = require('path');
const multiavatar = require('@multiavatar/multiavatar');

const app = express();

app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: false, // TODO: fix
  crossOriginEmbedderPolicy: false,
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

app.use(express.static(process.env.CLIENT_BUILD_PATH)); // TODO: set options

app.get('/avatar/:id', function (req, res) {
    let svg = String(multiavatar(req.params.id));
    // https://bugzilla.mozilla.org/show_bug.cgi?id=700533
    svg = svg.replace(/viewBox\=\"(\d+) (\d+) (\d+) (\d+)\"/, 'viewBox="$1 $2 $3 $4" width="$3" height="$4"');
    res.type('image/svg+xml');
    res.setHeader('Cache-Control', `public, max-age=${365 * 24 * 60 * 60}`);
    res.send(Buffer.from(svg));
});

app.get('/*', function (req, res) {
  res.sendFile(path.join(process.env.CLIENT_BUILD_PATH, 'index.html'));
});

app.listen(process.env.PORT || 9000);