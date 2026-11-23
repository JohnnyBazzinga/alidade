# Requirement coverage — vigia

Generated at the final checkpoint (task 18) by the rule of skeleton-ui’s file: a criterion is listed
against every test file that cites it (`Req N.M`, lists, ranges and a whole requirement `Req N`) or
names a property of design §11 whose row lists it (`P-N.M`). File names are relative to
`apps/vigia/src`, without `.test`. The criteria that no test cites by number are listed with what
covers them, read by hand; two are marked **gap** or **partial**. Requirement 12 (the hotspot
Overlay) is the second release and is not built: its criteria are marked so.

Every FOR ALL criterion of the first release has its property in design §11 and a test: P-2.6,
P-3.9, P-4.7, P-4.10, P-5.10 to P-5.13, P-6.2, P-6.8, P-6.9, P-6.10, P-7.7, P-7.8, P-8.8, P-8.9,
P-8.10, P-9.6, P-9.7, P-10.9, P-10.10, P-11.9, P-13.6, P-14.8, P-14.9, P-15.9, P-16.4, P-17.9
(28 properties). Each names itself and its requirements in a comment above it and runs at least
200 cases in `pnpm test`. P-12.10 and P-12.11 are the second release.

| Criterion | Covered by |
|---|---|
| 1.1 | purity |
| 1.2 | purity |
| 1.3 | adapters/clipboard, adapters/page-address, adapters/storage, purity |
| 1.4 | purity |
| 1.5 | components/App, purity, system |
| 1.6 | purity |
| 1.7 | math/degrees, purity |
| 1.8 | purity |
| 1.9 | purity |
| 1.10 | components/App, components/MapScreen, components/overlays-cut, components/simulation/SimulationShell.integration, overlays/wind/components/wind-definition, purity |
| 2.1 | adapters/network-gate, hostile-totality.property, math/degrees, math/fix/advice, math/fix/map-model, math/incident/apply-action, math/incident/join, math/incident/sighting, math/network/request-boxes, overlays/wind/math/wind-features, overlays/wind/math/wind-words, result |
| 2.2 | math/messages, reasons |
| 2.3 | components/FailureNotice, hostile-totality.property, math/messages |
| 2.4 | math/messages |
| 2.5 | components/FailureNotice, components/store, math/messages |
| 2.6 | hostile-totality.property, math/assessment/assess, math/fix/format, math/incident/join, math/network/request-boxes |
| 3.1 | components/SightScreen, components/simulation/sight-first-screen (the docked column), components/SightScreen.simulator-offer |
| 3.2 | components/SightScreen |
| 3.3 | components/SightScreen |
| 3.4 | adapters/random, components/SightScreen, components/store, math/incident/ids, math/incident/ids.property, math/incident/sighting |
| 3.5 | components/SightScreen |
| 3.6 | components/SightScreen, components/SightingsScreen, components/question-sigma (the one rule), math/civil-time, math/fix/format |
| 3.7 | components/SightScreen (the line and "How to aim"), components/SightScreen.look (the aiming row), components/common-parts (GuidanceBlock) |
| 3.8 | components/SightScreen, components/store, math/incident/sighting |
| 3.9 | math/incident/ids.property, math/incident/sighting |
| 3.10 | components/simulation/sight-first-screen (device mode, docked: the column, the budget at 390 × 664 and 375 × 667), components/App (the route has no padding) |
| 4.1 | adapters/random, math/incident/ids |
| 4.2 | components/InboxSheet, components/SightScreen (a capture with no smoke open starts it), components/flow-next-step, components/store, math/incident/apply-action |
| 4.3 | components/SightScreen (the question as a view of its own, neither answer preselected), components/store, math/texts |
| 4.4 | adapters/storage, components/store |
| 4.5 | components/SmokeScreen, components/store, math/incident/apply-action, math/incident/storage-format |
| 4.6 | math/incident/merge |
| 4.7 | math/incident/incident-state.property, math/incident/join, math/incident/storage-format |
| 4.8 | components/InboxSheet, components/simulation/SimulationShell.integration, components/store, math/incident/incident-state.property, math/incident/join, math/incident/join.property |
| 4.9 | components/InboxSheet, components/simulation/SimulationShell.integration, components/store, math/incident/join, math/incident/storage-format |
| 4.10 | math/incident/join.property |
| 4.11 | components/SmokeScreen.first-view (the saved line, "Send this sighting"), components/flow-next-step, math/fix/format (savedLineText), hostile-totality |
| 4.12 | components/InboxSheet (Join, Add, Open: onTaken), components/flow-next-step, math/texts (countLineText) |
| 5.1 | components/SightingsScreen, math/assessment/assess, math/assessment/assess.property |
| 5.2 | components/SightingsScreen, math/assessment/assess, math/assessment/assess.property |
| 5.3 | math/assessment/assess, math/assessment/assess.property |
| 5.4 | components/SmokeScreen, components/simulation/SimulationShell.integration, math/assessment/statements, math/scenes/smoke-scenes |
| 5.5 | components/SmokeScreen, math/assessment/assess, math/assessment/assess.property, math/assessment/statements |
| 5.6 | components/SightingsScreen |
| 5.7 | math/assessment/assess |
| 5.8 | math/fix/fix-words |
| 5.9 | **gap:** no Vigia test states it. By construction only: `assess` gives Core’s `solve` the used Bearings, and the time decides only the set-aside causes (math/assessment/assess covers each cause at and either side of its limit) |
| 5.10 | math/assessment/assess, math/assessment/assess.property, test-support/generators |
| 5.11 | math/assessment/assess.property, test-support/generators |
| 5.12 | math/assessment/assess.property |
| 5.13 | math/assessment/assess.property |
| 6.1 | components/MapScreen, components/SmokeScreen, math/assessment/assess |
| 6.2 | components/SmokeScreen, math/fix/emergency-text.property, math/fix/fix-words, math/fix/fix-words.property, math/fix/format, math/fix/format.property |
| 6.3 | components/SmokeScreen, math/fix/fix-words, math/fix/fix-words.property, math/texts |
| 6.4 | components/SmokeScreen, math/fix/emergency-text.property, math/fix/format, math/fix/from-you, math/fix/geometry.property |
| 6.5 | components/SmokeScreen |
| 6.6 | components/SmokeScreen |
| 6.7 | math/fix/fix-words |
| 6.8 | math/fix/fix-words.property |
| 6.9 | math/fix/from-you, math/fix/geometry.property |
| 6.10 | math/fix/fix-words.property |
| 6.11 | components/MapScreen, math/fix/emergency-text, math/fix/fix-words, math/fix/map-model |
| 6.12 | components/SmokeScreen.first-view (the first view, its words, the two disclosures), components/App ("Show on map") |
| 7.1 | math/fix/geometry-class, math/fix/geometry.property |
| 7.2 | components/SmokeScreen, math/fix/advice |
| 7.3 | components/SmokeScreen, math/fix/advice |
| 7.4 | components/SmokeScreen, components/SmokeScreen.look (the card with the schematic), math/fix/advice |
| 7.5 | components/SmokeScreen, math/fix/advice |
| 7.6 | math/fix/advice |
| 7.7 | math/fix/advice.property |
| 7.8 | math/fix/geometry.property |
| 7.9 | math/fix/advice |
| 8.1 | math/code/sighting-code |
| 8.2 | math/code/alphabet |
| 8.3 | *not cited:* math/code/sighting-code.property (P-8.9: the link on a 109-character address is at most 160), math/code/code-link (110 characters is `link_too_long`), adapters/qr-encoder (a 77-character link is version 5); the reading at arm’s length is Device check V1 |
| 8.4 | math/code/sighting-code, math/code/sighting-code.property, math/incident/sighting |
| 8.5 | math/code/sighting-code |
| 8.6 | math/code/gf31-check, math/code/sighting-code, math/code/sighting-code.property |
| 8.7 | math/code/sighting-code |
| 8.8 | math/code/sighting-code.property |
| 8.9 | math/code/sighting-code.property |
| 8.10 | math/code/sighting-code.property |
| 8.11 | math/code/sighting-code |
| 9.1 | adapters/transport/manual-transport, adapters/transport/memory-network |
| 9.2 | adapters/transport/memory-network |
| 9.3 | components/ShareSheet, components/store |
| 9.4 | components/InboxSheet, components/store, math/fix/format, math/incident/apply-action |
| 9.5 | adapters/transport/transports.property, components/SightingsScreen, math/incident/apply-action, math/incident/merge |
| 9.6 | adapters/transport/transports.property |
| 9.7 | adapters/transport/transports.property |
| 9.8 | *not cited:* components/store (`transport_unavailable` when the Transport stops), components/ShareSheet (the link, QR and text stay offered); adapters/transport/manual-transport, adapters/transport/memory-network |
| 9.9 | adapters/transport/transports.property, test-support/relay-like-transport |
| 10.1 | adapters/clipboard, adapters/transport/manual-transport, components/ShareSheet, math/privacy-table |
| 10.2 | math/code/code-link, math/code/code-link.property, math/privacy-table |
| 10.3 | adapters/page-address, components/App, components/InboxSheet, components/store, components/store.property, math/privacy-table |
| 10.4 | components/InboxSheet, math/code/code-link, math/code/code-link.property, math/privacy-table |
| 10.5 | adapters/qr-encoder, components/QrImage, components/ShareSheet, math/privacy-table, purity |
| 10.6 | adapters/qr-encoder, components/QrImage, components/ShareSheet, math/privacy-table |
| 10.7 | components/ShareSheet, components/simulation/SimulationShell.integration, math/privacy-table, readme |
| 10.8 | components/ShareSheet, math/privacy-table |
| 10.9 | math/assessment/assess, math/code/code-link, math/code/code-link.property, math/privacy-table, test-support/generators |
| 10.10 | components/store.property, math/privacy-table |
| 10.11 | components/ShareSheet (the order, the statement, the two choices, Other ways, the QR view), components/simulation/SimulationShell.integration |
| 10.12 | components/flow-next-step (every view opens at the top), components/ShareSheet, components/InboxSheet |
| 11.1 | adapters/network-gate, adapters/network-gate.property, purity |
| 11.2 | math/network/host-list, purity |
| 11.3 | adapters/network-gate, adapters/network-gate.property, hostile-totality.property, math/network/gate-decision, math/network/gate-decision.property |
| 11.4 | build-output, math/network/host-list, math/network/tile-setup |
| 11.5 | purity |
| 11.6 | purity, readme |
| 11.7 | adapters/network-gate, adapters/network-gate.property |
| 11.8 | *not cited:* components/MapScreen (the plain background with no Tile source), components/simulation/SimulationShell.integration (the whole flow with a refusing gate and while offline) |
| 11.9 | adapters/network-gate, adapters/network-gate.property, hostile-totality.property, math/network/gate-decision, math/network/gate-decision.property |
| 12.1 | *second release (the hotspot Overlay): not built*; cited by overlays/wind/components/wind-controller |
| 12.2 | *second release (the hotspot Overlay): not built*; cited by overlays/wind/components/wind-controller |
| 12.3 | *second release (the hotspot Overlay): not built*; cited by math/network/request-boxes |
| 12.4 | *second release (the hotspot Overlay): not built* |
| 12.5 | *second release (the hotspot Overlay): not built* |
| 12.6 | *second release (the hotspot Overlay): not built* |
| 12.7 | *second release (the hotspot Overlay): not built* |
| 12.8 | *second release (the hotspot Overlay): not built* |
| 12.9 | *second release (the hotspot Overlay): not built* |
| 12.10 | *second release (the hotspot Overlay): not built* |
| 12.11 | *second release (the hotspot Overlay): not built* |
| 13.1 | components/MapScreen, components/simulation/SimulationShell.integration, overlays/wind/components/wind-controller, overlays/wind/components/wind-definition, purity |
| 13.2 | components/simulation/SimulationShell.integration, components/store.property, math/network/host-list, math/network/request-boxes, overlays/wind/components/wind-controller, overlays/wind/math/wind-features, overlays/wind/math/wind-parse |
| 13.3 | components/simulation/SimulationShell.integration, overlays/wind/components/wind-controller, overlays/wind/math/wind-features, overlays/wind/math/wind-parse.property, overlays/wind/math/wind-words |
| 13.4 | components/simulation/SimulationShell.integration, overlays/wind/components/wind-controller, overlays/wind/math/wind-words |
| 13.5 | components/simulation/SimulationShell.integration, math/texts |
| 13.6 | components/simulation/SimulationShell.integration, overlays/wind/math/wind-parse, overlays/wind/math/wind-parse.property |
| 13.7 | components/simulation/SimulationShell.integration, components/store.property, overlays/wind/components/wind-controller, overlays/wind/components/wind-definition, overlays/wind/math/wind-words |
| 14.1 | math/civil-time, math/fix/emergency-text, math/fix/emergency-text.property |
| 14.2 | components/EmergencyScreen, math/fix/emergency-text |
| 14.3 | components/EmergencyScreen, math/fix/emergency-text, math/fix/emergency-text.property |
| 14.4 | adapters/clipboard, components/EmergencyScreen |
| 14.5 | components/EmergencyScreen, components/SmokeScreen, math/texts |
| 14.6 | components/EmergencyScreen, math/fix/emergency-text.property |
| 14.7 | components/EmergencyScreen, math/fix/emergency-text |
| 14.8 | math/fix/emergency-text.property |
| 14.9 | math/fix/emergency-text.property |
| 14.10 | math/fix/emergency-text |
| 14.11 | math/fix/emergency-text, math/parameters |
| 15.1 | components/store.property |
| 15.2 | components/ShareSheet (the statement, always visible), math/texts |
| 15.3 | components/PrivacyPage, math/privacy-table, readme |
| 15.4 | components/store.property, readme |
| 15.5 | components/SightingsScreen, components/store |
| 15.6 | components/ShareSheet |
| 15.7 | components/InboxSheet (the line and "Why check this?") |
| 15.8 | components/InboxSheet |
| 15.9 | components/store.property |
| 16.1 | components/SmokeScreen, components/common-parts, math/texts |
| 16.2 | components/SightScreen, components/common-parts, math/texts |
| 16.3 | **partial:** the Messages of `compass_unreliable` and `coarse_location` are UI’s, shown by UI’s `DeviceSighting` (skeleton-ui’s tests); Vigia’s components/FailureNotice shows every UI reason through `messageFor`, but no Vigia screen test makes the sensor report them |
| 16.4 | math/fix/emergency-text.property |
| 16.5 | *not cited:* components/SightScreen.simulator-offer (no sensor: the refusal is shown and the simulator offered), components/InboxSheet and components/simulation/SimulationShell.integration (a received sighting, the Fix and the Emergency text with no sensor) |
| 17.1 | components/App, components/Root, components/SightScreen.simulator-offer, components/simulation/SimulationShell, components/simulation/simulated-phone, math/start-mode |
| 17.2 | math/scenes/smoke-scenes |
| 17.3 | components/simulation/SimulationShell.integration |
| 17.4 | components/App, components/InboxSheet, components/ShareSheet, components/common-parts, components/simulation/SimulationShell, components/simulation/SimulationShell.integration, components/simulation/simulated-phone, overlays/wind/components/wind-controller, purity |
| 17.5 | components/simulation/SimulationShell, components/simulation/simulated-phone |
| 17.6 | components/simulation/SimulationShell.integration |
| 17.7 | components/simulation/SimulationShell.integration |
| 17.8 | math/scenes/smoke-scenes |
| 17.9 | math/scenes/coverage.property, test-support/capture-from-script |
| 18.1 | components/MapScreen |
| 18.2 | components/MapScreen, purity |
| 18.3 | components/MapScreen, math/fix/map-model |
| 18.4 | components/MapScreen, overlays/wind/components/wind-controller, overlays/wind/math/wind-features |
| 18.5 | components/MapScreen |
| 18.6 | components/MapScreen, math/network/tile-setup |
| 18.7 | math/fix/map-model |
| 19.1 | adapters/network-gate, defaults, math/fix/emergency-text, math/parameters |
| 19.2 | math/parameters, purity |
| 19.3 | adapters/network-gate, hostile-totality.property, math/assessment/assess, math/fix/format, math/incident/join, math/network/request-boxes, math/parameters |
| 19.4 | defaults |
| 20.1 | purity |
| 20.2 | purity |
| 20.3 | purity |
| 20.4 | adapters/qr-encoder, purity |
| 20.5 | purity |
| 21.1 | *not cited:* every `*.property.test.ts` (a comment names the property and its requirements; 200 cases in `pnpm test` by test-support/fast-check-setup), test-support/generators (domains stated); P-2.6’s list is complete by its own test |
| 21.2 | components/simulation/SimulationShell.integration |
| 21.3 | *not cited:* the files of `adapters/` (each against a fake of the browser object it wraps) |
| 21.4 | components/FailureNotice |
| 21.5 | *not cited:* purity (no clock, random or network in the Math layer), test-support/fake-* and seeded-normal (seeds and times are arguments) |
| 21.6 | *not cited:* the shrunk counterexamples kept as examples (math/incident/join: seeds 456561989 and 679858833; components/store.property: seed 1160607519); the fixtures are synthetic and no test writes them |
| 21.7 | *not cited:* package.json (`test` is `vitest run`); no task starts a server or a watch mode |
| 22.1 | components/SmokeScreen.look, components/SightScreen.look, components/field-screens.look (the departures: inks, sizes, the header, equal answers) |
| 22.2 | components/art/Header, components/App (the header by route), components/header-context |
| 22.3 | components/theme-choice |
| 22.4 | components/look, components/no-colour-literals; skeleton-ui components/theme/palette (the pairs) |
| 22.5 | components/TabBar |
| 22.6 | components/SmokeScreen.look, components/SmokeScreen.first-view, components/SmokeScreen |
| 22.7 | components/field-screens.look (Sightings), components/SightingsScreen |
| 22.8 | components/SightScreen.look, components/simulation/sight-first-screen (the budget) |
| 22.9 | components/SightScreen (the question), components/question-sigma, components/header-context |
| 22.10 | components/field-screens.look (Share, QR, Emergency, privacy, Delete), components/InboxSheet, components/ShareSheet |
| 22.11 | components/SmokeScreen.look, components/field-screens.look, components/TabBar; skeleton-ui components/Icon, components/icon-use, components/Disclosure |
| 22.12 | components/art/Schematic |
| 22.13 | skeleton-ui components/ImageSurface (the frame), components/SightScreen.look |
| 22.14 | the tests above; the pixels and the references are Device checks 12 to 14 of skeleton-ui |
| 22.15 | math/texts (word for word) |
| 21.8 | components/simulation/sight-first-screen (rewritten), components/SmokeScreen.first-view, components/ShareSheet, components/InboxSheet, components/SightScreen, components/flow-next-step, components/look |
