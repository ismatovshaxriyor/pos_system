import React from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { Header } from './components/Header';
import { BottomNav } from './components/BottomNav';
import { ToastNotification } from './components/ToastNotification';
import { HomeScreen } from './components/HomeScreen';
import { MenuScreen } from './components/MenuScreen';
import { DishDetailScreen } from './components/DishDetailScreen';
import { WaiterScreen } from './components/WaiterScreen';
import { BillScreen } from './components/BillScreen';

import { OurStoryModal } from './components/modals/OurStoryModal';
import { EmirChamberModal } from './components/modals/EmirChamberModal';
import { CutleryModal } from './components/modals/CutleryModal';
import { FeedbackModal } from './components/modals/FeedbackModal';
import { SplitBillModal } from './components/modals/SplitBillModal';
import { PaymentModal } from './components/modals/PaymentModal';

const AppContent: React.FC = () => {
  const { currentScreen } = useApp();

  return (
    <div className="min-h-screen bg-[#001712] text-[#C7EADE] font-sans-body relative overflow-x-hidden selection:bg-[#E3C282] selection:text-[#001712]">
      {/* Header Bar */}
      <Header />

      {/* Main Screen Views */}
      <main>
        {currentScreen === 'home' && <HomeScreen />}
        {currentScreen === 'menu' && <MenuScreen />}
        {currentScreen === 'dish-detail' && <DishDetailScreen />}
        {currentScreen === 'waiter' && <WaiterScreen />}
        {currentScreen === 'bill' && <BillScreen />}
      </main>

      {/* Floating Bottom Navigation (Suppressed only when on dish-detail for focus, or visible throughout) */}
      <BottomNav />

      {/* Toast Notification */}
      <ToastNotification />

      {/* Modals */}
      <OurStoryModal />
      <EmirChamberModal />
      <CutleryModal />
      <FeedbackModal />
      <SplitBillModal />
      <PaymentModal />
    </div>
  );
};

export default function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}
