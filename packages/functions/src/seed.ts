import type { WorkspaceData } from '@rayfin-app/shared';

export function seedId(n: number): string {
  return `f17d0000-0000-4000-8000-${n.toString().padStart(12, '0')}`;
}

export function starterData(now = new Date()): WorkspaceData {
  const day = (offset: number) => {
    const date = new Date(now);
    date.setUTCDate(date.getUTCDate() + offset);
    return date.toISOString().slice(0, 10) + 'T12:00:00.000Z';
  };
  const locations = ['Astoria', "Hell's Kitchen", 'Lower Manhattan'];
  const names = ['Group head pressure drift', 'Quarterly espresso service', 'Grinder burr replacement',
    'Water filter change', 'Steam wand valve leak', 'Cold brew line inspection',
    'Refrigeration temperature check', 'Espresso machine descaling', 'Grinder calibration',
    'Pump vibration diagnosis', 'Preventive safety inspection', 'Boiler seal replacement'];
  return {
    customers: [{ id: seedId(1), name: 'Northline Coffee', contact: 'Store operations',
      email: 'operations@northline.example', serviceTier: 'Priority care' }],
    sites: locations.map((name, i) => ({ id: seedId(10 + i), customer_id: seedId(1), name,
      address: ['31st Street, Queens', '9th Avenue, Manhattan', 'Broadway, Manhattan'][i],
      modelLocation: name })),
    assets: Array.from({ length: 6 }, (_, i) => ({
      id: seedId(20 + i), site_id: seedId(10 + Math.floor(i / 2)),
      name: i % 2 ? 'Mazzer commercial grinder' : 'La Marzocco Linea PB',
      serialNumber: `NL-${2022 + i % 3}-${1001 + i}`,
      category: i % 2 ? 'Grinding' : 'Espresso', installedOn: day(-750 + i * 30),
    })),
    technicians: ['Alex Morgan', 'Sam Rivera', 'Jordan Lee', 'Casey Brooks'].map((name, i) => ({
      id: seedId(30 + i), name, specialty: ['Espresso systems', 'Water & filtration', 'Electrical', 'Preventive care'][i],
      hourlyRate: 85 + i * 5, active: true,
    })),
    parts: ['Group head gasket', 'Water filter cartridge', 'Grinder burr set', 'Steam valve kit', 'Pump assembly', 'Boiler seal'].map((name, i) => ({
      id: seedId(40 + i), name, sku: `NL-P${100 + i}`, unitCost: [18.5, 64, 145, 42, 225, 28][i],
      stock: [24, 3, 8, 2, 4, 18][i], reorderAt: [8, 5, 3, 4, 2, 6][i],
    })),
    workOrders: names.map((title, i) => ({
      id: seedId(100 + i), asset_id: seedId(20 + i % 6), title,
      description: [
        'Inspect pressure under load, check the pump and document the calibration.',
        'Complete the service checklist, inspect seals, and verify operating temperature.',
        'Replace worn components and run a full performance check before handover.',
      ][i % 3],
      status: (['in-progress', 'planned', 'dispatched', 'planned', 'in-progress', 'planned',
        'dispatched', 'completed', 'completed', 'planned', 'completed', 'planned'] as const)[i],
      priority: (['urgent', 'routine', 'high'] as const)[i % 3],
      dueOn: day(i - 3), estimatedHours: [2, 1.5, 3, 1][i % 4],
      createdAt: day(-7 - i), updatedAt: day(-i % 3),
    })),
    assignments: [0, 2, 4, 6, 7, 8, 10].map((n, i) => ({
      id: seedId(200 + i), workOrder_id: seedId(100 + n), technician_id: seedId(30 + i % 4), assignedAt: day(-2),
    })),
    usages: [0, 4, 7, 8, 10].map((n, i) => ({
      id: seedId(300 + i), workOrder_id: seedId(100 + n), part_id: seedId(40 + i),
      quantity: 1, unitCost: [18.5, 64, 145, 42, 225][i],
    })),
    logs: names.map((_, i) => ({
      id: seedId(400 + i), workOrder_id: seedId(100 + i),
      message: i === 0 ? 'Pressure test underway. Pump readings recorded.' : 'Service request recorded by operations.',
      createdAt: day(-i % 3),
    })),
  };
}
