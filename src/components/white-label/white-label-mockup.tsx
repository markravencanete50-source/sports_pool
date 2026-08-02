"use client";

export function WhiteLabelMockup() {
  return (
    <div className="relative">
      {/* Visual Mockup of White Label Dashboard */}
      <div className="sticky top-24">
        <div className="relative z-10 bg-black/80 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-2xl transform rotate-1 hover:rotate-0 transition-transform duration-500">
          <div className="absolute -top-3 -right-3 px-3 py-1 bg-primary text-white text-xs font-bold uppercase rounded-full shadow-lg z-20">
            Live Preview
          </div>

          {/* Mockup Header */}
          <div className="flex items-center justify-between gap-4 mb-6 border-b border-white/10 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded bg-blue-600 flex items-center justify-center font-bold text-white shadow-[0_0_15px_rgba(37,99,235,0.5)]">
                <span className="text-lg">B</span>
              </div>
              <div>
                <div className="font-bold text-sm">Barstool Sports Pool</div>
                <div className="text-[10px] text-muted-foreground">
                  pools.barstoolsports.com
                </div>
              </div>
            </div>
            <div className="h-8 w-8 rounded-full bg-white/10" />
          </div>

          {/* Mockup Content */}
          <div className="space-y-4">
            <div className="h-40 bg-gradient-to-br from-blue-600/20 to-indigo-600/20 rounded-xl border border-blue-500/20 p-5 flex flex-col justify-end relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/20 rounded-full blur-2xl" />
              <div className="relative z-10 space-y-1">
                <div className="text-xs uppercase tracking-widest text-blue-400 font-bold">
                  Season Prize Pool
                </div>
                <div className="text-4xl font-black text-white">$150,000</div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="h-24 bg-white/5 rounded-xl border border-white/5 p-3">
                <div className="w-8 h-8 rounded bg-white/10 mb-2" />
                <div className="h-2 w-1/2 bg-white/20 rounded" />
              </div>
              <div className="h-24 bg-white/5 rounded-xl border border-white/5 p-3">
                <div className="w-8 h-8 rounded bg-white/10 mb-2" />
                <div className="h-2 w-1/2 bg-white/20 rounded" />
              </div>
            </div>

            <div className="h-40 bg-white/5 rounded-xl border border-white/5 p-4 space-y-2">
              <div className="flex justify-between items-center mb-4">
                <div className="h-4 w-24 bg-white/20 rounded" />
                <div className="h-4 w-4 bg-white/20 rounded-full" />
              </div>
              <div className="space-y-2">
                <div className="h-8 w-full bg-white/10 rounded flex items-center px-3 gap-2">
                  <div className="w-4 h-4 rounded-full bg-white/20" />
                  <div className="h-2 w-1/2 bg-white/20 rounded" />
                </div>
                <div className="h-8 w-full bg-white/10 rounded flex items-center px-3 gap-2">
                  <div className="w-4 h-4 rounded-full bg-white/20" />
                  <div className="h-2 w-1/2 bg-white/20 rounded" />
                </div>
                <div className="h-8 w-full bg-white/10 rounded flex items-center px-3 gap-2">
                  <div className="w-4 h-4 rounded-full bg-white/20" />
                  <div className="h-2 w-1/2 bg-white/20 rounded" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Decorative Elements */}
        <div className="absolute -top-20 -right-20 w-60 h-60 bg-blue-600/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-20 -left-20 w-60 h-60 bg-purple-600/20 rounded-full blur-3xl pointer-events-none" />
      </div>
    </div>
  );
}
