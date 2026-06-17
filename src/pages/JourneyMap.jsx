import JourneyMap from "@/components/JourneyMap";

export default function JourneyMapPage() {
  return (
    <div className="page-container">
      <h2 className="section-title mb-6">Patient Journey Map</h2>
      <p className="text-sm text-muted-foreground mb-6">Kanban-style view of all active patient journeys across the hospital workflow.</p>
      <JourneyMap />
    </div>
  );
}