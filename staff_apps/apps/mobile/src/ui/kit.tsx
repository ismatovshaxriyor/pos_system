import type { Palette } from '@pos/design';
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FONT, useTheme } from './theme';

/** Ranglar nomi bo'yicha (matn va nuqtalar uchun). `signal` faqat xato/asosiy amal. */
export type Tone = 'ink' | 'muted' | 'signal' | 'ok' | 'warnInk' | 'onSignal';

function toneColor(c: Palette, tone: Tone): string {
  switch (tone) {
    case 'muted':
      return c.ink60;
    case 'signal':
      return c.signal;
    case 'ok':
      return c.ok;
    case 'warnInk':
      return c.warnInk;
    case 'onSignal':
      return c.onSignal;
    default:
      return c.ink;
  }
}

/** Yumshoq soya (kun mavzusida). Tunda soya ko'rinmaydi - chegara yetarli. */
export function useLift(): ViewStyle {
  const { name } = useTheme();
  if (name === 'night') return {};
  return Platform.select<ViewStyle>({
    ios: { shadowColor: '#1F1F1E', shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
    default: { elevation: 1.5 },
  }) as ViewStyle;
}

interface TxtProps {
  children: ReactNode;
  /** Asosiy (o'lchamsiz) px; matn o'lchami sozlamasiga ko'ra kattalashadi. */
  size?: number;
  family?: 'body' | 'mono' | 'disp';
  weight?: 400 | 500 | 600;
  tone?: Tone;
  upper?: boolean;
  align?: TextStyle['textAlign'];
  numberOfLines?: number;
  /** Bir qatorga sig'masa shrift kichrayadi (tor kartalardagi summa uchun). */
  fit?: boolean;
  style?: StyleProp<TextStyle>;
}

/** Yagona matn komponenti: shrift, rang va o'lcham sozlamasi shu yerda. */
export function Txt({ children, size = 16, family = 'body', weight = 400, tone = 'ink', upper, align, numberOfLines, fit, style }: TxtProps) {
  const { c, scale } = useTheme();
  const fontFamily =
    family === 'disp'
      ? FONT.disp
      : family === 'mono'
        ? weight >= 500
          ? FONT.mono500
          : FONT.mono400
        : weight >= 600
          ? FONT.body600
          : weight >= 500
            ? FONT.body500
            : FONT.body400;
  const fs = Math.round(size * scale);
  return (
    <Text
      numberOfLines={numberOfLines}
      adjustsFontSizeToFit={fit}
      minimumFontScale={fit ? 0.7 : undefined}
      style={[
        {
          color: toneColor(c, tone),
          fontFamily,
          fontSize: fs,
          lineHeight: Math.round(fs * (family === 'disp' ? 1.05 : 1.4)),
          textAlign: align,
          textTransform: upper || family === 'disp' ? 'uppercase' : undefined,
          fontVariant: family === 'mono' ? ['tabular-nums'] : undefined,
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

/**
 * Ekran. `footer` - scroll'dan tashqarida, pastga mahkamlangan (savat paneli, asosiy tugma).
 */
export function Screen({
  children,
  scroll = true,
  footer,
  onRefresh,
  refreshing = false,
}: {
  children: ReactNode;
  scroll?: boolean;
  footer?: ReactNode;
  /** Berilsa, ro'yxatni pastga tortib yangilash yoqiladi. */
  onRefresh?: () => void;
  refreshing?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const { c } = useTheme();
  const pad = { paddingTop: insets.top + 16, paddingBottom: footer ? 16 : insets.bottom + 24 };
  const body = scroll ? (
    <ScrollView
      contentContainerStyle={[contentStyle, pad]}
      keyboardShouldPersistTaps="handled"
      style={{ flex: 1 }}
      refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.ink60} /> : undefined}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[contentStyle, pad, { flex: 1 }]}>{children}</View>
  );
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.paper }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {body}
      {footer}
    </KeyboardAvoidingView>
  );
}

const contentStyle: ViewStyle = { paddingHorizontal: 20, gap: 14, maxWidth: 560, width: '100%', alignSelf: 'center' };

export function Title({ children, size = 40 }: { children: ReactNode; size?: number }) {
  return (
    <Txt family="disp" size={size}>
      {children}
    </Txt>
  );
}

/** Sarlavha ustidagi kichik yorliq (sentence-case, harf oralig'isiz). */
export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <Txt size={14} weight={500} tone="muted">
      {children}
    </Txt>
  );
}

export function Muted({ children }: { children: ReactNode }) {
  return (
    <Txt size={15} tone="muted">
      {children}
    </Txt>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  return (
    <Txt size={15} tone="signal">
      {children}
    </Txt>
  );
}

export function Field({ label, ...props }: TextInputProps & { label: string }) {
  const { c, scale } = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <Txt size={14} weight={500} tone="muted">
        {label}
      </Txt>
      <TextInput
        placeholderTextColor={c.ink60}
        autoCapitalize="none"
        autoCorrect={false}
        {...props}
        style={{
          backgroundColor: c.card,
          borderColor: c.grid,
          borderWidth: 1,
          borderRadius: 14,
          color: c.ink,
          fontFamily: FONT.body400,
          fontSize: Math.round(17 * scale),
          paddingHorizontal: 16,
          // 52dp: ofitsiantlar bir qo'lda, shoshib bosadi
          minHeight: 52,
        }}
      />
    </View>
  );
}

type ButtonVariant = 'primary' | 'ghost' | 'danger' | 'ink';

/**
 * `primary` (qizil) - ekrandagi YAGONA asosiy amal. `ghost` - ikkilamchi. `danger` - xavfli amal:
 * qizil emas, siyoh kontur (tasodifiy bosilmasin, tasdiq so'raladi). `ink` - tasdiqlash.
 */
export function Button({
  title,
  onPress,
  loading,
  disabled,
  variant = 'primary',
  compact,
}: {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: ButtonVariant;
  compact?: boolean;
}) {
  const { c, appearance } = useTheme();
  const lift = useLift();
  const inactive = disabled || loading;
  const bg = variant === 'primary' ? c.signal : variant === 'ink' ? c.ink : c.card;
  const border = variant === 'primary' ? c.signal : variant === 'ink' || variant === 'danger' ? c.ink : c.grid;
  const fg: Tone = variant === 'primary' ? 'onSignal' : 'ink';
  const fgColor = variant === 'ink' ? c.paper : undefined;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={inactive}
      style={({ pressed }) => [
        {
          backgroundColor: bg,
          borderColor: border,
          borderWidth: 1,
          borderRadius: 16,
          minHeight: compact ? 44 : 56,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: compact ? 14 : 20,
        },
        variant !== 'ink' && lift,
        inactive && { opacity: 0.45 },
        pressed && { opacity: 0.9, transform: appearance.reduceMotion ? undefined : [{ scale: 0.985 }] },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? c.onSignal : c.ink} />
      ) : (
        <Txt size={compact ? 15 : 17} weight={600} tone={fg} style={fgColor ? { color: fgColor } : undefined}>
          {title}
        </Txt>
      )}
    </Pressable>
  );
}

/** Matnli havola-tugma (kam ahamiyatli amal: "Serverni o'zgartirish"). */
export function LinkButton({ title, onPress }: { title: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
      <Txt size={15} weight={500} tone="muted" style={{ textDecorationLine: 'underline' }}>
        {title}
      </Txt>
    </Pressable>
  );
}

/** Segment: tanlangan = oq kartochka + yupqa chiziq (qora to'ldirish emas). */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: 'row', backgroundColor: c.panel, borderRadius: 14, padding: 4, gap: 4 }}>
      {options.map((o) => {
        const active = value === o.value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(o.value)}
            style={{
              flex: 1,
              minHeight: 46,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 11,
              borderWidth: 1,
              borderColor: active ? c.grid : 'transparent',
              backgroundColor: active ? c.card : 'transparent',
            }}
          >
            <Txt size={15} weight={600} tone={active ? 'ink' : 'muted'}>
              {o.label}
            </Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Card({ children, edge, style }: { children: ReactNode; edge?: string; style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  const lift = useLift();
  return (
    <View
      style={[
        {
          backgroundColor: c.card,
          borderRadius: 16,
          borderWidth: 1,
          borderColor: c.grid,
          borderLeftWidth: edge ? 5 : 1,
          borderLeftColor: edge ?? c.grid,
          padding: 16,
          gap: 8,
        },
        lift,
        style,
      ]}
    >
      {children}
    </View>
  );
}

/** Kichik pilyula (holat/vaqt). `warn` - uzoq kutgan, `ok` - to'langan. */
export function Pill({ label, kind = 'neutral' }: { label: string; kind?: 'neutral' | 'warn' | 'ok' }) {
  const { c } = useTheme();
  const bg = kind === 'warn' ? c.warnSoft : kind === 'ok' ? c.okSoft : c.panel;
  const tone: Tone = kind === 'warn' ? 'warnInk' : kind === 'ok' ? 'ok' : 'muted';
  return (
    <View style={{ backgroundColor: bg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, alignSelf: 'flex-start' }}>
      <Txt size={13} weight={500} tone={tone}>
        {label}
      </Txt>
    </View>
  );
}

/** Ofitsiant bosh harfi (doira). */
export function Avatar({ name }: { name: string }) {
  const { c } = useTheme();
  return (
    <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: c.panel, alignItems: 'center', justifyContent: 'center' }}>
      <Txt size={12} weight={600} tone="muted">
        {name.charAt(0).toUpperCase()}
      </Txt>
    </View>
  );
}
