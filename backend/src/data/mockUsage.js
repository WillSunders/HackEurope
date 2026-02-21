const mockUsage = [
  {
    id: "run_001",
    timestamp: "2026-02-01T08:00:00Z",
    team: "ml-research",
    service: "training",
    user: "alex",
    device: "A100",
    region: "EU-DE",
    energyKwh: 420,
    carbonKg: 128,
    cost: 84.0
  },
  {
    id: "run_002",
    timestamp: "2026-02-03T12:00:00Z",
    team: "platform",
    service: "inference",
    user: "mira",
    device: "L40S",
    region: "EU-FR",
    energyKwh: 180,
    carbonKg: 52,
    cost: 39.6
  },
  {
    id: "run_003",
    timestamp: "2026-02-05T16:00:00Z",
    team: "ml-research",
    service: "training",
    user: "sam",
    device: "H100",
    region: "EU-NL",
    energyKwh: 510,
    carbonKg: 142,
    cost: 101.5
  },
  {
    id: "run_004",
    timestamp: "2026-02-07T21:00:00Z",
    team: "app",
    service: "batch",
    user: "lina",
    device: "A10G",
    region: "EU-DE",
    energyKwh: 95,
    carbonKg: 31,
    cost: 18.4
  },
  {
    id: "run_005",
    timestamp: "2026-02-10T10:00:00Z",
    team: "platform",
    service: "inference",
    user: "ravi",
    device: "L40S",
    region: "EU-ES",
    energyKwh: 210,
    carbonKg: 63,
    cost: 45.0
  },
  {
    id: "run_006",
    timestamp: "2026-02-13T06:00:00Z",
    team: "ml-research",
    service: "training",
    user: "alex",
    device: "H100",
    region: "EU-DE",
    energyKwh: 580,
    carbonKg: 171,
    cost: 116.0
  },
  {
    id: "run_007",
    timestamp: "2026-02-16T04:00:00Z",
    team: "app",
    service: "batch",
    user: "lina",
    device: "A10G",
    region: "EU-FI",
    energyKwh: 120,
    carbonKg: 18,
    cost: 22.1
  },
  {
    id: "run_008",
    timestamp: "2026-02-19T18:00:00Z",
    team: "platform",
    service: "inference",
    user: "mira",
    device: "L40S",
    region: "EU-DE",
    energyKwh: 190,
    carbonKg: 55,
    cost: 41.2
  }
];

const mockTimeSeries = [
  { date: "2026-02-01", energyKwh: 420, carbonKg: 128, cost: 84.0 },
  { date: "2026-02-03", energyKwh: 180, carbonKg: 52, cost: 39.6 },
  { date: "2026-02-05", energyKwh: 510, carbonKg: 142, cost: 101.5 },
  { date: "2026-02-07", energyKwh: 95, carbonKg: 31, cost: 18.4 },
  { date: "2026-02-10", energyKwh: 210, carbonKg: 63, cost: 45.0 },
  { date: "2026-02-13", energyKwh: 580, carbonKg: 171, cost: 116.0 },
  { date: "2026-02-16", energyKwh: 120, carbonKg: 18, cost: 22.1 },
  { date: "2026-02-19", energyKwh: 190, carbonKg: 55, cost: 41.2 }
];

module.exports = { mockUsage, mockTimeSeries };
