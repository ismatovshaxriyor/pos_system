import { useEffect } from 'react';

import { WaiterCallAlert } from './components/WaiterCallAlert';
import { findServerOnNetwork } from './lib/findServer';
import { BootstrapProvider, useServerRecovery, useSession } from './lib/hooks';
import { useAppUpdate } from './lib/update';
import { pos } from './lib/pos';
import { BlockedScreen } from './screens/Blocked';
import { ConnectScreen } from './screens/Connect';
import { HomeScreen } from './screens/Home';
import { LoginScreen } from './screens/Login';
import { SetupScreen } from './screens/Setup';
import { UpdateBanner, UpdateScreen } from './screens/Update';

/** Yangilanish eslatmasi ilova ustiga tushmasin: u alohida qator, ilova qolgan joyni egallaydi. */
function Shell({ banner, children }: { banner: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="shell">
      <div className="shell-main">{children}</div>
      {banner}
    </div>
  );
}

export function App() {
  const session = useSession();
  const update = useAppUpdate(session.serverUrl);
  // Server IP'si o'zgarsa (tarmoq almashdi) manzil o'zi yangilanadi - qo'lda qayta ulanish shart emas.
  useServerRecovery(findServerOnNetwork);

  useEffect(() => {
    void pos.session.load();
  }, []);

  // Ilova qayta ochilganda saqlangan server hali faollashtirilmagan bo'lishi mumkin (yoki endi faollashtirilgan).
  useEffect(() => {
    if (session.serverUrl && session.status === 'signed_out') void pos.refreshServerState().catch(() => undefined);
  }, [session.serverUrl, session.status]);

  // Real-time faqat kirgan holatda. Bloklanganda yoki chiqqanda yopiladi.
  useEffect(() => {
    if (session.status !== 'signed_in') return;
    pos.realtime.start();
    return () => pos.realtime.stop();
  }, [session.status]);

  if (session.status === 'loading') return null;
  if (!session.serverUrl) return <ConnectScreen />;
  // Majburiy yangilanish hamma narsadan oldin (bloklangan tizimda ham yetib boradi).
  if (update.required) return <UpdateScreen serverUrl={session.serverUrl} state={update} />;
  if (session.status === 'needs_activation') return <SetupScreen />;
  if (session.status === 'license_blocked') return <BlockedScreen />;
  if (session.status === 'signed_out') {
    return (
      <Shell banner={update.optional && <UpdateBanner serverUrl={session.serverUrl} state={update} />}>
        <LoginScreen />
      </Shell>
    );
  }

  // `key` - kassir almashganda (smena) bootstrap holati tozadan boshlansin.
  return (
    <BootstrapProvider key={session.user?.id}>
      <Shell banner={update.optional && <UpdateBanner serverUrl={session.serverUrl} state={update} />}>
        <HomeScreen />
      </Shell>
      <WaiterCallAlert />
    </BootstrapProvider>
  );
}
