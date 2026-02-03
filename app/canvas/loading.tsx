'use client';

import { Loader2 } from 'lucide-react';

export default function CanvasLoading() {
  return (
    <div className="h-dvh w-full bg-[#050506] flex flex-col items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="relative">
          <div className="absolute inset-0 bg-linear-to-br from-amber-500 to-orange-600 rounded-2xl blur-xl opacity-40 animate-pulse" />
          <div className="relative w-16 h-16 bg-linear-to-br from-amber-500 to-orange-600 rounded-2xl flex items-center justify-center">
            <Loader2 className="w-8 h-8 text-white animate-spin" />
          </div>
        </div>
        <div className="text-center">
          <p className="text-white font-medium text-lg">Loading Canvas...</p>
          <p className="text-gray-500 text-sm mt-1">Preparing your drawing space</p>
        </div>
      </div>
    </div>
  );
}
