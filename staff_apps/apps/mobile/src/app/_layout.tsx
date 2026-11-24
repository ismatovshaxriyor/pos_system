import { Archivo_400Regular, Archivo_500Medium, Archivo_600SemiBold } from '@expo-google-fonts/archivo';
import { BigShouldersDisplay_700Bold } from '@expo-google-fonts/big-shoulders-display';
import { IBMPlexMono_400Regular, IBMPlexMono_500Medium } from '@expo-google-fonts/ibm-plex-mono';
import { useFonts } from 'expo-font';
import { SplashScreen, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { findServerOnNetwork } from '@/lib/findServer';
import { useServerRecovery, useSession } from '@/lib/hooks';
import { pos } from '@/lib/pos';
import { useAppUpdate } from '@/lib/update';
import { FONT, ThemeProvider, useTheme } from '@/ui/theme';
import { ToastProvider } from '@/ui/toast';
import { UpdateBanner, UpdateRequired } from '@/ui/update';
import { WaiterCallAlert } from '@/ui/waitercall';

// Saqlangan sessiya o'qilguncha splash ushlab turiladi (login ekrani "yaltillab" ketmasin).
SplashScreen.preventAutoHideAsync();

/** Shriftlar ilova ichida (offline) - internetsiz ham dizayn o'zgarmaydi. */
const FONT_MAP = {
  [FONT.body400]: Archivo_400Regular,
  [FONT.body500]: Archivo_500Medium,
  [FONT.body600]: Archivo_600SemiBold,
  [FONT.disp]: BigShouldersDisplay_700Bold,
  [FONT.mono400]: IBMPlexMono_400Regular,
  [FONT.mono500]: IBMPlexMono_500Medium,
};

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <ToastProvider>
          <Shell />
        </ToastProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

function Shell() {
  const session = useSession();
  const update = useAppUpdate(session.serverUrl);
  // Server IP'si o'zgarsa (tarmoq almashdi) manzil o'zi yangilanadi - qo'lda qayta ulanish shart emas.
  useServerRecovery(findServerOnNetwork);
  const { c, name } = useTheme();
  // Xato bo'lsa ham (masalan, shrift fayli ochilmasa) ilova tizim shrifti bilan ishlayveradi.
  const [fontsLoaded, fontError] = useFonts(FONT_MAP);
  const fontsReady = fontsLoaded || !!fontError;

  useEffect(() => {
    void pos.session.load();
  }, []);

  useEffect(() => {
    if (session.status !== 'loading' && fontsReady) SplashScreen.hide();
  }, [session.status, fontsReady]);

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

  if (session.status === 'loading' || !fontsReady) return null;

  const hasServer = !!session.serverUrl;

  // Majburiy yangilanish hamma narsadan oldin (bloklangan tizimda ham yetib boradi).
  if (hasServer && update.required) {
    return (
      <>
        <StatusBar style={name === 'night' ? 'light' : 'dark'} />
        <UpdateRequired state={update} />
      </>
    );
  }

  // Himoya faqat klient tomonda (UX). Haqiqiy huquq tekshiruvi serverda.
  return (
    <>
      <StatusBar style={name === 'night' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.paper } }}>
        <Stack.Protected guard={!hasServer}>
          <Stack.Screen name="connect" />
        </Stack.Protected>
        <Stack.Protected guard={hasServer && session.status === 'needs_activation'}>
          <Stack.Screen name="setup" />
        </Stack.Protected>
        <Stack.Protected guard={hasServer && session.status === 'license_blocked'}>
          <Stack.Screen name="blocked" />
        </Stack.Protected>
        <Stack.Protected guard={hasServer && session.status === 'signed_out'}>
          <Stack.Screen name="login" />
        </Stack.Protected>
        <Stack.Protected guard={hasServer && session.status === 'signed_in'}>
          <Stack.Screen name="(app)" />
        </Stack.Protected>
      </Stack>
      {hasServer && update.optional && <UpdateBanner state={update} />}
      {session.status === 'signed_in' && <WaiterCallAlert />}
    </>
  );
}
