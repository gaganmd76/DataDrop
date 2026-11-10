import { useState, useEffect } from 'react';
import { Footer } from './components/Footer.tsx';
import { HomePage } from './pages/HomePage.tsx';
import { CreateDropPage } from './pages/CreateDropPage.tsx';
import { SuccessPage } from './pages/SuccessPage.tsx';
import { OpenDropPage } from './pages/OpenDropPage.tsx';
import { AboutPage } from './pages/AboutPage.tsx';
import type { CreateDropResult } from './types.ts';

export default function App() {
  const [currentPath, setCurrentPath] = useState<string>(() => window.location.pathname);
  const [createdDrop, setCreatedDrop] = useState<CreateDropResult | null>(null);

  // Sync route state with browser history (back/forward)
  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(window.location.pathname);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigateTo = (path: string) => {
    if (window.location.pathname !== path) {
      window.history.pushState({}, '', path);
    }
    setCurrentPath(path);
  };

  const handleNavigateHome = () => {
    setCreatedDrop(null);
    navigateTo('/');
  };

  const handleNavigateCreate = () => {
    setCreatedDrop(null);
    navigateTo('/create');
  };

  const handleOpenDrop = (key: string) => {
    setCreatedDrop(null);
    navigateTo(`/${key}`);
  };

  const handleNavigateAbout = () => {
    navigateTo('/about');
  };

  const handleDropCreated = (result: CreateDropResult) => {
    setCreatedDrop(result);
  };

  const handleCreateAnother = () => {
    setCreatedDrop(null);
    navigateTo('/create');
  };

  // Route determination
  const cleanPath = currentPath.replace(/^\/+|\/+$/g, '');
  const isHome = cleanPath === '';
  const isCreate = cleanPath === 'create';
  const isAbout = cleanPath === 'about';
  const dropKey = !isHome && !isCreate && !isAbout ? cleanPath : null;

  return (
    <div className="min-h-screen bg-white text-neutral-900 font-sans antialiased selection:bg-neutral-200">
      <main className="w-full max-w-md mx-auto px-4 min-h-screen flex flex-col justify-between pt-8 sm:pt-12">
        <div>

          {createdDrop ? (
            <SuccessPage drop={createdDrop} onCreateAnother={handleCreateAnother} />
          ) : isAbout ? (
            <AboutPage onNavigateHome={handleNavigateHome} />
          ) : isCreate ? (
            <CreateDropPage
              onSuccess={handleDropCreated}
              onBack={handleNavigateHome}
            />
          ) : dropKey ? (
            <OpenDropPage dropKey={dropKey} onNavigateHome={handleNavigateHome} />
          ) : (
            <HomePage
              onStartCreate={handleNavigateCreate}
              onOpenDrop={handleOpenDrop}
            />
          )}
        </div>

        <Footer onNavigateAbout={handleNavigateAbout} />
      </main>
    </div>
  );
}
