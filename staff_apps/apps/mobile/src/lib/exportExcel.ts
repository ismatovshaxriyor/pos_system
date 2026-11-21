import { buildXlsx, describeError, XLSX_MIME, type Workbook } from '@pos/shared';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

/**
 * Hisobotni .xlsx qilib keshga yozadi va tizimning "Ulashish" oynasini ochadi (Telegram, Drive, pochta, "Faylga saqlash"...).
 * Xato matni foydalanuvchiga ko'rsatishga tayyor (`Error.message`).
 */
export async function shareWorkbook(book: Workbook): Promise<void> {
  try {
    if (!(await Sharing.isAvailableAsync())) throw new Error("Bu qurilmada fayl ulashish mavjud emas.");
    const file = new File(Paths.cache, book.filename);
    if (file.exists) file.delete();
    file.create();
    file.write(buildXlsx(book.sheets));
    await Sharing.shareAsync(file.uri, {
      mimeType: XLSX_MIME,
      dialogTitle: 'Hisobotni Excel sifatida ulashish',
      UTI: 'org.openxmlformats.spreadsheetml.sheet',
    });
  } catch (e) {
    throw new Error(`Excel tayyorlanmadi: ${describeError(e)}`);
  }
}
