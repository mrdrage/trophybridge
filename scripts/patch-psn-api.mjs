import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const cjsPath = require.resolve("psn-api");
const bundlePaths = [cjsPath, path.join(path.dirname(cjsPath), "index.mjs")];

const rawVariable = "([A-Za-z_$][A-Za-z0-9_$]*)";
const field = (name) => `\\s*\\.\\s*${name}`;
const separator = "\\s*,\\s*";

const baseMapperSource =
  `return\\s*\\{\\s*` +
  `accessToken\\s*:\\s*${rawVariable}${field("access_token")}${separator}` +
  `expiresIn\\s*:\\s*\\1${field("expires_in")}${separator}` +
  `idToken\\s*:\\s*\\1${field("id_token")}${separator}` +
  `refreshToken\\s*:\\s*\\1${field("refresh_token")}${separator}` +
  `refreshTokenExpiresIn\\s*:\\s*\\1${field("refresh_token_expires_in")}${separator}` +
  `scope\\s*:\\s*\\1${field("scope")}${separator}` +
  `tokenType\\s*:\\s*\\1${field("token_type")}\\s*\\}`;

const patchedMapperSource = baseMapperSource.replace(
  "\\s*\\}",
  `${separator}error\\s*:\\s*\\1${field("error")}\\s*\\}`,
);

function countMatches(source, patternSource) {
  return [...source.matchAll(new RegExp(patternSource, "g"))].length;
}

function patchBundle(filePath) {
  const source = fs.readFileSync(filePath, "utf8");
  const alreadyPatched = countMatches(source, patchedMapperSource);
  if (alreadyPatched === 2) return;

  const unpatched = countMatches(source, baseMapperSource);
  if (unpatched !== 2) {
    throw new Error(
      `Refusing to patch ${filePath}: expected exactly 2 psn-api 2.18.1 token mappers, found ${unpatched} unpatched and ${alreadyPatched} patched.`,
    );
  }

  const next = source.replace(new RegExp(baseMapperSource, "g"), (match, variable) => {
    return `${match.slice(0, -1)},error:${variable}.error}`;
  });

  if (countMatches(next, patchedMapperSource) !== 2) {
    throw new Error(`Patch verification failed for ${filePath}.`);
  }

  fs.writeFileSync(filePath, next, "utf8");
}

for (const bundlePath of bundlePaths) patchBundle(bundlePath);

console.log("TrophyBridge: verified psn-api 2.18.1 OAuth error preservation patch.");
