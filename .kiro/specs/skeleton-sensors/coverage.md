# Requirement coverage — skeleton-sensors

Generated at checkpoint 18 (rows 12.4 and 12.8 to 12.11 amended at checkpoint 19; rows 1.10, 3.10, 3.11, 12.12 and 12.13 at checkpoint 20) from the test files: a criterion is listed against every test file that cites it
(`Req N.M`, lists and ranges included). Criteria no test cites by number are listed with what covers them.

| Criterion | Covered by |
|---|---|
| 1.1 | purity |
| 1.2 | purity |
| 1.3 | purity |
| 1.4 | browser/browser-sensor-source, orientation-sample |
| 1.5 | browser/browser-sensor-source |
| 1.6 | purity |
| 1.7 | orientation-sample |
| 1.8 | *not cited:* `pnpm typecheck` (strict) and `pnpm lint` (`no-explicit-any`), as in Core |
| 1.9 | *not cited:* review only: unit suffixes on every numeric name |
| 1.10 | index, sensor-result, circular-summary, hostile.property (P-11.8 exports group) |
| 2.1 | *not cited:* rotation.property (P-2.8: the closed formula against an independent product), rotation examples |
| 2.2 | rotation |
| 2.3 | purity |
| 2.4 | rotation |
| 2.5 | orientation-sample |
| 2.6 | orientation-sample, rotation |
| 2.7 | rotation.property |
| 2.8 | rotation.property |
| 2.9 | rotation.property |
| 2.10 | rotation.property |
| 3.1 | *not cited:* ray.property (P-3.7 to P-3.9), ray examples |
| 3.2 | *not cited:* ray examples (azimuth and altitude of rays) |
| 3.3 | ray |
| 3.4 | orientation-sample |
| 3.5 | capture, ray, yaw-reference |
| 3.6 | ray.property |
| 3.7 | ray.property |
| 3.8 | ray.property |
| 3.9 | ray.property |
| 3.10 | ray |
| 3.11 | ray, ray.property (P-3.11a, P-3.11b) |
| 4.1 | purity |
| 4.2 | browser/browser-sensor-source |
| 4.3 | browser/browser-sensor-source, orientation-sample |
| 4.4 | purity |
| 4.5 | browser/browser-sensor-source, orientation-sample |
| 4.6 | *not cited:* yaw-reference (labels of `applyYawReference`), capture (Absolute without Declination is `declination_unknown`) |
| 4.7 | browser/browser-sensor-source |
| 4.8 | browser/browser-sensor-source |
| 4.9 | browser/browser-sensor-source, orientation-sample |
| 4.10 | orientation-sample |
| 5.1 | yaw-reference |
| 5.2 | yaw-reference |
| 5.3 | yaw-reference |
| 5.4 | yaw-reference |
| 5.5 | yaw-reference |
| 5.6 | yaw-reference |
| 5.7 | yaw-reference |
| 5.8 | yaw-reference |
| 5.9 | yaw-reference |
| 5.10 | yaw-reference |
| 5.11 | capture |
| 5.12 | capture |
| 5.13 | capture |
| 5.14 | yaw-reference.property |
| 5.15 | yaw-reference.property |
| 5.16 | yaw-reference |
| 5.17 | capture, frame-reset, yaw-reference |
| 5.18 | capture |
| 6.1 | declination, declination.property |
| 6.2 | purity |
| 6.3 | *not cited:* capture (Absolute-frame 1-sigma `hypot(2°, 0.293665°)`), simulator.property (P-12.7 1-sigma) |
| 6.4 | capture, declination |
| 6.5 | declination |
| 6.6 | declination |
| 6.7 | declination, wmm |
| 6.8 | declination |
| 6.9 | declination |
| 6.10 | declination, wmm |
| 6.11 | declination.property |
| 6.12 | declination, declination.property |
| 7.1 | browser/browser-sensor-source |
| 7.2 | browser/browser-sensor-source, position-fix |
| 7.3 | position-fix |
| 7.4 | position-fix |
| 7.5 | position-fix |
| 7.6 | browser/browser-sensor-source |
| 7.7 | position-fix |
| 7.8 | browser/browser-sensor-source, position-fix |
| 7.9 | position-fix.property |
| 7.10 | position-fix.property |
| 8.1 | capture, sighting-window |
| 8.2 | capture |
| 8.3 | capture |
| 8.4 | capture |
| 8.5 | capture |
| 8.6 | capture, sighting-window |
| 8.7 | capture, sighting-window |
| 8.8 | capture |
| 8.9 | capture |
| 8.10 | capture |
| 8.11 | capture.property |
| 8.12 | capture.property |
| 8.13 | capture.property |
| 8.14 | capture.property |
| 8.15 | capture.property |
| 8.16 | circular-summary |
| 9.1 | *not cited:* capture.property (P-9.7), capture altitude examples |
| 9.2 | capture |
| 9.3 | capture |
| 9.4 | capture |
| 9.5 | capture |
| 9.6 | capture |
| 9.7 | capture, capture.property |
| 9.8 | capture.property |
| 9.9 | capture.property |
| 9.10 | capture, capture.property |
| 10.1 | defaults |
| 10.2 | purity |
| 10.3 | capture, parameters, position-fix, sample-history, sighting-window, yaw-reference |
| 10.4 | *not cited:* review only: the comment on `MIN_SAMPLE_COUNT` |
| 11.1 | sensor-result |
| 11.2 | browser/browser-sensor-source |
| 11.3 | browser/browser-sensor-source |
| 11.4 | browser/browser-sensor-source |
| 11.5 | browser/browser-sensor-source |
| 11.6 | browser/browser-sensor-source |
| 11.7 | browser/browser-sensor-source |
| 11.8 | hostile.property, position-fix, sample-history |
| 11.9 | browser/browser-sensor-source, simulator/simulator |
| 11.10 | browser/browser-sensor-source, simulator/simulator |
| 11.11 | browser/browser-sensor-source, listener-set, simulator/simulator |
| 12.1 | simulator/simulator |
| 12.2 | simulator/simulator |
| 12.3 | simulator/simulator |
| 12.4 | simulator/simulator, simulator/simulator.property (P-12.8 now covers a sequence of control calls) |
| 12.5 | *not cited:* review only: every fixture synthetic except the WMM values (fixtures/wmm2025/SOURCE.md) |
| 12.6 | simulator/direction-to-rotation.property |
| 12.7 | simulator/simulator.property |
| 12.8 | simulator/simulator.property |
| 12.9 | simulator/simulator |
| 12.10 | simulator/simulator, simulator/simulator.property, hostile.property |
| 12.11 | simulator/simulator.property |
| 12.12 | simulator/simulator |
| 12.13 | simulator/simulator, simulator/simulator.property (P-12.13) |
| 13.1 | *not cited:* the task 18 check: every FOR ALL criterion has a property |
| 13.2 | *not cited:* browser/browser-sensor-source against `FakeBrowserEnvironment` |
| 13.3 | *not cited:* browser/browser-sensor-source: insecure_context, sensor_unavailable, permission_denied, permission_required, position_unavailable, position_timeout, invalid_number |
| 13.4 | test-support/fixtures, wmm |
| 13.5 | *not cited:* review only: the fake browser and fixtures are synthetic |
| 14.1 | sample-history |
| 14.2 | sample-history, sample-history.property |
| 14.3 | defaults |
| 14.4 | sample-history |
| 14.5 | sample-history |
| 14.6 | sample-history.property |
| 14.7 | sample-history.property |
| 14.1 | sample-history |
| 14.2 | sample-history, sample-history.property |
| 14.3 | defaults |
| 14.4 | sample-history |
| 14.5 | sample-history |
