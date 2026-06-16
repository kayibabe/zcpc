import { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Activity, Users, Clock, BedDouble } from "lucide-react";

export default function LivePulse({ compact = false }) {
  const [stats, setStats] = useState({ activeVisits: 0, waiting: 0, occupiedBeds: 0 });
  const [pulse, setPulse] = useState(false);
  const intervalRef = useRef(null);

  useEffect(() => {
    async function fetchLive() {
      try {
        const [visits, beds] = await Promise.all([
          base44.entities.Visit.filter(
            { queue_status: { $in: ["waiting", "triaged", "in_consultation", "in_lab", "in_pharmacy"] } },
            "",
            100
          ),
          base44.entities.Bed.filter({ status: "occupied" }, "", 100),
        ]);
        setStats({
          activeVisits: visits.length,
          waiting: visits.filter(v => v.queue_status === "waiting").length,
          occupiedBeds: beds.length,
        });
      } catch (_) {}
    }

    fetchLive();
    intervalRef.current = setInterval(fetchLive, 30000);

    // Pulse animation trigger
    const pulseInterval = setInterval(() => {
      setPulse(p => !p);
    }, 1200);

    return () => {
      clearInterval(intervalRef.current);
      clearInterval(pulseInterval);
    };
  }, []);

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        {/* ECG wave */}
        <svg width="32" height="16" viewBox="0 0 64 32" className="flex-shrink-0">
          <defs>
            <linearGradient id="ecgGradient" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="hsl(var(--chart-3))" />
              <stop offset="100%" stopColor="hsl(var(--primary))" />
            </linearGradient>
          </defs>
          <path
            d="M0 20 L12 20 L16 20 L20 4 L24 20 L28 20 L30 20 L34 28 L38 20 L42 20 L46 20 L50 12 L54 20 L58 20 L64 20"
            fill="none"
            stroke="url(#ecgGradient)"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="animate-pulse"
            style={{ animationDuration: "1.8s" }}
          />
        </svg>
        <div className="flex items-center gap-1.5">
          <span className={`w-1.5 h-1.5 rounded-full ${pulse ? "bg-chart-3 scale-125" : "bg-chart-3/60"} transition-all duration-300`} />
          <span className="text-[10px] font-semibold text-chart-3 tracking-wide uppercase">Live</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-xl border border-border/60 shadow-sm overflow-hidden">
      {/* Header with ECG */}
      <div className="bg-gradient-to-r from-chart-3/5 via-primary/5 to-transparent px-4 py-3 border-b border-border/40">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <svg width="48" height="24" viewBox="0 0 96 48" className="flex-shrink-0">
              <defs>
                <linearGradient id="ecgGradientFull" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="hsl(var(--chart-3))" />
                  <stop offset="100%" stopColor="hsl(var(--primary))" />
                </linearGradient>
                <filter id="glow">
                  <feGaussianBlur stdDeviation="1.2" result="blur" />
                  <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
              </defs>
              <path
                d="M0 30 L18 30 L24 30 L30 6 L36 30 L42 30 L45 30 L51 42 L57 30 L63 30 L69 30 L75 18 L81 30 L87 30 L96 30"
                fill="none"
                stroke="url(#ecgGradientFull)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                filter="url(#glow)"
                className="animate-pulse"
                style={{ animationDuration: "1.8s" }}
              />
            </svg>
            <div>
              <div className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${pulse ? "bg-chart-3 shadow-[0_0_6px_hsl(var(--chart-3))]" : "bg-chart-3/40"} transition-all duration-300`} />
                <span className="text-[11px] font-bold text-chart-3 tracking-widest uppercase">Live HIMS</span>
              </div>
              <p className="text-[10px] text-muted-foreground mt-0.5">Real-time clinic monitor</p>
            </div>
          </div>
          <Activity className={`w-5 h-5 text-chart-3 transition-all duration-300 ${pulse ? "scale-110" : "scale-100"}`} />
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-3 divide-x divide-border/40">
        <div className="p-3 text-center">
          <Users className="w-3.5 h-3.5 text-primary mx-auto mb-1" />
          <p className="text-lg font-bold text-foreground">{stats.activeVisits}</p>
          <p className="text-[10px] text-muted-foreground">Active</p>
        </div>
        <div className="p-3 text-center">
          <Clock className="w-3.5 h-3.5 text-chart-2 mx-auto mb-1" />
          <p className="text-lg font-bold text-chart-2">{stats.waiting}</p>
          <p className="text-[10px] text-muted-foreground">Waiting</p>
        </div>
        <div className="p-3 text-center">
          <BedDouble className="w-3.5 h-3.5 text-chart-4 mx-auto mb-1" />
          <p className="text-lg font-bold text-chart-4">{stats.occupiedBeds}</p>
          <p className="text-[10px] text-muted-foreground">Beds</p>
        </div>
      </div>
    </div>
  );
}