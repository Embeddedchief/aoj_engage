export const dynamic = "force-dynamic";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <div className="relative hidden overflow-hidden bg-navy lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-brand/25 blur-3xl" />
        <div className="absolute -bottom-32 left-10 h-80 w-80 rounded-full bg-brand/10 blur-3xl" />
        <div className="relative flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.png" alt="AOJ Global" className="h-14 w-14 rounded-xl bg-white object-contain p-1" />
          <div className="text-white">
            <div className="text-lg font-bold leading-none">AOJ Engage</div>
            <div className="mt-1 text-xs tracking-widest text-navy-300">AOJ GLOBAL CONCEPT LIMITED</div>
          </div>
        </div>
        <div className="relative max-w-md">
          <p className="text-3xl font-bold leading-tight text-white">Every relationship deserves consistent communication.</p>
          <p className="mt-4 text-sm leading-relaxed text-navy-100">Prepare once. Personalise automatically. Schedule intelligently. Deliver consistently.</p>
        </div>
        <div className="relative text-xs text-navy-300">Private system · Authorised personnel only · Activity is logged</div>
      </div>
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">{children}</div>
      </div>
    </div>
  );
}
