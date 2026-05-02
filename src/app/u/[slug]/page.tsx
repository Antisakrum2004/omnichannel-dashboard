'use client';

import { useEffect, useState } from 'react';
import { use } from 'react';
import dynamic from 'next/dynamic';
import { isValidUser } from '@/lib/sources';

// Dynamic import to avoid SSR issues with the large dashboard component
const OmnichannelDashboard = dynamic(
  () => import('@/components/OmnichannelDashboard'),
  { ssr: false }
);

export default function UserDashboardPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const [valid, setValid] = useState<boolean | null>(null);

  useEffect(() => {
    if (isValidUser(slug)) {
      setValid(true);
      // Save slug for auto-redirect on root page
      localStorage.setItem('omnichannel_user_slug', slug);
    } else {
      setValid(false);
    }
  }, [slug]);

  if (valid === null) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#0d1117] text-white">
        <div className="text-center">
          <div className="text-2xl mb-2">⏳</div>
          <div>Загрузка...</div>
        </div>
      </div>
    );
  }

  if (!valid) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#0d1117] text-white">
        <div className="text-center max-w-md">
          <div className="text-6xl mb-6">🚫</div>
          <h1 className="text-2xl font-bold mb-3">Доступ запрещён</h1>
          <p className="text-slate-400 mb-8">
            Пользователь «{slug}» не найден в системе
          </p>
          <a
            href="/"
            className="bg-blue-600 hover:bg-blue-500 text-white rounded-lg px-6 py-3 text-sm font-medium transition-colors"
          >
            На главную
          </a>
        </div>
      </div>
    );
  }

  return <OmnichannelDashboard userSlug={slug} />;
}
