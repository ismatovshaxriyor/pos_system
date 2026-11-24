import React, { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { fetchMenu, fetchTableLive, callWaiter as callWaiterApi } from '../api';
import { getQrCodeFromUrl } from '../../lib/tableParam';
import { MOCK_MENU, mockTable } from '../mockData';
import { Category, Product, TabView, TableLive } from '../types';

const POLL_MS = 15000;

interface SelectedProduct {
  product: Product;
  categoryName: string;
}

interface AppContextType {
  tab: TabView;
  setTab: (tab: TabView) => void;
  menu: Category[];
  menuLoading: boolean;
  table: TableLive | null;
  tableLoading: boolean;
  live: boolean;
  /** Haqiqiy stolda server javob bermayapti, sahifa qayta urinmoqda. */
  reconnecting: boolean;
  /** Server bu QR kodni tanimadi (404). */
  tableMissing: boolean;
  qrCode: string;
  selectedProduct: SelectedProduct | null;
  openProduct: (product: Product, categoryName: string) => void;
  closeProduct: () => void;
  calling: boolean;
  toastOpen: boolean;
  callWaiter: () => void;
  demoEmpty: boolean;
  setDemoEmpty: (empty: boolean) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const qrCode = useRef(getQrCodeFromUrl()).current;

  const [tab, setTabState] = useState<TabView>('menu');
  // Birinchi muvaffaqiyatli javobdan keyin tab o'zi tanlanadi (buyurtma bor -> hisob). Mijoz o'zi tab
  // almashtirgan bo'lsa yoki birinchi javob o'tib ketgan bo'lsa, keyingi so'rovlar uni o'zgartirmaydi.
  const tabLocked = useRef(false);
  const setTab = (next: TabView) => { tabLocked.current = true; setTabState(next); };
  const [menu, setMenu] = useState<Category[]>([]);
  const [menuLoading, setMenuLoading] = useState(true);
  const [table, setTable] = useState<TableLive | null>(null);
  const [tableLoading, setTableLoading] = useState(true);
  const [live, setLive] = useState(true);
  const [reconnecting, setReconnecting] = useState(false);
  const [tableMissing, setTableMissing] = useState(false);
  const [demoEmpty, setDemoEmpty] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<SelectedProduct | null>(null);
  const [calling, setCalling] = useState(false);
  const [toastOpen, setToastOpen] = useState(false);

  // Haqiqiy stol QR'ida (`/table/<uuid>/`) xato bo'lsa soxta demo ma'lumot KO'RSATILMAYDI:
  // mijoz uni haqiqiy narx deb o'ylaydi. Bir martalik uzilish (server qayta ishga
  // tushishi, tunnel, 429) o'tishi bilan sahifa o'zi tiklanadi. Demo faqat `qrCode === 'demo'` da.
  const realTable = qrCode !== 'demo';

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = (attempt: number) => {
      fetchMenu()
        .then((data: Category[]) => { if (!cancelled) { setMenu(data); setMenuLoading(false); } })
        .catch(() => {
          if (cancelled) return;
          if (!realTable) { setMenu(MOCK_MENU); setLive(false); setMenuLoading(false); return; }
          timer = setTimeout(() => load(attempt + 1), Math.min(3000 * 2 ** attempt, 30000));
        });
    };
    load(0);
    return () => { cancelled = true; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    let stillLive = true;

    const load = () => {
      fetchTableLive(qrCode)
        .then((data: TableLive) => {
          if (cancelled) return;
          setTable(data); setReconnecting(false); setTableMissing(false);
          // Buyurtmasi bor stolni ochgan mijoz avvalo hisobni ko'radi (menyu emas). Demo'da menyu qoladi.
          if (!tabLocked.current) {
            tabLocked.current = true;
            if (realTable && data.current_order) setTabState('bill');
          }
        })
        .catch((err: { status?: number }) => {
          if (cancelled) return;
          // Haqiqiy stol: oxirgi ma'lumot qoladi, keyingi so'rovda qayta urinadi.
          // 404 - stol o'chirilgan yoki QR eskirgan: bu aloqa uzilishi emas.
          if (realTable) {
            const missing = err?.status === 404;
            setTableMissing(missing);
            setReconnecting(!missing);
            return;
          }
          stillLive = false;
          setLive(false);
          setTable(mockTable(qrCode, demoEmpty));
        })
        .finally(() => { if (!cancelled) setTableLoading(false); });
    };
    load();
    const interval = setInterval(() => { if (stillLive) load(); }, POLL_MS);
    return () => { cancelled = true; clearInterval(interval); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qrCode]);

  // Demo rejimida "Buyurtma bor / Bo'sh" tugmalari mock stol holatini almashtiradi.
  useEffect(() => {
    if (!live) setTable(mockTable(qrCode, demoEmpty));
  }, [demoEmpty, live, qrCode]);

  const openProduct = (product: Product, categoryName: string) => setSelectedProduct({ product, categoryName });
  const closeProduct = () => setSelectedProduct(null);

  const callWaiter = () => {
    if (calling) return;
    setCalling(true);
    callWaiterApi(qrCode).catch(() => {});
    setToastOpen(true);
    setTimeout(() => { setToastOpen(false); setCalling(false); }, 2600);
  };

  return (
    <AppContext.Provider
      value={{
        tab, setTab,
        menu, menuLoading,
        table, tableLoading,
        live, reconnecting, tableMissing, qrCode,
        selectedProduct, openProduct, closeProduct,
        calling, toastOpen, callWaiter,
        demoEmpty, setDemoEmpty,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
