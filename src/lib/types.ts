export type ID = string;

/** Uang selalu integer rupiah. Tidak pernah float. */
export type Rupiah = number;

export type ProductKind = "handset" | "accessory" | "voucher" | "service" | "secondhand";

export type Product = {
  id: ID;
  sku: string;
  name: string;
  brand: string;
  kind: ProductKind;
  categoryId: ID;
  barcode: string;
  isSerialized: boolean;
  cost: Rupiah;
  price: Rupiah;
  minPrice: Rupiah;
  minMarginPct: number;
  reorderPoint: number;
  reorderQty: number;
  supplierId: ID | null;
  isActive: boolean;
  createdAt: string;
  tags: { abc: "A" | "B" | "C"; xyz: "X" | "Y" | "Z" };
};

export type UnitStatus = "in_stock" | "reserved" | "sold" | "returned" | "service";

export type InventoryUnit = {
  id: ID;
  productId: ID;
  imei1: string;
  imei2: string | null;
  serial: string | null;
  cost: Rupiah;
  status: UnitStatus;
  warrantyMonths: number;
  receivedAt: string;
  soldAt: string | null;
};

export type MovementReason =
  | "purchase"
  | "sale"
  | "return"
  | "adjust"
  | "opname"
  | "transfer"
  | "damage"
  | "tradein";

export type StockMovement = {
  id: ID;
  productId: ID;
  unitId: ID | null;
  qtyDelta: number;
  reason: MovementReason;
  refType: "sale" | "po" | "opname" | "manual" | "service";
  refId: ID | null;
  unitCost: Rupiah;
  note: string;
  occurredAt: string;
  actorId: ID;
};

export type User = {
  id: ID;
  name: string;
  email: string;
  role: "owner" | "staff";
  pin: string;
  isActive: boolean;
};

export type Device = {
  id: ID;
  userId: ID;
  label: string;
  lastSeenAt: string;
  trusted: boolean;
  city: string;
};

export type Shift = {
  id: ID;
  userId: ID;
  openedAt: string;
  closedAt: string | null;
  openingFloat: Rupiah;
  countedCash: Rupiah | null;
  expectedCash: Rupiah | null;
  variance: Rupiah | null;
  varianceReason: string | null;
  note: string;
};

export type PaymentMethod = "cash" | "qris" | "transfer" | "edc" | "ewallet" | "credit";

export type SaleStatus = "completed" | "pending" | "void" | "refunded";

export type SaleItem = {
  id: ID;
  saleId: ID;
  productId: ID;
  unitId: ID | null;
  name: string;
  qty: number;
  unitPrice: Rupiah;
  unitCost: Rupiah;
  discount: Rupiah;
  lineTotal: Rupiah;
  margin: Rupiah;
  imei: string | null;
  lineType: "product" | "tradein" | "service";
};

export type Payment = {
  id: ID;
  saleId: ID;
  method: PaymentMethod;
  amount: Rupiah;
  providerRef: string | null;
  paidAt: string;
};

export type Sale = {
  id: ID;
  receiptNo: string;
  userId: ID;
  shiftId: ID;
  customerId: ID | null;
  subtotal: Rupiah;
  discountTotal: Rupiah;
  grandTotal: Rupiah;
  cogsTotal: Rupiah;
  status: SaleStatus;
  discountReason: string;
  ownerApprovedBy: ID | null;
  createdAt: string;
  note: string;
};

export type Customer = {
  id: ID;
  name: string;
  phone: string;
  email: string | null;
  consentEmail: boolean;
  consentAt: string | null;
  lastReviewRequestAt: string | null;
  createdAt: string;
};

export type ExpenseCategory =
  | "rent"
  | "salary"
  | "utilities"
  | "marketing"
  | "owner_draw"
  | "other"
  | "restock"
  | "supplier_payment";

export type CashDirection = "in" | "out";

export type CashTransaction = {
  id: ID;
  accountId: ID;
  direction: CashDirection;
  amount: Rupiah;
  category: ExpenseCategory | "sales" | "refund" | "receivable";
  refType: "sale" | "po" | "expense" | "draw" | "manual";
  refId: ID | null;
  label: string;
  occurredAt: string;
};

export type Expense = {
  id: ID;
  category: ExpenseCategory;
  amount: Rupiah;
  dueDate: string;
  paidAt: string | null;
  recurringRule: string | null;
  attachment: boolean;
  note: string;
};

export type Supplier = {
  id: ID;
  name: string;
  contact: string;
  paymentTermsDays: number;
  leadTimeDays: number;
  note: string;
};

export type PurchaseOrder = {
  id: ID;
  number: string;
  supplierId: ID;
  status: "draft" | "sent" | "received" | "partial";
  total: Rupiah;
  orderedAt: string;
  receivedAt: string | null;
  dueDate: string;
  paidAt: string | null;
  cashRequired: Rupiah;
};

export type Receivable = {
  id: ID;
  customerId: ID;
  saleId: ID;
  amount: Rupiah;
  paidAmount: Rupiah;
  dueDate: string;
  status: "open" | "paid" | "overdue";
};

export type ReceiptDelivery = {
  id: ID;
  saleId: ID;
  channel: "email" | "print" | "whatsapp_link" | "qr";
  status: "queued" | "sent" | "opened" | "failed";
  sentAt: string | null;
  openedAt: string | null;
};

export type ReviewRequest = {
  id: ID;
  saleId: ID;
  customerId: ID;
  shortCode: string;
  scheduledAt: string;
  sentAt: string | null;
  clickedAt: string | null;
};

export type OpnameSession = {
  id: ID;
  code: string;
  startedAt: string;
  closedAt: string | null;
  status: "open" | "closed" | "approved";
  countedBy: ID;
  note: string;
};

export type OpnameLine = {
  id: ID;
  sessionId: ID;
  productId: ID;
  systemQty: number;
  countedQty: number;
  variance: number;
  varianceValue: Rupiah;
};

export type AuditEntry = {
  id: ID;
  actorId: ID;
  action: string;
  entity: string;
  entityId: ID | null;
  detail: string;
  at: string;
};

export type TaskPhase = "stabilize" | "free_cash" | "margin" | "rebuild";

export type RecoveryTask = {
  id: ID;
  phase: TaskPhase;
  title: string;
  detail: string;
  kpi: string;
  target: number;
  current: number;
  due: string;
  status: "open" | "done" | "skipped";
  source: "engine" | "ai" | "manual";
  impactPerMonth: Rupiah;
};

export type Account = {
  id: ID;
  name: "drawer" | "bank" | "ewallet";
  label: string;
  openingBalance: Rupiah;
};

export type ShopProfile = {
  name: string;
  tagline: string;
  address: string;
  phone: string;
  hours: string;
  timezone: string;
  placeId: string;
  reviewCooldownDays: number;
  minMarginPct: number;
  staffDiscountLimitPct: number;
  ownerDrawMonthlyCap: Rupiah;
  safetyCashFloor: Rupiah;
  varianceThreshold: Rupiah;
  taxEnabled: boolean;
  taxPct: number;
};

export type Dataset = {
  asOf: string;
  days: number;
  startDate: string;
  profile: ShopProfile;
  users: User[];
  devices: Device[];
  shifts: Shift[];
  categories: { id: ID; name: string; kind: ProductKind }[];
  suppliers: Supplier[];
  products: Product[];
  units: InventoryUnit[];
  movements: StockMovement[];
  customers: Customer[];
  sales: Sale[];
  saleItems: SaleItem[];
  payments: Payment[];
  cashTransactions: CashTransaction[];
  expenses: Expense[];
  purchaseOrders: PurchaseOrder[];
  receivables: Receivable[];
  receiptDeliveries: ReceiptDelivery[];
  reviewRequests: ReviewRequest[];
  accounts: Account[];
  opnameSessions: OpnameSession[];
  opnameLines: OpnameLine[];
  auditLog: AuditEntry[];
  recoveryTasks: RecoveryTask[];
};
