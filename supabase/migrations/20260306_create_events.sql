-- Create the events table
DROP TABLE IF EXISTS public.events CASCADE;
CREATE TABLE public.events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type TEXT NOT NULL CHECK (type IN ('titan', 'exit')),
    location TEXT, -- Only for 'exit'
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    start_time TIME NOT NULL,
    end_time TIME,
    payment_type TEXT NOT NULL DEFAULT 'fixed' CHECK (payment_type IN ('fixed', 'hourly')),
    fixed_amount NUMERIC(10, 2),
    status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'active', 'completed')),
    comment TEXT,
    reminders JSONB DEFAULT '[]'::JSONB,
    check_id UUID REFERENCES public.checks(id) ON DELETE SET NULL,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

-- Simple policy for staff/owners
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.events;
CREATE POLICY "Enable all access for authenticated users" ON public.events
    FOR ALL USING (auth.role() = 'authenticated');

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_events_updated_at ON public.events;
CREATE TRIGGER update_events_updated_at
    BEFORE UPDATE ON public.events
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
