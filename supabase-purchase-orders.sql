-- =============================================================================
-- OrbitAire — Module commandes fournisseurs (Purchase Orders)
-- =============================================================================
-- À exécuter dans l'éditeur SQL Supabase APRÈS supabase-schema-complet.sql
-- Idempotent.
-- =============================================================================

DO $$ BEGIN
  CREATE TYPE public.order_status AS ENUM (
    'DRAFT',
    'VALIDATED',
    'SENT',
    'RECEIVED',
    'CANCELLED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id UUID NOT NULL REFERENCES public.aires(id) ON DELETE CASCADE,
  order_number VARCHAR(40) NOT NULL UNIQUE,
  status public.order_status NOT NULL DEFAULT 'DRAFT',
  category VARCHAR(80),
  plan_date DATE NOT NULL DEFAULT CURRENT_DATE,
  total_estimated_ht NUMERIC(12, 2) NOT NULL DEFAULT 0,
  validated_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ,
  delivery_date DATE,
  notes TEXT,
  export_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_purchase_orders_station_status
  ON public.purchase_orders (station_id, status);

CREATE INDEX IF NOT EXISTS idx_purchase_orders_station_plan
  ON public.purchase_orders (station_id, plan_date);

CREATE TABLE IF NOT EXISTS public.purchase_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL,
  product_name VARCHAR(255) NOT NULL,
  category VARCHAR(80) NOT NULL DEFAULT 'Divers',
  ean VARCHAR(32),
  current_stock NUMERIC(12, 2) NOT NULL DEFAULT 0,
  suggested_qty NUMERIC(12, 2) NOT NULL DEFAULT 0,
  adjusted_qty NUMERIC(12, 2) NOT NULL DEFAULT 0,
  unit_price_ht NUMERIC(12, 4) NOT NULL DEFAULT 0,
  is_validated BOOLEAN NOT NULL DEFAULT FALSE,
  urgency_level VARCHAR(20) NOT NULL DEFAULT 'NORMAL'
    CHECK (urgency_level IN ('CRITICAL', 'WARNING', 'NORMAL')),
  reason_code VARCHAR(120),
  estimated_sales_j3 NUMERIC(12, 2) DEFAULT 0,
  confidence_pct NUMERIC(5, 1) DEFAULT 0,
  justification_summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (order_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_purchase_order_items_order_product
  ON public.purchase_order_items (order_id, product_id);

DROP TRIGGER IF EXISTS update_purchase_orders_updated_at ON public.purchase_orders;
CREATE TRIGGER update_purchase_orders_updated_at
  BEFORE UPDATE ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_purchase_order_items_updated_at ON public.purchase_order_items;
CREATE TRIGGER update_purchase_order_items_updated_at
  BEFORE UPDATE ON public.purchase_order_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view orders of their aire" ON public.purchase_orders;
CREATE POLICY "Users can view orders of their aire" ON public.purchase_orders
  FOR SELECT USING (
    station_id IN (SELECT aire_id FROM public.profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can insert orders of their aire" ON public.purchase_orders;
CREATE POLICY "Users can insert orders of their aire" ON public.purchase_orders
  FOR INSERT WITH CHECK (
    station_id IN (SELECT aire_id FROM public.profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can update orders of their aire" ON public.purchase_orders;
CREATE POLICY "Users can update orders of their aire" ON public.purchase_orders
  FOR UPDATE USING (
    station_id IN (SELECT aire_id FROM public.profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can delete orders of their aire" ON public.purchase_orders;
CREATE POLICY "Users can delete orders of their aire" ON public.purchase_orders
  FOR DELETE USING (
    station_id IN (SELECT aire_id FROM public.profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can view order items of their aire" ON public.purchase_order_items;
CREATE POLICY "Users can view order items of their aire" ON public.purchase_order_items
  FOR SELECT USING (
    order_id IN (
      SELECT po.id FROM public.purchase_orders po
      WHERE po.station_id IN (SELECT aire_id FROM public.profiles WHERE id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can insert order items of their aire" ON public.purchase_order_items;
CREATE POLICY "Users can insert order items of their aire" ON public.purchase_order_items
  FOR INSERT WITH CHECK (
    order_id IN (
      SELECT po.id FROM public.purchase_orders po
      WHERE po.station_id IN (SELECT aire_id FROM public.profiles WHERE id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can update order items of their aire" ON public.purchase_order_items;
CREATE POLICY "Users can update order items of their aire" ON public.purchase_order_items
  FOR UPDATE USING (
    order_id IN (
      SELECT po.id FROM public.purchase_orders po
      WHERE po.station_id IN (SELECT aire_id FROM public.profiles WHERE id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can delete order items of their aire" ON public.purchase_order_items;
CREATE POLICY "Users can delete order items of their aire" ON public.purchase_order_items
  FOR DELETE USING (
    order_id IN (
      SELECT po.id FROM public.purchase_orders po
      WHERE po.station_id IN (SELECT aire_id FROM public.profiles WHERE id = auth.uid())
    )
  );

COMMENT ON TABLE public.purchase_orders IS
  'Commandes fournisseurs OrbitAire — cycle DRAFT → VALIDATED → SENT → RECEIVED';
COMMENT ON TABLE public.purchase_order_items IS
  'Lignes de commande avec validation exploitant et quantités ajustées';
