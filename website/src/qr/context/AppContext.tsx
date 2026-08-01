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

  const [tab, setTab] = useState<TabView>('menu');
  const [menu, setMenu] = useState<Category[]>([]);
  const [menuLoading, setMenuLoading] = useState(true);
  const [table, setTable] = useState<TableLive | null>(null);
  const [tableLoading, setTableLoading] = useState(true);
  const [live, setLive] = useState(true);
  const [demoEmpty, setDemoEmpty] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<SelectedProduct | null>(null);
  const [calling, setCalling] = useState(false);
  const [toastOpen, setToastOpen] = useState(false);

  useEffect(() => {
    fetchMenu()
      .then((data: Category[]) => setMenu(data))
      .catch(() => { setMenu(MOCK_MENU); setLive(false); })
      .finally(() => setMenuLoading(false));
  }, []);

  useEffect(() => {
    let cancelled = false;
    let stillLive = true;

    const load = () => {
      fetchTableLive(qrCode)
        .then((data: TableLive) => { if (!cancelled) setTable(data); })
        .catch(() => {
          if (cancelled) return;
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
        live, qrCode,
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
