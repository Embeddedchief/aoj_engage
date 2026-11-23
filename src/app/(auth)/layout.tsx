import { CheckCheck, Megaphone, Send } from "lucide-react";

export const dynamic = "force-dynamic";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-canvas p-0 lg:p-3">
      <div className="grid min-h-screen overflow-hidden bg-white lg:min-h-[calc(100vh-1.5rem)] lg:grid-cols-[1fr_1.05fr] lg:rounded-4xl lg:shadow-card">
        {/* Left: brand + form */}
        <div className="relative flex flex-col px-6 py-6 sm:px-10 lg:px-14 lg:py-10">
          <header className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/icon.png" alt="AOJ Global Concept Limited" width={56} height={56} className="h-14 w-14 object-contain" />
              <div className="leading-tight">
                <div className="text-[15px] font-extrabold tracking-tight text-navy">AOJ Engage</div>
                <div className="text-[11px] font-medium text-muted">Customer Communication Management</div>
              </div>
            </div>
            <nav className="hidden gap-6 text-xs font-medium text-muted sm:flex">
              <span>Broadcasts</span><span>Greetings</span><span>Adverts</span>
            </nav>
          </header>

          <div className="flex flex-1 flex-col justify-center py-10">
            <h1 className="animate-rise text-[40px] font-extrabold leading-[1.02] tracking-tight text-navy sm:text-[54px]">
              Every message,{" "}
              <span className="relative inline-block -rotate-2 rounded-2xl bg-brand px-3 pb-1 text-white shadow-glow">on time</span>
              <span className="inline-block animate-wiggle text-brand">!</span>
              <br />
              every audience.
            </h1>
            <p className="mt-4 max-w-md animate-rise text-sm leading-relaxed text-muted [animation-delay:80ms]">
              Customer communication management and the broadcast centre of AOJ Global. Staff greetings, customer adverts and company announcements, prepared once and delivered on schedule.
            </p>
            <div className="mt-8 w-full max-w-sm animate-rise [animation-delay:160ms]">{children}</div>
          </div>

          <footer className="flex items-center justify-between text-[11px] text-muted">
            <span>© {new Date().getFullYear()} AOJ Global Concept Limited</span>
            <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-ok" /> Private system · activity is logged</span>
          </footer>
        </div>

        {/* Right: animated broadcast illustration */}
        <div className="dots relative hidden overflow-hidden bg-[#F6F1EE] lg:block" aria-hidden>
          <div className="absolute -right-20 -top-20 h-80 w-80 animate-drift rounded-full bg-brand/15 blur-3xl" />
          <div className="absolute -bottom-24 left-10 h-72 w-72 animate-drift rounded-full bg-navy/10 blur-3xl [animation-delay:-6s]" />

          {/* confetti dots */}
          <span className="absolute left-[18%] top-[14%] h-3 w-3 animate-float rounded-full bg-brand" />
          <span className="absolute left-[62%] top-[9%] h-2.5 w-2.5 animate-float rounded-full bg-navy [animation-delay:-2s]" />
          <span className="absolute right-[12%] top-[38%] h-2 w-2 animate-float rounded-full bg-brand-300 [animation-delay:-4s]" />
          <span className="absolute bottom-[22%] left-[12%] h-2.5 w-2.5 animate-float rounded-full bg-navy-300 [animation-delay:-1s]" />

          {/* zig-zag + spiral strokes */}
          <svg className="absolute bottom-[14%] left-[8%] w-40 text-brand" viewBox="0 0 160 40" fill="none"><path d="M2 30 L22 8 L42 30 L62 8 L82 30 L102 8 L122 30 L142 8 L158 26" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray="1" className="animate-draw" /></svg>
          <svg className="absolute right-[8%] top-[60%] w-28 animate-float text-navy [--r:8deg]" viewBox="0 0 100 100" fill="none">
            {[0, 1, 2, 3, 4].map((i) => <ellipse key={i} cx="50" cy={22 + i * 14} rx="40" ry="10" stroke="currentColor" strokeOpacity={0.25 + i * 0.12} strokeWidth="3" />)}
          </svg>

          {/* Central email card */}
          <div className="absolute left-1/2 top-1/2 w-[340px] -translate-x-1/2 -translate-y-1/2">
            <div className="animate-float rounded-[28px] bg-navy p-3 shadow-lift [--r:-3deg]">
              <div className="overflow-hidden rounded-[20px] bg-white">
                <div className="flex items-center gap-2 bg-brand px-4 py-3 text-white">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/icon.png" alt="" className="h-7 w-7 rounded-lg bg-white object-contain p-0.5" />
                  <div className="text-xs font-bold">AOJ Global · Communications</div>
                </div>
                <div className="space-y-2 p-4">
                  <div className="text-[15px] font-extrabold text-navy">Happy New Week, Team! ✨</div>
                  <div className="h-2 w-full rounded-full bg-canvas" />
                  <div className="h-2 w-5/6 rounded-full bg-canvas" />
                  <div className="h-2 w-2/3 rounded-full bg-canvas" />
                  <div className="flex items-center justify-between pt-2">
                    <span className="rounded-full bg-brand px-3 py-1 text-[11px] font-bold text-white">Read message</span>
                    <span className="flex items-center gap-1 text-[11px] font-semibold text-ok"><CheckCheck className="h-3.5 w-3.5" /> Delivered</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Floating speech bubbles */}
          <Bubble className="left-[10%] top-[20%] [--r:-8deg]" delay="0s" tone="red">Happy Birthday, Augustine! 🎂</Bubble>
          <Bubble className="right-[9%] top-[17%] [--r:6deg]" delay="-1.5s" tone="dark">Approved ✓</Bubble>
          <Bubble className="bottom-[26%] right-[14%] [--r:-4deg]" delay="-3s" tone="white">Eid Mubarak 🌙</Bubble>
          <Bubble className="bottom-[30%] left-[9%] [--r:5deg]" delay="-4.5s" tone="white">New project update</Bubble>

          {/* Delivered counter chip */}
          <div className="absolute left-[54%] top-[24%] flex animate-pop items-center gap-2 rounded-full bg-white py-1.5 pl-1.5 pr-3 shadow-lift [animation-delay:.6s]">
            <span className="grid h-7 w-7 place-items-center rounded-full bg-ok text-white"><Send className="h-3.5 w-3.5" /></span>
            <span className="text-xs font-bold text-navy">More staff reached</span>
          </div>

          {/* Paper plane */}
          <div className="absolute bottom-[17%] left-[44%] animate-fly">
            <Send className="h-8 w-8 -rotate-12 text-brand drop-shadow" />
          </div>

          {/* Ticker */}
          <div className="absolute inset-x-0 bottom-0 overflow-hidden border-t border-navy/10 bg-white/60 py-3 backdrop-blur">
            <div className="flex w-max animate-marquee gap-8 whitespace-nowrap text-xs font-semibold text-navy/70">
              {[0, 1].map((k) => (
                <div key={k} className="flex gap-8">
                  {["Happy New Week", "Independence Day", "Customer appreciation", "Project milestones", "Work anniversaries", "Season's greetings", "Company announcements", "Safety notices"].map((t) => (
                    <span key={t} className="flex items-center gap-2"><Megaphone className="h-3.5 w-3.5 text-brand" />{t}</span>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Bubble({ children, className, delay, tone }: { children: React.ReactNode; className: string; delay: string; tone: "red" | "dark" | "white" }) {
  const t = { red: "bg-brand text-white", dark: "bg-navy text-white", white: "bg-white text-navy" }[tone];
  const tail = { red: "border-t-brand", dark: "border-t-navy", white: "border-t-white" }[tone];
  return (
    <div className={`absolute animate-float ${className}`} style={{ animationDelay: delay }}>
      <div className={`relative rounded-2xl px-4 py-2.5 text-sm font-bold shadow-lift ${t}`}>
        {children}
        <span className={`absolute -bottom-2 left-5 h-0 w-0 border-x-8 border-t-8 border-x-transparent ${tail}`} />
      </div>
    </div>
  );
}
