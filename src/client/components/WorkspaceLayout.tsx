import React, { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
export function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const previousPath = useRef('');
  useEffect(() => {
    if (previousPath.current === pathname) return;
    previousPath.current = pathname;
    window.scrollTo(0, 0);
    const focusHeading = () => {
      const heading = document.querySelector<HTMLElement>('#main-content h1');
      if (!heading) return false;
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
      document.title = `${heading.textContent} · KARYA`;
      return true;
    };
    const observer = new MutationObserver(() => { if (focusHeading()) observer.disconnect(); });
    observer.observe(document.getElementById('main-content') || document.body, { subtree: true, childList: true });
    if (focusHeading()) observer.disconnect();
    return () => observer.disconnect();
  }, [pathname]);
  return <div className={user ? 'app-shell authenticated' : 'app-shell public-shell'}>{children}</div>;
}
