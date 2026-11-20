import { useEffect } from 'react';

import { BootstrapProvider, useSession } from './lib/hooks';
import { pos } from './lib/pos';
import { BlockedScreen } from './screens/Blocked';
import { ConnectScreen } from './screens/Connect';
import { HomeScreen } from './screens/Home';
import { LoginScreen } from './screens/Login';

export function App() {
  const session = useSession();

  useEffect(() => {
    void pos.session.load();
  }, []);

  // Real-time faqat kirgan holatda. Bloklanganda yoki chiqqanda yopiladi.
  useEffect(() => {
    if (session.status !== 'signed_in') return;
    pos.realtime.start();
    return () => pos.realtime.stop();
  }, [session.status]);

  if (session.status === 'loading') return null;
  if (!session.serverUrl) return <ConnectScreen />;
  if (session.status === 'license_blocked') return <BlockedScreen />;
  if (session.status === 'signed_out') return <LoginScreen />;

  // `key` - kassir almashganda (smena) bootstrap holati tozadan boshlansin.
  return (
    <BootstrapProvider key={session.user?.id}>
      <HomeScreen />
    </BootstrapProvider>
  );
}
