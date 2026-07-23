import React, { useState } from 'react';
import Navbar from './components/Navbar';
import Hero from './components/Hero';
import Features from './components/Features';
import InteractiveDemo from './components/InteractiveDemo';
import Architecture from './components/Architecture';
import Pricing from './components/Pricing';
import LicenseChecker from './components/LicenseChecker';
import DemoModal from './components/DemoModal';
import Footer from './components/Footer';

export default function App() {
  const [isDemoModalOpen, setIsDemoModalOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#001712] text-[#c7eade] font-sans">
      <Navbar onOpenDemo={() => setIsDemoModalOpen(true)} />
      <main>
        <Hero onOpenDemo={() => setIsDemoModalOpen(true)} />
        <Features />
        <InteractiveDemo />
        <Architecture />
        <Pricing onOpenDemo={() => setIsDemoModalOpen(true)} />
        <LicenseChecker />
      </main>
      <Footer />

      <DemoModal
        isOpen={isDemoModalOpen}
        onClose={() => setIsDemoModalOpen(false)}
      />
    </div>
  );
}
