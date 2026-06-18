import React, { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Zap, UserPlus, ClipboardCheck, Stethoscope, FlaskConical, Pill, BedDouble, Receipt, Siren } from "lucide-react";

// Common task shortcuts, gated by role.
const ACTIONS = [
  { label: "Register Patient", path: "/reception", icon: UserPlus, roles: ["admin", "user", "receptionist", "nurse"] },
  { label: "Triage", path: "/triage", icon: ClipboardCheck, roles: ["admin", "user", "receptionist", "nurse"] },
  { label: "New Consultation", path: "/clinical", icon: Stethoscope, roles: ["admin", "user", "doctor", "clinician"] },
  { label: "Lab Orders", path: "/lab", icon: FlaskConical, roles: ["admin", "user", "doctor", "clinician", "lab_technician"] },
  { label: "Pharmacy", path: "/pharmacy", icon: Pill, roles: ["admin", "user", "doctor", "clinician", "pharmacist"] },
  { label: "Admit Patient", path: "/inpatient", icon: BedDouble, roles: ["admin", "user", "nurse", "midwife", "doctor", "clinician"] },
  { label: "Create Invoice", path: "/billing", icon: Receipt, roles: ["admin", "user", "cashier", "receptionist"] },
  { label: "Surge Monitor", path: "/surge", icon: Siren, roles: ["admin", "user", "doctor", "nurse", "receptionist"] },
];

export default function QuickActionMenu({ userRole = "user" }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const ref = useRef(null);

  useEffect(() => {
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const visible = ACTIONS.filter(a => a.roles.includes(userRole));
  if (visible.length === 0) return null;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1.5 px-2.5 lg:px-3 py-2 rounded-lg bg-primary/10 text-primary text-xs font-semibold hover:bg-primary/20 transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary"
        aria-label="Quick actions"
      >
        <Zap className="w-4 h-4" />
        <span className="hidden sm:inline">Quick Actions</span>
      </button>
      {open && (
        <div className="absolute right-0 top-12 w-56 bg-card border border-border rounded-xl shadow-lg z-50 p-1.5 animate-in fade-in slide-in-from-top-1 duration-150">
          <p className="px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Quick Actions</p>
          {visible.map(({ label, path, icon: Icon }) => (
            <button
              key={path}
              onClick={() => { navigate(path); setOpen(false); }}
              className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm text-foreground hover:bg-primary/5 transition-colors text-left"
            >
              <span className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Icon className="w-3.5 h-3.5 text-primary" />
              </span>
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}