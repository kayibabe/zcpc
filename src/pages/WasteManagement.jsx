import WasteManagement from "@/components/WasteManagement";

export default function WasteManagementPage() {
  return (
    <div className="page-container">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="section-title">Waste Management</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Hazardous & general clinical waste tracking with staff signature verification
          </p>
        </div>
      </div>
      <WasteManagement />
    </div>
  );
}