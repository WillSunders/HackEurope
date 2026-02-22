const { useEffect, useMemo, useState } = React;

const currencyFormatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "EUR",
});

const EQUIVALENCY_FACTORS = {
    carKgPerMile: 0.393,
    flightKgPerPassengerKm: 0.10794,
    flightKmPerTrip: 1000,
    showerMinutes: 7.8,
    showerGpm: 2.5,
    kwhPerGallonHeated: 0.16452,
};

function toFixed(value, digits = 1) {
    return Number(value || 0).toFixed(digits);
}

function buildQuery(params) {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
        if (value) query.set(key, value);
    });
    const qs = query.toString();
    return qs ? `?${qs}` : "";
}

// ─── Data hook ────────────────────────────────────────────────────────────────

function useDashboardData() {
    const [summary, setSummary] = useState(null);
    const [breakdown, setBreakdown] = useState([]);
    const [groupBy, setGroupBy] = useState("team");
    const [breakdownSource, setBreakdownSource] = useState("compute");
    const [loading, setLoading] = useState(true);
    const [teamBreakdown, setTeamBreakdown] = useState([]);
    const [llmTeamBreakdown, setLlmTeamBreakdown] = useState([]);

    async function load(group) {
        const [summaryRes, breakdownRes, teamRes, llmTeamRes] = await Promise.all([
            fetch("/api/dashboard/summary"),
            fetch(
                `/api/dashboard/breakdown${buildQuery({ groupBy: group, source: breakdownSource })}`,
            ),
            fetch("/api/dashboard/breakdown?groupBy=team&source=compute"),
            fetch("/api/dashboard/breakdown?groupBy=team&source=llm"),
        ]);

        if (!summaryRes.ok || !breakdownRes.ok || !teamRes.ok) {
            throw new Error("Unable to load dashboard data.");
        }

        return {
            summaryData: await summaryRes.json(),
            breakdownData: await breakdownRes.json(),
            teamData: await teamRes.json(),
            llmTeamData: llmTeamRes.ok ? await llmTeamRes.json() : { data: [] },
        };
    }

    useEffect(() => {
        let alive = true;
        async function run() {
            setLoading(true);
            try {
                const { summaryData, breakdownData, teamData, llmTeamData } =
                    await load(groupBy);
                if (alive) {
                    setSummary(summaryData);
                    setBreakdown(breakdownData.data || []);
                    setTeamBreakdown(teamData.data || []);
                    setLlmTeamBreakdown(llmTeamData.data || []);
                }
            } catch (err) {
                console.error(err);
            } finally {
                if (alive) setLoading(false);
            }
        }
        run();
        return () => {
            alive = false;
        };
    }, [groupBy, breakdownSource]);

    async function refresh() {
        setLoading(true);
        try {
            const { summaryData, breakdownData, teamData, llmTeamData } =
                await load(groupBy);
            setSummary(summaryData);
            setBreakdown(breakdownData.data || []);
            setTeamBreakdown(teamData.data || []);
            setLlmTeamBreakdown(llmTeamData.data || []);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }

    return {
        summary,
        breakdown,
        teamBreakdown,
        llmTeamBreakdown,
        groupBy,
        setGroupBy,
        breakdownSource,
        setBreakdownSource,
        loading,
        refresh,
    };
}

// ─── Components ───────────────────────────────────────────────────────────────

function TopNav({ totalKg, totalTons }) {
    return (
        <nav className="topnav">
            <div className="topnav-logo">
                <span className="topnav-logo-dot" />
                CarbonOps Network
            </div>
            <div className="topnav-right">
                <span className="topnav-tag">EU Compute</span>
                {totalKg > 0 && (
                    <span className="topnav-pill">
                        {toFixed(totalKg, 0)} kgCO₂e tracked
                    </span>
                )}
            </div>
        </nav>
    );
}

function Card({ label, value, subtext, loading: isLoading }) {
    if (isLoading) {
        return (
            <div className="card skeleton-card">
                <span className="card-label">{label}</span>
                <h3>&nbsp;</h3>
            </div>
        );
    }
    return (
        <div className="card">
            <span className="card-label">{label}</span>
            <h3>{value}</h3>
            {subtext && <p className="card-sub">{subtext}</p>}
        </div>
    );
}

function Chart({ data, metric, color }) {
    const safeData = Array.isArray(data) ? data : [];
    if (!safeData.length) {
        return <p className="status">No timeline data.</p>;
    }
    const values = safeData.map((d) => Number(d[metric]) || 0);
    const maxValue = Math.max(...values, 1);
    const minValue = Math.min(...values, maxValue);
    const span = Math.max(maxValue - minValue, 1);
    const normalize = (value) => (value - minValue) / span;

    return (
        <div className="chart">
            <div className="chart-axis">
                <span>{maxValue.toFixed(1)}</span>
                <span>{minValue.toFixed(1)}</span>
            </div>
            <div className="chart-bars">
                {safeData.map((point) => {
                    const value = Number(point[metric]) || 0;
                    const heightPct = Math.max(0.04, normalize(value)) * 100;
                    return (
                        <div key={point.date} className="chart-bar">
                            <div
                                className={`chart-fill${color === "carbon" ? " carbon" : ""}`}
                                style={{ height: `${heightPct}%` }}
                            />
                            <span className="chart-label">{String(point.date).slice(5)}</span>
                            <span className="chart-value">{value.toFixed(1)}</span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function BreakdownTable({ data, groupBy }) {
    if (!data.length) {
        return <p className="status">No breakdown data for this selection.</p>;
    }
    const groupLabel =
        {
            team: "Team",
            service: "Service",
            device: "Device",
            user: "User",
            region: "Region",
        }[groupBy] || "Group";

    return (
        <div className="table">
            <div className="table-header">
                <span>{groupLabel}</span>
                <span>kWh</span>
                <span>kgCO₂e</span>
                <span>Cost</span>
            </div>
            {data.map((row) => (
                <div key={row.key} className="table-row">
                    <span>{row.key}</span>
                    <span>{toFixed(row.energyKwh, 0)}</span>
                    <span>{toFixed(row.carbonKg, 0)}</span>
                    <span>{currencyFormatter.format(row.cost)}</span>
                </div>
            ))}
        </div>
    );
}

function ExportPanel() {
    const [filters, setFilters] = useState({
        from: "",
        to: "",
        device: "",
        user: "",
        format: "csv",
    });
    const [status, setStatus] = useState("");

    const update = (field) => (event) => {
        setFilters((prev) => ({ ...prev, [field]: event.target.value }));
    };

    async function handleExport() {
        setStatus("Preparing export...");
        const query = buildQuery(filters);
        const response = await fetch(`/api/export${query}`);
        if (!response.ok) {
            setStatus("Export failed.");
            return;
        }

        if (filters.format === "json") {
            const data = await response.json();
            const blob = new Blob([JSON.stringify(data, null, 2)], {
                type: "application/json",
            });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = "carbonops-export.json";
            link.click();
            URL.revokeObjectURL(url);
            setStatus("JSON export downloaded.");
            return;
        }

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "carbonops-export.csv";
        link.click();
        URL.revokeObjectURL(url);
        setStatus("CSV export downloaded.");
    }

    return (
        <div className="panel">
            <div>
                <h2>Export Data</h2>
                <p className="muted">
                    Filter by date range, device, and user. Export CSV or JSON.
                </p>
            </div>
            <div className="filters">
                <label>
                    From
                    <input type="date" value={filters.from} onChange={update("from")} />
                </label>
                <label>
                    To
                    <input type="date" value={filters.to} onChange={update("to")} />
                </label>
                <label>
                    Device
                    <input
                        type="text"
                        value={filters.device}
                        onChange={update("device")}
                        placeholder="A100"
                    />
                </label>
                <label>
                    User
                    <input
                        type="text"
                        value={filters.user}
                        onChange={update("user")}
                        placeholder="alex"
                    />
                </label>
                <label>
                    Format
                    <select value={filters.format} onChange={update("format")}>
                        <option value="csv">CSV</option>
                        <option value="json">JSON</option>
                    </select>
                </label>
                <button onClick={handleExport}>Download</button>
            </div>
            {status && <p className="status">{status}</p>}
        </div>
    );
}

function ReceiptPanel() {
    const [period, setPeriod] = useState("2026-02");
    const [receipt, setReceipt] = useState(null);
    const [status, setStatus] = useState("");

    async function loadReceipt() {
        setStatus("Generating receipt...");
        const response = await fetch(`/api/receipts${buildQuery({ period })}`);
        if (!response.ok) {
            setStatus("Unable to load receipt.");
            return;
        }
        const data = await response.json();
        setReceipt(data);
        setStatus("");
    }

    async function downloadReceipt() {
        if (!receipt) return;
        const blob = new Blob([JSON.stringify(receipt, null, 2)], {
            type: "application/json",
        });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `carbonops-receipt-${period}.json`;
        link.click();
        URL.revokeObjectURL(url);
    }

    return (
        <div className="panel">
            <div>
                <h2>Removal Receipt</h2>
                <p className="muted">
                    Pull a Stripe Climate order receipt for the selected billing period.
                </p>
            </div>
            <div className="filters">
                <label>
                    Period (YYYY-MM)
                    <input
                        type="text"
                        value={period}
                        onChange={(e) => setPeriod(e.target.value)}
                        placeholder="2026-02"
                    />
                </label>
                <button onClick={loadReceipt}>Load Receipt</button>
                <button onClick={downloadReceipt} disabled={!receipt}>
                    Download
                </button>
            </div>
            {status && <p className="status">{status}</p>}
            {receipt && (
                <div className="receipt">
                    <p>
                        <strong>Status:</strong> {receipt.status}
                    </p>
                    <p>
                        <strong>Stripe Climate Order:</strong>{" "}
                        {receipt.stripeClimateOrderId || "Pending"}
                    </p>
                    <p>
                        <strong>Offset kgCO₂e:</strong> {receipt.offsetKg}
                    </p>
                </div>
            )}
        </div>
    );
}

function PaymentPanel({ computeTeams, llmTeams, onPaid }) {
    const [source, setSource] = useState("compute");
    const [team, setTeam] = useState(computeTeams[0]?.key || "");
    const [percentage, setPercentage] = useState(50);
    const [status, setStatus] = useState("");

    useEffect(() => {
        const currentTeams = source === "llm" ? llmTeams : computeTeams;
        if (currentTeams.length && !team) {
            setTeam(currentTeams[0].key);
        }
    }, [computeTeams, llmTeams, team, source]);

    const teams = source === "llm" ? llmTeams : computeTeams;
    const selected = teams.find((entry) => entry.key === team);
    const selectedKg = selected ? (selected.carbonKg * percentage) / 100 : 0;
    const metricTons = selectedKg / 1000;

    async function startCheckout() {
        if (!metricTons || metricTons <= 0) {
            setStatus("Select a team with emissions to offset.");
            return;
        }
        setStatus("Redirecting to Stripe Checkout...");
        const response = await fetch("/api/checkout/session", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                metricTons,
                team,
                note: `Offset ${percentage}% of ${team} (${source})`,
            }),
        });
        const data = await response.json();
        if (!response.ok) {
            setStatus(data.error || "Unable to start checkout.");
            return;
        }
        window.location.href = data.url;
    }

    return (
        <div className="panel">
            <div>
                <h2>Offset a Team</h2>
                <p className="muted">
                    Pay to offset a portion of a team's emissions. Payments update removal
                    totals once Stripe confirms the checkout.
                </p>
            </div>
            <div className="filters">
                <label>
                    Source
                    <select value={source} onChange={(e) => setSource(e.target.value)}>
                        <option value="compute">Compute</option>
                        <option value="llm">LLM</option>
                    </select>
                </label>
                <label>
                    Team
                    <select value={team} onChange={(e) => setTeam(e.target.value)}>
                        {teams.map((entry) => (
                            <option key={entry.key} value={entry.key}>
                                {entry.key}
                            </option>
                        ))}
                    </select>
                </label>
                <label>
                    Portion (%)
                    <input
                        type="number"
                        min="1"
                        max="100"
                        value={percentage}
                        onChange={(e) => setPercentage(Number(e.target.value || 0))}
                    />
                </label>
                <label>
                    Offset Amount
                    <input
                        type="text"
                        readOnly
                        value={`${toFixed(selectedKg, 0)} kgCO₂e (${toFixed(metricTons, 2)} tons)`}
                    />
                </label>
                <button onClick={startCheckout}>Pay with Stripe</button>
            </div>
            {status && <p className="status">{status}</p>}
            <button className="ghost" onClick={onPaid}>
                Refresh status
            </button>
        </div>
    );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

function Dashboard() {
    const {
        summary,
        breakdown,
        teamBreakdown,
        llmTeamBreakdown,
        groupBy,
        setGroupBy,
        breakdownSource,
        setBreakdownSource,
        loading,
        refresh,
    } = useDashboardData();
    const [status, setStatus] = useState("");

    const totals = summary?.totals || { energyKwh: 0, carbonKg: 0, cost: 0 };
    const computeTotals = summary?.sources?.compute || {
        energyKwh: 0,
        carbonKg: 0,
        cost: 0,
    };
    const llmTotals = summary?.sources?.llm || {
        energyKwh: 0,
        carbonKg: 0,
        cost: 0,
    };
    const removal = summary?.removalStatus || {
        pendingTons: 0,
        totalTons: 0,
        climateOrders: [],
    };
    // ↑ Safe null guard — no more crash when summary is null on first render

    const removalStatus = useMemo(() => {
        const latest = removal.climateOrders[removal.climateOrders.length - 1];
        if (latest) return `Last order: ${latest.metricTons} tons`;
        return "No orders yet";
    }, [removal]);

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        if (params.has("success")) {
            setStatus(
                "Payment complete. Totals will update once webhook is received.",
            );
            refresh();
        }
        if (params.has("canceled")) {
            setStatus("Checkout canceled.");
        }
    }, []);

    const equivalents = useMemo(() => {
        const kg = totals.carbonKg || 0;
        const miles = kg / EQUIVALENCY_FACTORS.carKgPerMile;
        const flightKg =
            EQUIVALENCY_FACTORS.flightKgPerPassengerKm *
            EQUIVALENCY_FACTORS.flightKmPerTrip;
        const flights = flightKg > 0 ? kg / flightKg : 0;
        const gallonsPerShower =
            EQUIVALENCY_FACTORS.showerGpm * EQUIVALENCY_FACTORS.showerMinutes;
        const kwhPerShower =
            gallonsPerShower * EQUIVALENCY_FACTORS.kwhPerGallonHeated;
        const showers =
            kwhPerShower > 0 ? (totals.energyKwh || 0) / kwhPerShower : 0;
        return { miles, flights, showers, kwhPerShower };
    }, [totals]);

    const timeSeries = summary?.timeSeries || [];

    return (
        <>
            <TopNav totalKg={totals.carbonKg} totalTons={removal.totalTons} />

            <div className="page">
                {/* Hero */}
                <header className="hero">
                    <div>
                        <p className="eyebrow">CarbonOps Network</p>
                        <h1>Carbon Intelligence Dashboard</h1>
                        <p className="subhead">
                            Track compute energy, emissions, and automated removal with Stripe
                            Climate orders.
                        </p>
                    </div>
                    <div className="hero-callout">
                        <div className="hero-callout-stat">
                            <span className="hero-callout-num">
                                {toFixed(totals.carbonKg, 0)}
                            </span>
                            <span className="hero-callout-label">kgCO₂e tracked</span>
                        </div>
                        <div className="hero-callout-divider" />
                        <div className="hero-callout-stat">
                            <span className="hero-callout-num">
                                {toFixed(removal.totalTons, 1)}
                            </span>
                            <span className="hero-callout-label">tons removed</span>
                        </div>
                        <div className="hero-callout-divider" />
                        <span style={{ fontSize: "0.85rem", color: "#94a3b8" }}>
                            Forecast-aware optimisation ready
                        </span>
                    </div>
                </header>

                {/* Top-level metric cards */}
                <section className="cards">
                    <Card
                        label="Total Energy"
                        value={`${toFixed(totals.energyKwh, 0)} kWh`}
                        subtext="Aggregate workload energy"
                        loading={loading}
                    />
                    <Card
                        label="Total Emissions"
                        value={`${toFixed(totals.carbonKg, 0)} kgCO₂e`}
                        subtext="Scope 2 estimate"
                        loading={loading}
                    />
                    <Card
                        label="Compute Cost"
                        value={currencyFormatter.format(totals.cost)}
                        subtext="Power and infra cost"
                        loading={loading}
                    />
                    <Card
                        label="Removal Status"
                        value={`${toFixed(removal.totalTons, 1)} tons`}
                        subtext={removalStatus}
                        loading={loading}
                    />
                </section>

                {/* Source split cards */}
                <section className="cards">
                    <Card
                        label="Compute Energy"
                        value={`${toFixed(computeTotals.energyKwh, 0)} kWh`}
                        subtext="Compute workloads"
                        loading={loading}
                    />
                    <Card
                        label="LLM Energy"
                        value={`${toFixed(llmTotals.energyKwh, 0)} kWh`}
                        subtext="Browser LLM usage"
                        loading={loading}
                    />
                    <Card
                        label="Compute Emissions"
                        value={`${toFixed(computeTotals.carbonKg, 0)} kgCO₂e`}
                        subtext="Compute workloads"
                        loading={loading}
                    />
                    <Card
                        label="LLM Emissions"
                        value={`${toFixed(llmTotals.carbonKg, 0)} kgCO₂e`}
                        subtext="Browser LLM usage"
                        loading={loading}
                    />
                </section>

                {/* Equivalents */}
                <section className="panel">
                    <div className="panel-head">
                        <div>
                            <h2>Equivalents</h2>
                            <p className="muted">
                                Interpreting emissions as everyday activities.
                            </p>
                        </div>
                    </div>
                    <div className="table">
                        <div className="table-header">
                            <span>Equivalent</span>
                            <span>Estimate</span>
                            <span>Assumption</span>
                            <span>Basis</span>
                        </div>
                        <div className="table-row">
                            <span>Car miles driven</span>
                            <span>{toFixed(equivalents.miles, 0)} miles</span>
                            <span>Avg gasoline passenger vehicle</span>
                            <span>CO₂e</span>
                        </div>
                        <div className="table-row">
                            <span>Short‑haul flights</span>
                            <span>{toFixed(equivalents.flights, 1)} flights</span>
                            <span>~1,000 km economy</span>
                            <span>CO₂e</span>
                        </div>
                        <div className="table-row">
                            <span>Showers</span>
                            <span>{toFixed(equivalents.showers, 0)} showers</span>
                            <span>{toFixed(equivalents.kwhPerShower, 2)} kWh per shower</span>
                            <span>Energy</span>
                        </div>
                    </div>
                </section>

                {status && <p className="status">{status}</p>}

                {/* Timeline — now with BOTH kWh and kgCO₂e charts, and null-safe */}
                <section className="panel">
                    <div className="panel-head">
                        <div>
                            <h2>Energy + Emissions Timeline</h2>
                        </div>
                        <div className="pill">Last 30 days</div>
                    </div>
                    {loading ? (
                        <p className="status">Loading timeline...</p>
                    ) : (
                        <div className="charts">
                            <div>
                                <span className="chart-title">Energy (kWh)</span>
                                <Chart data={timeSeries} metric="energyKwh" />
                            </div>
                            <div>
                                <span className="chart-title">Emissions (kgCO₂e)</span>
                                <Chart data={timeSeries} metric="carbonKg" color="carbon" />
                            </div>
                        </div>
                    )}
                </section>

                {/* Breakdown */}
                <section className="panel">
                    <div className="panel-head">
                        <div>
                            <h2>Breakdown</h2>
                            <p className="muted">
                                Slice by team, service, device, user, or region.
                            </p>
                        </div>
                        <div className="filters">
                            <label>
                                Source
                                <select
                                    value={breakdownSource}
                                    onChange={(e) => setBreakdownSource(e.target.value)}
                                >
                                    <option value="compute">Compute</option>
                                    <option value="llm">LLM</option>
                                    <option value="all">All</option>
                                </select>
                            </label>
                            <label>
                                Group by
                                <select
                                    value={groupBy}
                                    onChange={(e) => setGroupBy(e.target.value)}
                                >
                                    <option value="team">Team</option>
                                    <option value="service">Service</option>
                                    <option value="device">Device</option>
                                    <option value="user">User</option>
                                    <option value="region">Region</option>
                                </select>
                            </label>
                        </div>
                    </div>
                    {loading ? (
                        <p className="status">Loading breakdown...</p>
                    ) : (
                        <BreakdownTable data={breakdown} groupBy={groupBy} />
                    )}
                </section>

                <PaymentPanel
                    computeTeams={teamBreakdown}
                    llmTeams={llmTeamBreakdown}
                    onPaid={refresh}
                />
                <ExportPanel />
                <ReceiptPanel />

                <footer className="footer">
                    <p>
                        CarbonOps Network · EU compute telemetry · Stripe Climate integrated
                    </p>
                </footer>
            </div>
        </>
    );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<Dashboard />);
