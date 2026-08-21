import { Router, type IRouter } from "express";
import {
  CreateInvoiceBody,
  GetCryptoPricesResponse,
  GetDashboardResponse,
  GetSettingsResponse,
  ListInvoicesQueryParams,
  ListInvoicesResponse,
  UpdateSettingsBody,
} from "@workspace/api-zod";

type Invoice = {
  id: string;
  invoiceNumber: string;
  customer: string;
  note?: string | null;
  amount: number;
  currency: string;
  cryptoAmount: number;
  cryptoSymbol: string;
  status: "pending" | "paid" | "expired";
  createdAt: string;
  expiresAt: string;
  network: string;
  fee: number;
  address?: string;
};

const prices = [
  { symbol: "USDT", name: "Tether", price: 1, change24h: 0.02, updatedAt: "Just now" },
  { symbol: "USDC", name: "USD Coin", price: 1, change24h: 0.01, updatedAt: "Just now" },
  { symbol: "BTC", name: "Bitcoin", price: 64280.5, change24h: 2.84, updatedAt: "Just now" },
  { symbol: "ETH", name: "Ethereum", price: 3521.72, change24h: 1.62, updatedAt: "Just now" },
];

let settings = {
  botName: "CryptoPay Bot",
  botConnected: false,
  serviceFeePercent: 1.5,
  enabledCurrencies: ["USDT", "USDC", "BTC", "ETH"],
  defaultExpiryMinutes: 60,
};

const invoices: Invoice[] = [
  {
    id: "inv_001",
    invoiceNumber: "CP-240821-001",
    customer: "sokha_studio",
    note: "Website maintenance",
    amount: 250,
    currency: "USD",
    cryptoAmount: 250,
    cryptoSymbol: "USDT",
    status: "paid",
    createdAt: "2026-08-21T08:32:00.000Z",
    expiresAt: "2026-08-21T09:32:00.000Z",
    network: "TRC20",
    fee: 3.75,
    address: "TQ7x...4Kp9",
  },
  {
    id: "inv_002",
    invoiceNumber: "CP-240821-002",
    customer: "dara_market",
    note: "Premium membership",
    amount: 89,
    currency: "USD",
    cryptoAmount: 0.0253,
    cryptoSymbol: "ETH",
    status: "pending",
    createdAt: "2026-08-21T07:45:00.000Z",
    expiresAt: "2026-08-21T08:45:00.000Z",
    network: "ERC20",
    fee: 1.34,
    address: "0x9b...a71c",
  },
  {
    id: "inv_003",
    invoiceNumber: "CP-240820-018",
    customer: "linh_codes",
    note: "Bot setup",
    amount: 120,
    currency: "USD",
    cryptoAmount: 120,
    cryptoSymbol: "USDC",
    status: "paid",
    createdAt: "2026-08-20T15:20:00.000Z",
    expiresAt: "2026-08-20T16:20:00.000Z",
    network: "ERC20",
    fee: 1.8,
    address: "0x4a...19fe",
  },
];

function calculateCryptoAmount(amount: number, symbol: string) {
  const price = prices.find((item) => item.symbol === symbol)?.price ?? 1;
  return Number((amount / price).toFixed(symbol === "USDT" || symbol === "USDC" ? 2 : 6));
}

const router: IRouter = Router();

router.get("/dashboard", (_req, res) => {
  const paid = invoices.filter((invoice) => invoice.status === "paid");
  const pending = invoices.filter((invoice) => invoice.status === "pending");
  const total = paid.reduce((sum, invoice) => sum + invoice.amount, 0);
  const summary = {
    totalReceived: total,
    pendingAmount: pending.reduce((sum, invoice) => sum + invoice.amount, 0),
    successRate: invoices.length ? Number(((paid.length / invoices.length) * 100).toFixed(1)) : 0,
    activeInvoices: pending.length,
    recentActivity: invoices.slice(0, 5),
  };
  res.json(GetDashboardResponse.parse(summary));
});

router.get("/invoices", (req, res) => {
  const query = ListInvoicesQueryParams.parse(req.query);
  const filtered = query.status === "all" ? invoices : invoices.filter((invoice) => invoice.status === query.status);
  res.json(ListInvoicesResponse.parse(filtered.slice(0, query.limit)));
});

router.post("/invoices", (req, res) => {
  const body = CreateInvoiceBody.parse(req.body);
  const now = new Date();
  const fee = Number((body.amount * (settings.serviceFeePercent / 100)).toFixed(2));
  const invoice: Invoice = {
    id: `inv_${Date.now()}`,
    invoiceNumber: `CP-${now.toISOString().slice(2, 10).replace(/-/g, "")}-${String(invoices.length + 1).padStart(3, "0")}`,
    customer: body.customer,
    note: body.note ?? null,
    amount: body.amount,
    currency: body.currency,
    cryptoAmount: calculateCryptoAmount(body.amount, body.cryptoSymbol),
    cryptoSymbol: body.cryptoSymbol,
    status: "pending",
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + body.expiresInMinutes * 60_000).toISOString(),
    network: body.network,
    fee,
    address: body.cryptoSymbol === "BTC" ? "bc1q...8z3m" : body.cryptoSymbol === "ETH" ? "0x9b...a71c" : "TQ7x...4Kp9",
  };
  invoices.unshift(invoice);
  res.status(201).json(invoice);
});

router.get("/prices", (_req, res) => {
  res.json(GetCryptoPricesResponse.parse(prices));
});

router.get("/settings", (_req, res) => {
  res.json(GetSettingsResponse.parse(settings));
});

router.patch("/settings", (req, res) => {
  const update = UpdateSettingsBody.parse(req.body);
  settings = { ...settings, ...update };
  res.json(GetSettingsResponse.parse(settings));
});

export default router;