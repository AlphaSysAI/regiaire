// Reference data model (Prisma-shaped). Runtime persistence = Supabase SQL
// (see supabase-purchase-orders.sql). No Prisma client is wired in this repo.

/*
enum OrderStatus {
  DRAFT
  VALIDATED
  SENT
  RECEIVED
  CANCELLED
}

model PurchaseOrder {
  id               String              @id @default(cuid())
  stationId        String
  orderNumber      String              @unique
  status           OrderStatus         @default(DRAFT)
  category         String?
  planDate         DateTime            @db.Date
  totalEstimatedHT Float               @default(0)
  validatedAt      DateTime?
  sentAt           DateTime?
  receivedAt       DateTime?
  deliveryDate     DateTime?           @db.Date
  notes            String?
  exportPayload    Json?
  items            PurchaseOrderItem[]
  createdAt        DateTime            @default(now())
  updatedAt        DateTime            @updatedAt

  @@index([stationId, status])
  @@map("purchase_orders")
}

model PurchaseOrderItem {
  id                    String        @id @default(cuid())
  orderId               String
  order                 PurchaseOrder @relation(fields: [orderId], references: [id], onDelete: Cascade)
  productId             String
  productName           String
  category              String
  ean                   String?
  currentStock          Float
  suggestedQty          Float
  adjustedQty           Float
  unitPriceHT           Float         @default(0)
  isValidated           Boolean       @default(false)
  urgencyLevel          String
  reasonCode            String?
  estimatedSalesJ3      Float?
  confidencePct         Float?
  justificationSummary  String?

  @@unique([orderId, productId])
  @@index([orderId, productId])
  @@map("purchase_order_items")
}
*/

export type OrderStatus = 'DRAFT' | 'VALIDATED' | 'SENT' | 'RECEIVED' | 'CANCELLED';

export type UrgencyLevel = 'CRITICAL' | 'WARNING' | 'NORMAL';

export interface PurchaseOrderItem {
  id: string;
  orderId: string;
  productId: string;
  productName: string;
  category: string;
  ean: string | null;
  currentStock: number;
  suggestedQty: number;
  adjustedQty: number;
  unitPriceHT: number;
  isValidated: boolean;
  urgencyLevel: UrgencyLevel;
  reasonCode: string | null;
  estimatedSalesJ3: number;
  confidencePct: number;
  justificationSummary: string | null;
}

export interface PurchaseOrder {
  id: string;
  stationId: string;
  orderNumber: string;
  status: OrderStatus;
  category: string | null;
  planDate: string;
  totalEstimatedHT: number;
  validatedAt: string | null;
  sentAt: string | null;
  receivedAt: string | null;
  deliveryDate: string | null;
  notes: string | null;
  exportPayload: OrderExportPayload | null;
  items: PurchaseOrderItem[];
  createdAt: string;
  updatedAt: string;
}

export interface OrderExportPayload {
  orderNumber: string;
  stationId: string;
  status: OrderStatus;
  sentAt: string;
  deliveryDate: string | null;
  totalEstimatedHT: number;
  itemCount: number;
  validatedItemCount: number;
  volumes: {
    boutiqueUnits: number;
    fuelLitresApprox: number;
  };
  items: Array<{
    productId: string;
    ean: string | null;
    productName: string;
    category: string;
    qty: number;
    unitPriceHT: number;
    lineHT: number;
    urgencyLevel: UrgencyLevel;
  }>;
  csv: string;
  webhookReady: {
    event: 'purchase_order.sent';
    orderId: string;
    orderNumber: string;
  };
}

export interface OrderActionResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}
