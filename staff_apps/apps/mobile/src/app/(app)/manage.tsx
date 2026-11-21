import { router, type Href } from 'expo-router';
import { Pressable, View } from 'react-native';

import { useSession } from '@/lib/hooks';
import { Button, Card, ErrorText, Eyebrow, Screen, Title, Txt } from '@/ui/kit';
import { useHand } from '@/ui/theme';

const SECTIONS: { href: Href; title: string; hint: string }[] = [
  { href: '/menu', title: 'Menyu', hint: "Mahsulot, bo'lim, narx, retsept" },
  { href: '/templates', title: 'Shablonlar', hint: 'Tez-tez buyurtmalar: bir bosishda savatga' },
  { href: '/inventory', title: 'Ombor', hint: 'Qoldiq, kirim, sanash, yo‘qotish' },
  { href: '/customers', title: 'Mijozlar', hint: 'Nasiya daftari, qarzni qaytarish' },
  { href: '/floor', title: 'Stollar', hint: 'Stol, zona, QR kod' },
  { href: '/staff', title: 'Xodimlar', hint: 'Ro‘yxat, davomat, kirish kodlari' },
  { href: '/devices', title: 'Qurilmalar', hint: 'Yangi telefonlarni tasdiqlash' },
  { href: '/printers', title: 'Printerlar', hint: 'Oshxona va kassa cheklari' },
  { href: '/settings', title: 'Sozlamalar', hint: 'Restoran, xizmat haqi, Telegram' },
];

/** Menejer boshqaruv markazi: barcha sozlash va ma'lumot kiritish bo'limlariga yo'l. */
export default function ManageHub() {
  const { user } = useSession();
  const hand = useHand();
  const isManager = user?.role === 'manager';
  return (
    <Screen>
      <View style={{ flexDirection: hand.headerDirection, alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Eyebrow>Menejer</Eyebrow>
          <Title size={48}>Boshqaruv</Title>
        </View>
        <Button title="← Stollar" variant="ghost" compact onPress={() => router.back()} />
      </View>
      {!isManager && <ErrorText>Bu bo'lim faqat menejer uchun.</ErrorText>}
      {isManager &&
        SECTIONS.map((s) => (
          <Pressable key={s.title} accessibilityRole="button" onPress={() => router.push(s.href)}>
            <Card style={{ minHeight: 64, justifyContent: 'center', gap: 2 }}>
              <Txt size={17} weight={600}>
                {s.title}
              </Txt>
              <Txt size={14} tone="muted">
                {s.hint}
              </Txt>
            </Card>
          </Pressable>
        ))}
    </Screen>
  );
}
