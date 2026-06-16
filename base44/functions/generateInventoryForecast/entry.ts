import { createClientFromRequest } from 'npm:@base44/sdk@0.8.32';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const now = new Date();
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();

    // Fetch all active drugs and recent dispensing records
    const [drugs, dispensingLogs] = await Promise.all([
      base44.asServiceRole.entities.Drug.filter({ status: 'active' }),
      base44.asServiceRole.entities.PharmacyDispensing.filter({}, '-created_date', 5000),
    ]);

    // Filter dispensing to last 90 days
    const recentDispensing = dispensingLogs.filter(l => 
      new Date(l.dispensing_date || l.created_date) >= new Date(ninetyDaysAgo)
    );

    // Determine if we're in Malawi rainy/malaria season (Dec-Apr)
    const currentMonth = now.getMonth() + 1; // 1-12
    const isPeakSeason = currentMonth >= 12 || currentMonth <= 4;

    const malariaArt = ['Artemether-Lumefantrine', 'AL', 'Coartem', 'Artesunate', 'Artemether', 'Lumefantrine', 'Quinine', 'SP', 'Sulfadoxine-Pyrimethamine'];

    const forecast = drugs.map(drug => {
      const drugDispensing = recentDispensing.filter(l => 
        l.drug_name?.toLowerCase() === drug.name?.toLowerCase() ||
        l.drug_name?.toLowerCase() === drug.generic_name?.toLowerCase()
      );

      const totalDispensed = drugDispensing.reduce((sum, l) => sum + (l.quantity_dispensed || 0), 0);
      const adc = totalDispensed / 90; // Average Daily Consumption

      const leadTime = drug.lead_time_days || 30;
      const safetyDays = drug.safety_stock_days || 7;
      const seasonMultiplier = isPeakSeason ? (drug.seasonality_multiplier || 1.0) : 1.0;

      const adjustedAdc = adc * seasonMultiplier;
      const reorderPoint = Math.ceil((adjustedAdc * leadTime) + (adjustedAdc * safetyDays));
      const currentStock = drug.quantity_in_stock || 0;
      const daysOfStockRemaining = adjustedAdc > 0 ? Math.floor(currentStock / adjustedAdc) : 999;

      const isMalariaDrug = malariaArt.some(m => 
        drug.name?.toLowerCase().includes(m.toLowerCase()) ||
        drug.generic_name?.toLowerCase().includes(m.toLowerCase())
      );

      return {
        drug_id: drug.id,
        drug_name: drug.name,
        generic_name: drug.generic_name,
        category: drug.category,
        current_stock: currentStock,
        average_daily_consumption: Math.round(adjustedAdc * 100) / 100,
        lead_time_days: leadTime,
        safety_stock_days: safetyDays,
        seasonality_active: isPeakSeason && seasonMultiplier > 1.0,
        seasonality_multiplier: seasonMultiplier,
        reorder_point: reorderPoint,
        days_of_stock_remaining: daysOfStockRemaining,
        needs_restock: currentStock < reorderPoint,
        is_critical: daysOfStockRemaining < safetyDays,
        is_malaria_drug: isMalariaDrug,
        status: daysOfStockRemaining < safetyDays ? 'critical' :
                currentStock < reorderPoint ? 'warning' : 'adequate',
      };
    });

    // Sort by most critical first
    forecast.sort((a, b) => a.days_of_stock_remaining - b.days_of_stock_remaining);

    const summary = {
      generated_at: now.toISOString(),
      total_drugs: forecast.length,
      critical_count: forecast.filter(f => f.status === 'critical').length,
      warning_count: forecast.filter(f => f.status === 'warning').length,
      adequate_count: forecast.filter(f => f.status === 'adequate').length,
      peak_season_active: isPeakSeason,
      analysis_period_days: 90,
      items: forecast,
    };

    return Response.json(summary);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});