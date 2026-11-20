import { Archivo_400Regular, Archivo_500Medium, Archivo_600SemiBold } from '@expo-google-fonts/archivo';
import { BigShouldersDisplay_700Bold } from '@expo-google-fonts/big-shoulders-display';
import { IBMPlexMono_400Regular, IBMPlexMono_500Medium } from '@expo-google-fonts/ibm-plex-mono';
import { useFonts } from 'expo-font';
import { SplashScreen, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useSession } from '@/lib/hooks';
import { pos } from '@/lib/pos';
import { FONT, ThemeProvider, useTheme } from '@/ui/theme';

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
        <Shell />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

function Shell() {
  const session = useSession();
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

  // Real-time faqat kirgan holatda. Bloklanganda yoki chiqqanda yopiladi.
  useEffect(() => {
    if (session.status !== 'signed_in') return;
    pos.realtime.start();
    return () => pos.realtime.stop();
  }, [session.status]);

  if (session.status === 'loading' || !fontsReady) return null;

  const hasServer = !!session.serverUrl;

  // Himoya faqat klient tomonda (UX). Haqiqiy huquq tekshiruvi serverda.
  return (
    <>
      <StatusBar style={name === 'night' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.paper } }}>
        <Stack.Protected guard={!hasServer}>
          <Stack.Screen name="connect" />
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
    </>
  );
}
