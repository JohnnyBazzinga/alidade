// The hook over the Session driver (design §5): one driver per Sensor source, stopped when the
// source changes or the component unmounts. The permission request runs synchronously inside the
// caller's tap (design D4).

import type { SensorSource } from '@alidade/sensors';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { SessionParameters } from '../math/session/parameters';
import type { Session, SessionKind } from '../math/session/session';
import type { ActionRequest } from '../math/session/session-events';
import type { UiFailure, UiResult } from '../result';
import { createSessionDriver, type SessionDriver } from './session-driver';
import type { Timer } from './timer';

export interface SightingSessionDeps {
  /** `null` until a source exists. */
  readonly source: SensorSource | null;
  readonly kind: SessionKind;
  /** Must be stable between renders: a new object restarts the Session. */
  readonly parameters: SessionParameters;
  readonly timer: Timer;
}

export interface SightingSession {
  readonly session: Session | null;
  /** Set when the driver could not be created (a bad parameter). */
  readonly failure: UiFailure | null;
  /** Call from a tap. */
  readonly requestPermission: () => void;
  readonly dispatch: (action: ActionRequest) => void;
  readonly camera: (result: UiResult<null>) => void;
}

export function useSightingSession(deps: SightingSessionDeps): SightingSession {
  const { source, kind, parameters, timer } = deps;
  const driver = useRef<SessionDriver | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [failure, setFailure] = useState<UiFailure | null>(null);

  useEffect(() => {
    setSession(null);
    setFailure(null);
    if (source === null) return undefined;
    const created = createSessionDriver({ source, kind, parameters, timer, onSession: setSession });
    if (!created.ok) {
      setFailure(created);
      return undefined;
    }
    driver.current = created.value;
    setSession(created.value.session());
    return () => {
      created.value.stop();
      if (driver.current === created.value) driver.current = null;
    };
  }, [source, kind, parameters, timer]);

  const requestPermission = useCallback(() => {
    void driver.current?.requestPermission();
  }, []);
  const dispatch = useCallback((action: ActionRequest) => driver.current?.dispatch(action), []);
  const camera = useCallback((result: UiResult<null>) => driver.current?.camera(result), []);
  return { session, failure, requestPermission, dispatch, camera };
}
