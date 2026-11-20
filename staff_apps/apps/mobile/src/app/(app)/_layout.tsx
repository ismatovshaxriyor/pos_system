import { Stack } from 'expo-router';

import { BootstrapProvider } from '@/lib/hooks';
import { useTheme } from '@/ui/theme';

export default function AppLayout() {
  const { c } = useTheme();
  return (
    <BootstrapProvider>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.paper } }} />
    </BootstrapProvider>
  );
}
