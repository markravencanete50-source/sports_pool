"use client";

export function TrustedBySection() {
  return (
    <div className="bg-gradient-to-br from-blue-900/40 to-black border border-blue-500/20 p-8 rounded-2xl relative overflow-hidden group">
      <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl pointer-events-none group-hover:bg-blue-500/20 transition-colors" />
      <h3 className="text-2xl font-bold font-display uppercase italic mb-2 relative z-10">
        Trusted By Industry Leaders
      </h3>
      <p className="text-white relative z-10 mb-6">
        Join over 500+ companies using our infrastructure to engage their
        communities.
      </p>
      <div className="grid grid-cols-3 gap-4 opacity-70 grayscale hover:grayscale-0 transition-all duration-500">
        <div className="h-12 bg-white/10 rounded flex items-center justify-center font-bold text-white">
          LOGO
        </div>
        <div className="h-12 bg-white/10 rounded flex items-center justify-center font-bold text-white">
          LOGO
        </div>
        <div className="h-12 bg-white/10 rounded flex items-center justify-center font-bold text-white">
          LOGO
        </div>
      </div>
    </div>
  );
}
