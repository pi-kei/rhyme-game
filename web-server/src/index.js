const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const path = require("path");
const multiavatar = require("@multiavatar/multiavatar");
const utils = require("./utils");

const app = express();

app.disable("x-powered-by");
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        "child-src": ["'none'"],
        "connect-src": ["'self'", `https://${process.env.REACT_APP_NAKAMA_HOST}`, `wss://${process.env.REACT_APP_NAKAMA_HOST}`],
        "default-src": ["'none'"],
        "font-src": ["'self'", "https://fonts.gstatic.com", "data:"],
        "frame-src": ["'none'"],
        "img-src": ["'self'", "https://api.multiavatar.com", "data:"],
        "media-src": ["'self'"],
        "object-src": ["'none'"],
        "script-src": ["'self'"].concat(utils.calcInlineSciptsHashes(path.join(process.env.CLIENT_BUILD_PATH, "index.html"))),
        "style-src": ["'self'", "https://fonts.googleapis.com/css"],
        "worker-src": ["'none'"],
        "form-action": ["'none'"],
        "frame-ancestors": utils.handleFrameAncestors(process.env.FRAME_ANCESTORS),
      },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: true,
    crossOriginResourcePolicy: true,
    expectCt: true,
    hsts: true,
    frameguard: false,
    hidePoweredBy: true,
    xssFilter: true,
  })
);
app.options("*", cors());
app.use(cors({ origin: false }));

app.get("/avatar/:id", function (req, res) {
  let svg = String(multiavatar(req.params.id));
  // https://bugzilla.mozilla.org/show_bug.cgi?id=700533
  svg = svg.replace(/viewBox\=\"(\d+) (\d+) (\d+) (\d+)\"/, 'viewBox="$1 $2 $3 $4" width="$3" height="$4"');
  res.type("image/svg+xml");
  res.setHeader("Cache-Control", `public, max-age=${365 * 24 * 60 * 60}`);
  res.send(Buffer.from(svg));
});

app.use(
  express.static(process.env.CLIENT_BUILD_PATH, {
    index: false,
    dotfiles: "ignore",
    redirect: false,
    cacheControl: false,
    setHeaders(res, pathStr) {
      if (pathStr.startsWith(path.join(process.env.CLIENT_BUILD_PATH, "static"))) {
        res.setHeader("Cache-Control", `public, max-age=${365 * 24 * 60 * 60}`);
      } else {
        res.setHeader("Cache-Control", `public, max-age=${60 * 60}`);
      }
    },
  })
);

app.get("/*", function (req, res) {
  res.sendFile(path.join(process.env.CLIENT_BUILD_PATH, "index.html"));
});

app.listen(process.env.PORT || 9000);
