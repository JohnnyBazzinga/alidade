// Setup of the `components` project (test support, not exported): unmounts what each test rendered.

import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(cleanup);
