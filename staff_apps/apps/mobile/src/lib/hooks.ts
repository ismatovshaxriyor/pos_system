import { createPosHooks } from '@pos/shared/react';

import { pos } from './pos';

/** Sessiya, real-time va bootstrap hook'lari - kassir ilovasi bilan umumiy (`@pos/shared/react`). */
export const { useSession, useRealtimeStatus, useRealtimeRefresh, useServerRecovery, BootstrapProvider, useBootstrap } =
  createPosHooks(pos);
