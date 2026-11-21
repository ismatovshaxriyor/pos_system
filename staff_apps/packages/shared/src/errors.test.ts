import { describe, expect, it } from 'vitest';
import { apiErrorFromResponse, composeMessage, defaultMessageForStatus, describeError, localizeMessage } from './errors';

describe('xato xabarlari', () => {
  it("noto'g'ri parol: server xabari o'zgarishsiz, aniq ko'rinadi", () => {
    const err = apiErrorFromResponse(400, {
      detail: "Telefon raqami yoki parol noto'g'ri.",
      code: 'validation_error',
      fields: {},
    });
    expect(describeError(err)).toBe("Telefon raqami yoki parol noto'g'ri.");
  });

  it("eski server inglizcha yuborsa ham o'zbekcha ko'rinadi", () => {
    const err = apiErrorFromResponse(400, {
      detail: 'Validatsiya xatosi.',
      code: 'validation_error',
      fields: { non_field_errors: ['Unable to log in with provided credentials.'] },
    });
    expect(describeError(err)).toBe("Telefon raqami yoki parol noto'g'ri.");
  });

  it("maydon nomi bilan: 'Parol: ...'", () => {
    const err = apiErrorFromResponse(400, {
      detail: "Ma'lumotlar to'g'ri kiritilmagan.",
      fields: { password: ['This field is required.'] },
    });
    expect(describeError(err)).toBe("Parol: Bu maydon to'ldirilishi shart.");
    expect(err.fields.password).toEqual(["Bu maydon to'ldirilishi shart."]);
  });

  it("ichma-ich maydon xatosi '[object Object]' bo'lib qolmaydi", () => {
    const err = apiErrorFromResponse(400, {
      detail: "Ma'lumotlar to'g'ri kiritilmagan.",
      fields: { items: [{ quantity: ['A valid integer is required.'] }] },
    });
    const text = describeError(err);
    expect(text).not.toContain('[object');
    expect(text).toBe('Miqdor: Butun son kiriting.');
  });

  it("detail bo'lmasa, status bo'yicha tushunarli xabar", () => {
    expect(describeError(apiErrorFromResponse(502, '<html>'))).toContain('ishlamayapti');
    expect(describeError(apiErrorFromResponse(404, null))).toContain('Topilmadi');
    expect(defaultMessageForStatus(418)).toContain('418');
  });

  it("serverning o'z o'zbekcha xabariga tegmaydi", () => {
    expect(localizeMessage("Kassa yopiq - yangi buyurtma qabul qilib bo'lmaydi.")).toBe(
      "Kassa yopiq - yangi buyurtma qabul qilib bo'lmaydi.",
    );
  });

  it('aniq sarlavha maydon xatosi bilan birga ko‘rsatiladi', () => {
    expect(composeMessage('Buyurtmani yopib bo‘lmaydi.', { amount: ['Son kiriting.'] })).toBe(
      'Buyurtmani yopib bo‘lmaydi. Summa: Son kiriting.',
    );
  });
});
