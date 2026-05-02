'use client';

import { useEffect } from 'react';

// Root page — LOCKED. Redirects to user-specific routes.
// The old public dashboard URL is now deactivated.
export default function LockedPage() {
  useEffect(() => {
    // Try to auto-redirect based on localStorage
    const savedSlug = localStorage.getItem('omnichannel_user_slug');
    if (savedSlug) {
      window.location.href = `/u/${savedSlug}`;
    }
  }, []);

  return (
    <div className="flex items-center justify-center min-h-screen bg-[#0d1117] text-white">
      <div className="text-center max-w-md">
        <div className="text-6xl mb-6">🔒</div>
        <h1 className="text-2xl font-bold mb-3">Доступ ограничен</h1>
        <p className="text-slate-400 mb-8">
          Для входа в дашборд используйте вашу персональную ссылку
        </p>
        <div className="flex flex-col gap-3">
          <a
            href="/u/andrey"
            className="bg-blue-600 hover:bg-blue-500 text-white rounded-lg px-6 py-3 text-sm font-medium transition-colors"
          >
            Войти как Андрей
          </a>
          <a
            href="/u/vladimir"
            className="bg-slate-700 hover:bg-slate-600 text-white rounded-lg px-6 py-3 text-sm font-medium transition-colors"
          >
            Войти как Владимир
          </a>
        </div>
        <p className="text-xs text-slate-600 mt-8">
          OmniChannel v4.0 · Каждый видит только свои диалоги
        </p>
      </div>
    </div>
  );
}
