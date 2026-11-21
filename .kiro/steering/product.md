---
inclusion: always
---

# Product

Alidade is a skeleton that turns a phone into a sighting instrument. An alidade is the sighting rule found on both the mariner's astrolabe and the fire lookout's Osborne Fire Finder; this project brings that instrument back using a phone's compass, tilt sensors, camera and GPS.

Entry for the Kiroween 2026 hackathon, category **Skeleton Crew**: one lean skeleton plus two distinct applications built on it.

## The three pieces

| Piece | What it does | Who it is for |
|---|---|---|
| `skeleton/` (Alidade) | Reads sensors, lets the user sight a target through the camera, turns sightings into a position fix with an uncertainty ellipse, draws it on a map, and ships a simulator | Developers building any sighting app |
| `apps/vigia` | Several people point their phones at a smoke column; crossing their bearings locates the fire. Overlays wind; satellite hotspots are a second release (Vigia Requirement 12) | Rural residents, volunteer firefighters, emergency dispatchers |
| `apps/nonius` | Measures the altitude of the Sun or stars and fixes the user's own position without GPS | Sailors, navigation students and teachers |

The two apps are duals of the same problem and share one solver:
- Vigia: many observers at known positions, one unknown target.
- Nonius: one observer at an unknown position, many targets (celestial bodies) at known positions.

## Product principles

1. **Never show a position without its uncertainty.** Every fix is drawn with its 95% error ellipse. A confident-looking wrong answer is the worst outcome for an emergency tool.
2. **State limits plainly.** Phone compasses are off by several degrees. The UI says so and shows how calibration improves it.
3. **Works with no install and no account.** Both apps are web apps that open from a link.
4. **Testable without going outside.** Every sensor-driven screen also runs from the simulator, so a reviewer on a laptop can exercise the whole flow.
5. **The skeleton stays lean.** A feature goes into `skeleton/` only if both apps use it. App-specific logic lives in the app.

## Non-goals

- Not a replacement for calling the emergency number. Vigia helps describe where the smoke is; it does not dispatch anyone.
- Not certified navigation equipment. Nonius is a backup and a teaching instrument.
- No native apps, no user accounts, no social features.
