import React, { useState, useEffect } from 'react';
import Navbar from './components/Navbar';
import Hero from './components/Hero';
import Features from './components/Features';
import InteractiveDemo from './components/InteractiveDemo';
import Architecture from './components/Architecture';
import Pricing from './components/Pricing';
import LicenseChecker from './components/LicenseChecker';
import DemoModal from './components/DemoModal';
import Footer from './components/Footer';
import LoadingScreen from './components/LoadingScreen';
import NotFound from './components/NotFound';

export default function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [currentPath, setCurrentPath] = useState(window.location.pathname);
  const [isDemoModalOpen, setIsDemoModalOpen] = useState(false);

  useEffect(() => {
    // Initial preloader timeout for smooth UX transition
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 600);

    const handlePopState = () => {
      setCurrentPath(window.location.pathname);
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  const navigateToHome = () => {
    window.history.pushState({}, '', '/');
    setCurrentPath('/');
  };

  if (isLoading) {
    return <LoadingScreen />;
  }

  // Handle 404 for unknown paths (e.g. /404, /unknown, etc.)
  if (currentPath !== '/' && currentPath !== '' && !currentPath.startsWith('/#')) {
    return <NotFound onGoHome={navigateToHome} />;
  }

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
