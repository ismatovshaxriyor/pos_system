import { createPosHooks } from '@pos/shared/react';

import { pos } from './pos';

/** Sessiya, real-time va bootstrap hook'lari - mobil ilova bilan umumiy (`@pos/shared/react`). */
export const { useSession, useRealtimeStatus, useRealtimeRefresh, BootstrapProvider, useBootstrap } =
  createPosHooks(pos);
