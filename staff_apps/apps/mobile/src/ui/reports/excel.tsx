import { describeError, type Workbook } from '@pos/shared';
import { useState } from 'react';
import { View } from 'react-native';

import { shareWorkbook } from '@/lib/exportExcel';

import { Button, Txt } from '../kit';

/**
 * "Excel" tugmasi: bosilganda `build` hisobotni (kerak bo'lsa qo'shimcha so'rovlar bilan) .xlsx varaqlariga
 * aylantiradi va ulashish oynasini ochadi. Takroriy bosishdan himoyalangan, xato shu yerning o'zida ko'rinadi.
 */
export function ExcelButton({ build, disabled }: { build: () => Promise<Workbook>; disabled?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await shareWorkbook(await build());
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ gap: 6 }}>
      <Button title="Excel (.xlsx) yuklab olish" variant="ghost" loading={busy} disabled={disabled} onPress={() => void run()} />
      {error && (
        <Txt size={13} tone="muted">
          {error}
        </Txt>
      )}
    </View>
  );
}
