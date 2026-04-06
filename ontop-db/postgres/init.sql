-- Ontop UI - Retail Database Init
SET client_encoding = 'UTF8';

CREATE TABLE IF NOT EXISTS public.dim_store (
    store_id integer NOT NULL PRIMARY KEY,
    name character varying(100),
    region character varying(50)
);

CREATE TABLE IF NOT EXISTS public.dim_employee (
    emp_id integer NOT NULL PRIMARY KEY,
    name character varying(100),
    role character varying(50),
    store_id integer REFERENCES public.dim_store(store_id)
);

CREATE TABLE IF NOT EXISTS public.fact_sales (
    sale_id integer NOT NULL PRIMARY KEY,
    emp_id integer REFERENCES public.dim_employee(emp_id),
    store_id integer REFERENCES public.dim_store(store_id),
    amount numeric(10,2),
    sale_date date
);

-- Seed data
INSERT INTO public.dim_store (store_id, name, region) VALUES
(1, '华东旗舰店', '华东'),
(2, '南京中心店', '华东'),
(3, '广州天河店', '华南'),
(4, '深圳南山店', '华南')
ON CONFLICT DO NOTHING;

INSERT INTO public.dim_employee (emp_id, name, role, store_id) VALUES
(101, '张三', '店长', 1),
(102, '李四', '销售员', 1),
(103, '王五', '销售员', 2),
(104, '赵六', '店长', 3),
(105, '钱七', '销售员', 4)
ON CONFLICT DO NOTHING;

INSERT INTO public.fact_sales (sale_id, emp_id, store_id, amount, sale_date) VALUES
(1001, 102, 1, 1500.00, '2026-03-01'),
(1002, 102, 1, 2300.00, '2026-03-05'),
(1003, 103, 2,  800.00, '2026-03-03'),
(1004, 104, 3, 3200.00, '2026-03-02'),
(1005, 105, 4, 1100.00, '2026-03-04'),
(1006, 102, 1,  900.00, '2026-03-10')
ON CONFLICT DO NOTHING;
