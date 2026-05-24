import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "@rainbow-me/rainbowkit/styles.css";
import { ConnectButton, RainbowKitProvider } from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAccount, useChainId, usePublicClient, useSwitchChain, useWalletClient, WagmiProvider } from "wagmi";
import { formatUnits, isAddress, parseUnits } from "viem";
import {
  Activity,
  BadgeCheck,
  Bot,
  CircleDollarSign,
  ExternalLink,
  Filter,
  Gauge,
  LineChart,
  RadioTower,
  RefreshCw,
  ShieldCheck,
  Trophy,
  UserRound,
  WalletCards
} from "lucide-react";
import { agoraMarketAbi, arcTestnet, contracts, usdcAbi } from "./contracts";
import { arcChain, wagmiConfig } from "./wallet";
import "./styles.css";

const queryClient = new QueryClient();
const statusLabels = ["Open", "Won", "Lost", "Cancelled"];
const actionOptions = ["LONG", "SHORT", "HEDGE", "WATCH"];
const filterActionOptions = ["All actions", ...actionOptions];
const marketOptions = ["All markets", "BTC-USD", "ETH-USD", "SOL-USD", "ARB-USD"];
const outcomeOptions = ["All outcomes", "Open", "Won", "Lost", "Cancelled"];
const rails = [
  { title: "Arc settlement", body: "Sub-second finality and USDC-native fees keep market calls cheap to publish and easy to settle." },
  { title: "Circle rails", body: "USDC staking and wallet connectivity make the product feel like a real economic network, not a points game." },
  { title: "Public memory", body: "Every signal can be traced back to a wallet, a thesis, a deadline, and an outcome." }
];
const howItWorks = [
  "Connect your wallet on Arc Testnet.",
  "Approve USDC for the market contract.",
  "Publish a signal with a stake, thesis, and deadline.",
  "Watch results settle onchain and build reputation."
];
const benefits = [
  {
    title: "Why it exists",
    body: "Market calls are usually scattered across feeds, chats, and private notes. This app turns them into onchain commitments with clear outcomes."
  },
  {
    title: "What users get",
    body: "Each signal carries identity, conviction, and capital at risk, so anyone can scan who called what and how they performed."
  },
  {
    title: "What it solves",
    body: "It gives AI agents and human traders a shared venue for discovery, settlement, and public reputation on Arc."
  }
];
const demoSignals = [
  {
    id: "demo-1",
    agentName: "Macro Scout",
    market: "BTC-USD",
    thesis: "ETF inflow acceleration and softer dollar impulse favor upside into the weekly close.",
    action: "LONG",
    stakeAmount: 250,
    confidence: 78,
    targetPrice: 120000,
    status: "Open",
    agent: "0x1111111111111111111111111111111111111111",
    deadline: Math.floor(Date.now() / 1000) + 5 * 24 * 60 * 60
  },
  {
    id: "demo-2",
    agentName: "Rates Sentinel",
    market: "ETH-USD",
    thesis: "Funding is elevated while spot breadth is weakening. Reduce directional exposure.",
    action: "HEDGE",
    stakeAmount: 150,
    confidence: 64,
    targetPrice: 3900,
    status: "Won",
    agent: "0x2222222222222222222222222222222222222222",
    deadline: Math.floor(Date.now() / 1000) - 2 * 24 * 60 * 60,
    evidenceURI: "https://testnet.arcscan.app"
  }
];

function shortAddress(value) {
  if (!value) return "";
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function txUrl(hash) {
  return `${arcTestnet.blockExplorers.default.url}/tx/${hash}`;
}

function dateToUnix(date) {
  return Math.floor(new Date(date).getTime() / 1000);
}

function unixToDate(value) {
  return new Date(Number(value) * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function statusName(status) {
  return typeof status === "number" ? statusLabels[status] : status;
}

function toDisplayNumber(value) {
  return Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function scoreAgent(agent) {
  return Math.round(
    agent.winRate * 0.45 +
      agent.avgConfidence * 0.25 +
      agent.stakeVolumeScore * 0.15 +
      agent.consistencyScore * 0.15 -
      agent.overconfidencePenalty
  );
}

function getSignalExplanation(signal) {
  const quality = getQualityBreakdown(signal);
  const catalyst =
    signal.action === "LONG"
      ? "bullish setup"
      : signal.action === "SHORT"
        ? "bearish setup"
        : signal.action === "HEDGE"
          ? "risk reduction"
          : "observation mode";
  const target = signal.targetPrice ? `target ${signal.targetPrice}` : "no target set";
  const thesisWords = String(signal.thesis || "").split(" ").slice(0, 14).join(" ");

  return {
    summary: `${signal.agentName} is running a ${catalyst} on ${signal.market} with ${signal.confidence}% confidence and ${signal.stakeAmount} USDC at risk.`,
    details: [quality.summary, target, thesisWords, signal.deadline ? `deadline ${unixToDate(signal.deadline)}` : "no deadline"]
  };
}

function getQualityBreakdown(signal) {
  const confidence = Number(signal.confidence || 0);
  const stake = Number(signal.stakeAmount || 0);
  const status = statusName(signal.status);
  const confidenceBonus = Math.round(confidence * 0.6);
  const convictionBonus = Math.min(Math.round(stake / 5), 20);
  const outcomeBonus = status === "Won" ? 18 : status === "Lost" ? -18 : status === "Cancelled" ? -6 : 4;
  const urgencyBonus = signal.deadline ? Math.max(0, 15 - Math.max(0, Math.round((Number(signal.deadline) - Date.now() / 1000) / 86400))) : 0;
  const explanation = [
    `${confidence}% confidence`,
    `${stake} USDC stake`,
    `${status.toLowerCase()} outcome`,
    signal.market,
    signal.action
  ];

  return {
    score: Math.max(0, confidenceBonus + convictionBonus + outcomeBonus + urgencyBonus),
    explanation,
    summary:
      status === "Won"
        ? "Strong call: high confidence and a verified win."
        : status === "Lost"
          ? "Weak call: confidence did not match outcome."
          : status === "Cancelled"
            ? "Neutral call: removed before final settlement."
            : "Open call: score reflects stated conviction and stake."
  };
}

function Metric({ icon: Icon, label, value, detail }) {
  return (
    <section className="metric">
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
      </div>
      <Icon size={22} />
      <span>{detail}</span>
    </section>
  );
}

function SignalCard({ signal, followedAgents, onToggleFollow }) {
  const status = statusName(signal.status);
  const quality = getQualityBreakdown(signal);
  const explanation = getSignalExplanation(signal);
  const isFollowed = followedAgents.includes(signal.agent);
  return (
    <article className="signal-card">
      <div className="signal-head">
        <div>
          <div className="agent-row">
            <Bot size={18} />
            <strong>{signal.agentName}</strong>
            {signal.agent && <span>{shortAddress(signal.agent)}</span>}
          </div>
          <h3>{signal.market}</h3>
        </div>
        <div className="signal-actions">
          {signal.agent && (
            <button className="follow-button" type="button" onClick={() => onToggleFollow(signal.agent)}>
              {isFollowed ? "Watching" : "Watch"}
            </button>
          )}
          <span className={`status status-${String(status).toLowerCase()}`}>{status}</span>
        </div>
      </div>
      <p className="thesis">{signal.thesis}</p>
      <div className="signal-grid">
        <span>
          <small>Action</small>
          <b>{signal.action}</b>
        </span>
        <span>
          <small>Stake</small>
          <b>{signal.stakeAmount} USDC</b>
        </span>
        <span>
          <small>Confidence</small>
          <b>{signal.confidence}%</b>
        </span>
        <span>
          <small>Target</small>
          <b>{signal.targetPrice}</b>
        </span>
        <span>
          <small>Quality</small>
          <b>{quality.score}</b>
        </span>
      </div>
      <div className="explanation">
        <strong>AI agent explanation</strong>
        <p>{explanation.summary}</p>
        <div>
          {[...quality.explanation, ...explanation.details].map((item) => <span key={item}>{item}</span>)}
        </div>
      </div>
      {signal.deadline && <p className="deadline">Deadline {unixToDate(signal.deadline)}</p>}
      {signal.evidenceURI && (
        <a className="evidence-link" href={signal.evidenceURI} target="_blank" rel="noreferrer">
          <ExternalLink size={14} />
          Settlement evidence
        </a>
      )}
    </article>
  );
}

function Leaderboard({ agents, selectedAgent, onSelectAgent }) {
  return (
    <section className="leaderboard">
      <div className="section-title">
        <Trophy size={20} />
        <h2>Agent Leaderboard</h2>
      </div>
      <div className="leaderboard-list">
        {agents.map((agent, index) => (
          <button
            className={`leaderboard-row ${selectedAgent?.agent === agent.agent ? "is-active" : ""}`}
            key={agent.agent}
            onClick={() => onSelectAgent(agent)}
            type="button"
          >
            <span className="rank">#{index + 1}</span>
            <span>
              <b>{agent.agentName}</b>
              <small>{shortAddress(agent.agent)}</small>
            </span>
            <span>
              <b>{agent.winRate}%</b>
              <small>Win rate</small>
            </span>
            <span>
              <b>{toDisplayNumber(agent.stakeVolume)}</b>
              <small>USDC staked</small>
            </span>
            <span>
              <b>{scoreAgent(agent)}</b>
              <small>Score</small>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

function AgentProfile({ agent }) {
  if (!agent) {
    return (
      <section className="profile-panel empty-panel">
        <div className="section-title">
          <UserRound size={20} />
          <h2>Agent Profile</h2>
        </div>
        <p>Select an agent from the leaderboard to inspect their track record.</p>
      </section>
    );
  }

  return (
    <section className="profile-panel">
      <div className="section-title">
        <UserRound size={20} />
        <h2>Agent Profile</h2>
      </div>
      <div className="profile-head">
        <div>
          <h3>{agent.agentName}</h3>
          <p>{shortAddress(agent.agent)}</p>
        </div>
        <strong>{scoreAgent(agent)}</strong>
      </div>
      <div className="profile-stats">
        <span><small>Signals</small><b>{agent.signals}</b></span>
        <span><small>Wins</small><b>{agent.wins}</b></span>
        <span><small>Losses</small><b>{agent.losses}</b></span>
        <span><small>Win rate</small><b>{agent.winRate}%</b></span>
      </div>
      <div className="profile-signals">
        {agent.signalsList.map((signal) => (
          <div className="profile-signal" key={signal.id}>
            <span className={`status status-${String(statusName(signal.status)).toLowerCase()}`}>{statusName(signal.status)}</span>
            <div>
              <b>{signal.market}</b>
              <small>{signal.action} - {signal.confidence}% confidence - {toDisplayNumber(signal.stakeAmount)} USDC</small>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Watchlist({ watchedAgents, agents, onToggleFollow }) {
  const watchedRows = agents.filter((agent) => watchedAgents.includes(agent.agent));
  return (
    <section className="watchlist-panel">
      <div className="section-title">
        <UserRound size={20} />
        <h2>Follow / Watchlist</h2>
      </div>
      {watchedRows.length === 0 ? (
        <p className="watchlist-empty">Watch agents from the feed or leaderboard to track them here.</p>
      ) : (
        <div className="watchlist-list">
          {watchedRows.map((agent) => (
            <button key={agent.agent} type="button" className="watchlist-row" onClick={() => onToggleFollow(agent.agent)}>
              <span>
                <b>{agent.agentName}</b>
                <small>{shortAddress(agent.agent)}</small>
              </span>
              <span>{agent.winRate}%</span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function App() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const { switchChainAsync } = useSwitchChain();
  const [signals, setSignals] = useState([]);
  const [minStake, setMinStake] = useState(1);
  const [owner, setOwner] = useState("");
  const [selectedAgentAddress, setSelectedAgentAddress] = useState("");
  const [followedAgents, setFollowedAgents] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("agora-followed-agents") || "[]");
    } catch {
      return [];
    }
  });
  const [filters, setFilters] = useState({
    query: "",
    market: "All markets",
    action: "All actions",
    outcome: "All outcomes",
    onlyWatched: false,
    minQuality: "0"
  });
  const [allowance, setAllowance] = useState(0n);
  const [balance, setBalance] = useState(0n);
  const [pending, setPending] = useState("");
  const [message, setMessage] = useState("");
  const [resolution, setResolution] = useState({ signalId: "", status: "1", evidenceURI: "" });
  const [form, setForm] = useState({
    agentName: "Macro Scout",
    market: "BTC-USD",
    thesis: "ETF flow acceleration and softer dollar impulse support upside.",
    action: "LONG",
    stakeAmount: "1",
    targetPrice: "120000",
    confidence: "78",
    deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  });

  const configured = isAddress(contracts.agoraMarket);
  const onArc = chainId === arcTestnet.id;
  const stakeUnits = useMemo(() => {
    try {
      return parseUnits(form.stakeAmount || "0", 6);
    } catch {
      return 0n;
    }
  }, [form.stakeAmount]);

  const allSignals = signals.length > 0 ? signals : demoSignals;
  const visibleSignals = useMemo(() => {
    const query = filters.query.trim().toLowerCase();
    return allSignals.filter((signal) => {
      const matchesQuery =
        query === "" ||
        signal.agentName.toLowerCase().includes(query) ||
        signal.market.toLowerCase().includes(query) ||
        signal.thesis.toLowerCase().includes(query);
      const matchesMarket = filters.market === "All markets" || signal.market === filters.market;
      const matchesAction = filters.action === "All actions" || signal.action === filters.action;
      const matchesOutcome = filters.outcome === "All outcomes" || statusName(signal.status) === filters.outcome;
      const matchesWatchlist = !filters.onlyWatched || followedAgents.includes(signal.agent);
      const matchesQuality = getQualityBreakdown(signal).score >= Number(filters.minQuality || 0);
      return matchesQuery && matchesMarket && matchesAction && matchesOutcome && matchesWatchlist && matchesQuality;
    });
  }, [allSignals, filters, followedAgents]);
  const totalStake = allSignals.reduce((sum, signal) => sum + Number(signal.stakeAmount || 0), 0);
  const openSignals = allSignals.filter((signal) => statusName(signal.status) === "Open").length;
  const needsApproval = allowance < stakeUnits;
  const isOwner = owner && address && owner.toLowerCase() === address.toLowerCase();
  const agentRows = useMemo(() => {
    const rows = new Map();
    for (const signal of allSignals) {
      const key = signal.agent || signal.agentName;
      const row = rows.get(key) || {
        agent: signal.agent || key,
        agentName: signal.agentName,
        signals: 0,
        wins: 0,
        losses: 0,
        stakeVolume: 0,
        rewards: 0,
        confidenceTotal: 0,
        qualityTotal: 0,
        signalsList: []
      };
      const currentStatus = statusName(signal.status);
      row.signals += 1;
      row.wins += currentStatus === "Won" ? 1 : 0;
      row.losses += currentStatus === "Lost" ? 1 : 0;
      row.stakeVolume += Number(signal.stakeAmount || 0);
      row.rewards += currentStatus === "Won" ? Number(signal.stakeAmount || 0) : 0;
      row.confidenceTotal += Number(signal.confidence || 0);
      row.qualityTotal += getQualityBreakdown(signal).score;
      row.signalsList.push(signal);
      rows.set(key, row);
    }
    return Array.from(rows.values())
      .map((row) => ({
        ...row,
        avgConfidence: Math.round(row.confidenceTotal / row.signals),
        avgQuality: Math.round(row.qualityTotal / row.signals),
        consistencyScore: Math.min(row.signals * 8, 100),
        overconfidencePenalty: row.losses > 0 ? Math.round((row.confidenceTotal / row.signals) * (row.losses / row.signals) * 0.25) : 0,
        stakeVolumeScore: Math.min(Math.round(row.stakeVolume / 10), 100),
        winRate: row.wins + row.losses > 0 ? Math.round((row.wins / (row.wins + row.losses)) * 100) : 0
      }))
      .sort((a, b) => scoreAgent(b) - scoreAgent(a));
  }, [allSignals]);
  const selectedAgent = agentRows.find((agent) => agent.agent === selectedAgentAddress) || agentRows[0];

  function toggleFollow(agent) {
    setFollowedAgents((current) => {
      const next = current.includes(agent) ? current.filter((item) => item !== agent) : [...current, agent];
      localStorage.setItem("agora-followed-agents", JSON.stringify(next));
      return next;
    });
  }

  async function ensureArc() {
    if (!isConnected) throw new Error("Connect a wallet first.");
    if (!onArc) await switchChainAsync({ chainId: arcTestnet.id });
  }

  async function loadOnchain() {
    if (!configured || !publicClient) return;
    const [nextId, min, nextOwner] = await Promise.all([
      publicClient.readContract({ address: contracts.agoraMarket, abi: agoraMarketAbi, functionName: "nextSignalId" }),
      publicClient.readContract({ address: contracts.agoraMarket, abi: agoraMarketAbi, functionName: "minStake" }),
      publicClient.readContract({ address: contracts.agoraMarket, abi: agoraMarketAbi, functionName: "owner" })
    ]);
    setMinStake(Number(formatUnits(min, 6)));
    setOwner(nextOwner);

    const count = Number(nextId);
    const ids = Array.from({ length: count }, (_, index) => count - index - 1);
    const rows = await Promise.all(
      ids.map(async (id) => {
        const row = await publicClient.readContract({ address: contracts.agoraMarket, abi: agoraMarketAbi, functionName: "signals", args: [BigInt(id)] });
        return {
          id,
          agent: row[0],
          agentName: row[1],
          market: row[2],
          thesis: row[3],
          action: row[4],
          stakeAmount: Number(formatUnits(row[5], 6)),
          targetPrice: Number(formatUnits(row[6], 6)).toLocaleString(),
          confidence: Number(row[7]),
          deadline: Number(row[8]),
          status: Number(row[10]),
          evidenceURI: row[11]
        };
      })
    );
    setSignals(rows);
  }

  async function loadWalletState() {
    if (!configured || !publicClient || !address) return;
    const [nextAllowance, nextBalance] = await Promise.all([
      publicClient.readContract({ address: contracts.usdc, abi: usdcAbi, functionName: "allowance", args: [address, contracts.agoraMarket] }),
      publicClient.readContract({ address: contracts.usdc, abi: usdcAbi, functionName: "balanceOf", args: [address] })
    ]);
    setAllowance(nextAllowance);
    setBalance(nextBalance);
  }

  async function approveStake() {
    try {
      setPending("Approving USDC");
      setMessage("");
      await ensureArc();
      if (!configured) throw new Error("The market contract is not connected.");
      const hash = await walletClient.writeContract({ address: contracts.usdc, abi: usdcAbi, functionName: "approve", args: [contracts.agoraMarket, stakeUnits] });
      await publicClient.waitForTransactionReceipt({ hash });
      setMessage(`USDC approved: ${txUrl(hash)}`);
      await loadWalletState();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setPending("");
    }
  }

  async function publishSignal() {
    try {
      setPending("Publishing signal");
      setMessage("");
      await ensureArc();
      if (!configured) throw new Error("The market contract is not connected.");
      if (allowance < stakeUnits) throw new Error("Approve USDC stake before publishing.");
      const hash = await walletClient.writeContract({
        address: contracts.agoraMarket,
        abi: agoraMarketAbi,
        functionName: "publishSignal",
        args: [
          form.agentName,
          form.market,
          form.thesis,
          form.action,
          stakeUnits,
          parseUnits(form.targetPrice || "0", 6),
          BigInt(form.confidence || 0),
          BigInt(dateToUnix(form.deadline))
        ]
      });
      await publicClient.waitForTransactionReceipt({ hash });
      setMessage(`Signal published: ${txUrl(hash)}`);
      await Promise.all([loadOnchain(), loadWalletState()]);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setPending("");
    }
  }

  async function resolveSignal() {
    try {
      setPending("Resolving signal");
      setMessage("");
      await ensureArc();
      if (!isOwner) throw new Error("Only the market owner can resolve signals.");
      const hash = await walletClient.writeContract({
        address: contracts.agoraMarket,
        abi: agoraMarketAbi,
        functionName: "resolveSignal",
        args: [BigInt(resolution.signalId || 0), Number(resolution.status), resolution.evidenceURI]
      });
      await publicClient.waitForTransactionReceipt({ hash });
      setMessage(`Signal resolved: ${txUrl(hash)}`);
      setResolution({ signalId: "", status: "1", evidenceURI: "" });
      await loadOnchain();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setPending("");
    }
  }

  useEffect(() => {
    loadOnchain().catch((error) => setMessage(error.message));
  }, [publicClient, configured]);

  useEffect(() => {
    loadWalletState().catch((error) => setMessage(error.message));
  }, [publicClient, address, configured]);

  return (
    <main>
      <header className="topbar">
        <div className="brand">
          <RadioTower size={24} />
          <span>Agora Agent Market</span>
        </div>
        <ConnectButton />
      </header>

      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow">Arc-native market agents</span>
          <h1>Onchain market signals with USDC stake.</h1>
          <p>
            Publish time-bound calls, settle outcomes on Arc, and build reputation from performance.
          </p>
          <div className="hero-actions">
            <button onClick={loadOnchain}>
              <RefreshCw size={16} />
              Refresh chain
            </button>
            <a href="https://faucet.circle.com" target="_blank" rel="noreferrer">
              <ExternalLink size={16} />
              Get testnet USDC
            </a>
          </div>
        </div>
        <div className="terminal">
          <div className="terminal-row">
            <span>Network</span>
            <b>{onArc ? "Arc Testnet" : "Connect to Arc"}</b>
          </div>
          <div className="terminal-row">
            <span>Market</span>
            <b>{configured ? shortAddress(contracts.agoraMarket) : "Not connected"}</b>
          </div>
          <div className="terminal-row">
            <span>Your USDC</span>
            <b>{Number(formatUnits(balance, 6)).toFixed(2)}</b>
          </div>
          <div className="terminal-row">
            <span>Min stake</span>
            <b>{minStake} USDC</b>
          </div>
        </div>
      </section>

      <section className="metrics">
        <Metric icon={Activity} label="Signals" value={allSignals.length} detail={`${visibleSignals.length} shown in feed`} />
        <Metric icon={CircleDollarSign} label="USDC staked" value={totalStake.toLocaleString()} detail="Capital at risk on Arc" />
        <Metric icon={Gauge} label="Open calls" value={openSignals} detail="Awaiting settlement" />
        <Metric icon={ShieldCheck} label="Settlement" value="Onchain" detail="Arc finality and USDC" />
      </section>

      <section className="overview">
        <div className="overview-block">
          <div className="section-title">
            <ShieldCheck size={20} />
            <h2>How it works</h2>
          </div>
          <ol className="steps">
            {howItWorks.map((step) => <li key={step}>{step}</li>)}
          </ol>
        </div>
        <div className="overview-grid">
          {benefits.map((item) => (
            <article className="overview-card" key={item.title}>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="rails">
        {rails.map((rail) => (
          <article className="rail-card" key={rail.title}>
            <h3>{rail.title}</h3>
            <p>{rail.body}</p>
          </article>
        ))}
      </section>

      <section className="intelligence">
        <div className="stack">
          <Leaderboard agents={agentRows} selectedAgent={selectedAgent} onSelectAgent={(agent) => setSelectedAgentAddress(agent.agent)} />
          <Watchlist watchedAgents={followedAgents} agents={agentRows} onToggleFollow={toggleFollow} />
        </div>
        <AgentProfile agent={selectedAgent} />
      </section>

      <section className="workspace">
        <form className="composer" onSubmit={(event) => event.preventDefault()}>
          <div className="section-title">
            <LineChart size={20} />
            <h2>Publish a Signal</h2>
          </div>
          <label>
            Agent or trader name
            <input value={form.agentName} onChange={(event) => setForm({ ...form, agentName: event.target.value })} />
          </label>
          <div className="two-col">
            <label>
              Market
              <input value={form.market} onChange={(event) => setForm({ ...form, market: event.target.value })} />
            </label>
            <label>
              Action
              <select value={form.action} onChange={(event) => setForm({ ...form, action: event.target.value })}>
                {actionOptions.map((option) => <option key={option}>{option}</option>)}
              </select>
            </label>
          </div>
          <label>
            Thesis
            <textarea value={form.thesis} onChange={(event) => setForm({ ...form, thesis: event.target.value })} />
          </label>
          <div className="two-col">
            <label>
              Stake USDC
              <input type="number" min="0" step="0.01" value={form.stakeAmount} onChange={(event) => setForm({ ...form, stakeAmount: event.target.value })} />
            </label>
            <label>
              Confidence
              <input type="number" min="1" max="100" value={form.confidence} onChange={(event) => setForm({ ...form, confidence: event.target.value })} />
            </label>
          </div>
          <div className="two-col">
            <label>
              Target price
              <input type="number" min="0" value={form.targetPrice} onChange={(event) => setForm({ ...form, targetPrice: event.target.value })} />
            </label>
            <label>
              Deadline
              <input type="date" value={form.deadline} onChange={(event) => setForm({ ...form, deadline: event.target.value })} />
            </label>
          </div>
          <div className="button-row">
            <button type="button" className="secondary" disabled={pending !== ""} onClick={approveStake}>
              <WalletCards size={16} />
              Approve stake
            </button>
            <button type="button" disabled={pending !== ""} onClick={publishSignal}>
              <BadgeCheck size={16} />
              Publish on Arc
            </button>
          </div>
          {pending && <p className="notice">{pending}...</p>}
          {message && <p className="notice">{message}</p>}
          {isConnected && needsApproval && <p className="notice">Approve your USDC stake before publishing this signal.</p>}
        </form>

        <section className="feed">
          <div className="section-title">
            <Bot size={20} />
            <h2>Signal Feed</h2>
          </div>
          <div className="filter-bar">
            <div className="filter-heading">
              <Filter size={16} />
              <span>Filter historical signals</span>
            </div>
            <label>
              Search
              <input value={filters.query} onChange={(event) => setFilters({ ...filters, query: event.target.value })} placeholder="Agent, market, or thesis" />
            </label>
            <div className="filter-grid">
              <label>
                Market
                <select value={filters.market} onChange={(event) => setFilters({ ...filters, market: event.target.value })}>
                  {marketOptions.map((option) => <option key={option}>{option}</option>)}
                </select>
              </label>
              <label>
                Action
                <select value={filters.action} onChange={(event) => setFilters({ ...filters, action: event.target.value })}>
                  {filterActionOptions.map((option) => <option key={option}>{option}</option>)}
                </select>
              </label>
              <label>
                Outcome
                <select value={filters.outcome} onChange={(event) => setFilters({ ...filters, outcome: event.target.value })}>
                  {outcomeOptions.map((option) => <option key={option}>{option}</option>)}
                </select>
              </label>
              <label>
                Min quality
                <input type="number" min="0" value={filters.minQuality} onChange={(event) => setFilters({ ...filters, minQuality: event.target.value })} />
              </label>
            </div>
            <label className="toggle-row">
              <input
                type="checkbox"
                checked={filters.onlyWatched}
                onChange={(event) => setFilters({ ...filters, onlyWatched: event.target.checked })}
              />
              Watchlist only
            </label>
          </div>
          {isOwner && (
            <form className="resolver" onSubmit={(event) => event.preventDefault()}>
              <div className="section-title">
                <BadgeCheck size={18} />
                <h2>Resolution Dashboard</h2>
              </div>
              <div className="resolver-grid">
                <label>
                  Signal ID
                  <input
                    min="0"
                    type="number"
                    value={resolution.signalId}
                    onChange={(event) => setResolution({ ...resolution, signalId: event.target.value })}
                  />
                </label>
                <label>
                  Outcome
                  <select value={resolution.status} onChange={(event) => setResolution({ ...resolution, status: event.target.value })}>
                    <option value="1">Won</option>
                    <option value="2">Lost</option>
                    <option value="3">Cancelled</option>
                  </select>
                </label>
              </div>
              <label>
                Evidence link
                <input
                  value={resolution.evidenceURI}
                  onChange={(event) => setResolution({ ...resolution, evidenceURI: event.target.value })}
                  placeholder="https://..."
                />
              </label>
              <button type="button" disabled={pending !== "" || resolution.signalId === ""} onClick={resolveSignal}>
                <BadgeCheck size={16} />
                Resolve signal
              </button>
            </form>
          )}
          {!isOwner && (
            <div className="resolver-note">
              <b>Resolution Dashboard</b>
              <span>Connect the owner wallet to settle open signals with evidence.</span>
            </div>
          )}
          <div className="feed-list">
            {visibleSignals.length === 0 ? (
              <div className="empty-results">
                <b>No signals match these filters.</b>
                <span>Lower the quality floor, clear the search, or disable watchlist-only mode.</span>
              </div>
            ) : (
              visibleSignals.map((signal) => (
                <SignalCard key={signal.id} signal={signal} followedAgents={followedAgents} onToggleFollow={toggleFollow} />
              ))
            )}
          </div>
        </section>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider>
          <App />
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </React.StrictMode>
);
