'use client';

import { useEffect } from 'react';
import { use } from 'react';

// Old /u/andrey and /u/vladimir routes — now redirect to root
// The new architecture uses a single URL with webhook-based personalization
export default function UserRedirectPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);

  useEffect(() => {
    // Redirect to root — user will enter their webhook there
    window.location.href = '/';
  }, [slug]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-[#0d1117] text-white">
      <div className="text-center">
        <div className="text-2xl mb-2">⏳</div>
        <div>Перенаправление...</div>
      </div>
    </div>
  );
}
