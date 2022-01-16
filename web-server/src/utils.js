const crypto = require("crypto");
const fs = require("fs");

function getHash(content) {
  const hash = crypto.createHash("sha384").update(content).digest("base64");
  return `'sha384-${hash}'`;
}

function calcInlineSciptsHashes(htmlPath) {
  const html = fs.readFileSync(htmlPath, "utf-8");
  const matches = html.match(/<script>.*?<\/script>/g); // non-greedy match
  if (!matches) {
    return [];
  }
  return matches.map((match) => getHash(match.slice(8, -9)));
}

function handleFrameAncestors(frameAncestorsStr) {
  if (!frameAncestorsStr) {
    return ["'none'"];
  }
  const list = frameAncestorsStr.split(/\s*,\s*/).filter((a) => !!a);
  if (list.length === 0) {
    return ["'none'"];
  }
  return list;
}

module.exports = {
  calcInlineSciptsHashes,
  handleFrameAncestors,
};
