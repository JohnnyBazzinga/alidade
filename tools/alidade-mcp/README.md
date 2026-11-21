# @alidade/mcp

A small MCP server that gives an agent the skeleton's own mathematics as three tools, so that a number is checked against the real code and not against memory. It speaks JSON-RPC 2.0 over standard input and output, written by hand in a few hundred lines, without the MCP SDK and its web server stack. It reads no file, opens no connection and keeps no state. It imports only `@alidade/core` and `@alidade/sensors`.

## Tools

| Tool                   | Takes                                                                                                                                                                               | Gives                                                                                                                                                    |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fix_from_bearings`    | 2 to 64 bearings: `id`, `observer {latDeg, lonDeg}`, `positionAccuracyM`, `timeUtcMs`, `azimuthDeg` (clockwise from **true** north), `azimuthSigmaDeg`; optional `outlierRejection` | The position, the covariance in m², the 1-sigma and the **95 % ellipse in metres**, warnings, excluded ids, residuals; or the reason it failed, in words |
| `magnetic_declination` | `latDeg`, `lonDeg`, `timeUtcMs`                                                                                                                                                     | `declinationDeg` (positive east) and `sigmaDeg`, from the World Magnetic Model 2025                                                                      |
| `local_offset`         | `direction` `to_offset` with `origin` and `position`, or `to_position` with `origin`, `eastM` and `northM` (within ±20 015 087 m)                                                   | `eastM` and `northM`, or the position                                                                                                                    |

Angles are in degrees at this boundary and radians inside, lengths in metres, times in milliseconds since the Unix epoch, UTC. A failure comes back as a tool result with `isError: true` and `{ ok: false, reason, message, field?, id? }`: `reason` is the skeleton's reason or `invalid_arguments`, `message` is plain words, and `field` names the argument at fault. No number in any answer is `NaN` or infinite.

## Protocol versions

It answers both eras of the Model Context Protocol and is stateless, so the order of requests does not matter:

- **`2025-11-25` and `2025-06-18`**: the `initialize` handshake. `initialize` answers the requested version if it is one of these two, otherwise `2025-11-25`. `notifications/initialized` is accepted and not answered.
- **`2026-07-28`**: no handshake. A request that carries `_meta["io.modelcontextprotocol/protocolVersion"]` is served as this version, and its result has `resultType: "complete"`. A version it does not speak gets error `-32022` with the list it does. `server/discover` lists the three versions.

Also: `ping`, `tools/list`, `tools/call`; error codes `-32700`, `-32600`, `-32601`, `-32602`, `-32603`; a line over 1 MiB is answered with `-32600` and the server goes on; closing standard input ends the server with exit code 0. Standard output carries only JSON-RPC, one message per line; diagnostics, if there were any, go to standard error.

## Use it from Kiro

Build it once. The server never builds anything itself; `dist/server.mjs` is not committed.

```
pnpm --filter @alidade/mcp build
```

The workspace file `.kiro/settings/mcp.json` registers it as `alidade`, and the project agent `.kiro/agents/alidade.json` lists `@alidade` among its tools. In Kiro CLI, `/mcp` shows whether it started and its three tools; in the Kiro IDE, look in the MCP Servers view. Start Kiro at the repository root: the command is a relative path (`node tools/alidade-mcp/dist/server.mjs`). The three tools are approved without a prompt, since they read nothing and write nothing. Kiro lists them as `@alidade/fix_from_bearings` and so on.

## A worked example: a synthetic fire seen from two posts

A fire at 30°N, 40°W, in the open Atlantic, made up: it is the catalogue origin of the skeleton's examples, not a real fire or a real place. One post stands 5 km west of it and one 6 km south. Each post sights the smoke with a 1° standard deviation, so the first sees it at azimuth 89.97° (east) and the second at 0° (north). The request is the JSON-RPC message a client sends; the answer is the `structuredContent` of the result. The ellipse is the 95 % ellipse, as the product rule demands: a position never comes without it.

<!-- request:fix -->

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "fix_from_bearings",
    "arguments": {
      "bearings": [
        {
          "id": "post-west",
          "observer": { "latDeg": 29.99998981, "lonDeg": -40.05192228 },
          "positionAccuracyM": 5,
          "timeUtcMs": 1786804200000,
          "azimuthDeg": 89.97403886,
          "azimuthSigmaDeg": 1
        },
        {
          "id": "post-south",
          "observer": { "latDeg": 29.94604078, "lonDeg": -40 },
          "positionAccuracyM": 5,
          "timeUtcMs": 1786804200000,
          "azimuthDeg": 0,
          "azimuthSigmaDeg": 1
        }
      ]
    }
  }
}
```

<!-- answer:fix -->

```json
{
  "ok": true,
  "position": { "latDeg": 30, "lonDeg": -40 },
  "covarianceEnM2": { "varEastM2": 10991.221991, "varNorthM2": 7640.433382, "covEastNorthM2": 0 },
  "ellipse1Sigma": { "semiMajorM": 104.839029, "semiMinorM": 87.409573, "azimuthDeg": 90 },
  "ellipse95": { "semiMajorM": 256.614491, "semiMinorM": 213.952411, "azimuthDeg": 90 },
  "ellipse95Scale": 2.4477,
  "warnings": [],
  "excludedIds": [],
  "residuals": [
    { "id": "post-south", "residualDeg": 0, "normalisedResidual": 0, "studentisedResidual": 0 },
    { "id": "post-west", "residualDeg": 0, "normalisedResidual": 0, "studentisedResidual": 0 }
  ],
  "iterations": 2
}
```

The fix is the fire's own position, and it says how far to trust it: the 95 % ellipse is about 257 m by 214 m, its long axis pointing east-west (azimuth 90°), because a 1° error at 5 km to 6 km of range is about 87 m to 105 m across the line of sight. The residuals are zero because the two bearings are the whole data; with two bearings nothing can check them (a third post would). Numbers here are rounded to 6 decimals, and the test compares them to `1e-6`.

To convert a sighting made with a magnetic compass, ask for the declination first. It is positive east, and the true azimuth is the magnetic azimuth plus the declination:

<!-- request:declination -->

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "magnetic_declination",
    "arguments": { "latDeg": 30, "lonDeg": -40, "timeUtcMs": 1786804200000 }
  }
}
```

<!-- answer:declination -->

```json
{ "ok": true, "declinationDeg": -11.9, "sigmaDeg": 0.321464, "positiveEast": true }
```

That is 11.9° west with a 1-sigma of 0.32°: true azimuth = magnetic azimuth + declination, so a compass there reads 11.9° higher than the true azimuth, and the uncertainty of the model itself goes into the bearing's sigma.

## Tests

`timeout 300 pnpm --filter @alidade/mcp test`. The integration test builds the server into a temporary folder in its setup, starts that file with `node` and speaks the protocol to it over its standard input and output; it leaves no `dist/` behind. `src/readme-example.test.ts` runs the two requests above through the server and compares the answers, so the example cannot go stale.
