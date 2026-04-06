-- ================================================================
-- 绿发物业领域本体 Demo — Database Init
-- 四域十四表：W(物) H(人) F(财) E(事)
-- ================================================================

SET client_encoding = 'UTF8';

-------------------------------------------------------------------
-- W域：物（资产/空间）
-------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.property_project (
    project_id  VARCHAR(20) NOT NULL PRIMARY KEY,
    project_name VARCHAR(100) NOT NULL,
    project_status VARCHAR(20) DEFAULT 'OPERATING',
    region      VARCHAR(50)
);

CREATE TABLE IF NOT EXISTS public.space_unit (
    space_id    VARCHAR(30) NOT NULL PRIMARY KEY,
    project_id  VARCHAR(20) REFERENCES public.property_project(project_id),
    billing_area DECIMAL(10,2),
    building_area DECIMAL(10,2)
);

CREATE TABLE IF NOT EXISTS public.parking_space (
    parking_id  VARCHAR(30) NOT NULL PRIMARY KEY,
    project_id  VARCHAR(20) REFERENCES public.property_project(project_id),
    parking_type VARCHAR(20) DEFAULT 'MONTHLY'
);

CREATE TABLE IF NOT EXISTS public.meter (
    meter_id    VARCHAR(30) NOT NULL PRIMARY KEY,
    space_id    VARCHAR(30) REFERENCES public.space_unit(space_id),
    meter_type  VARCHAR(20)
);

-------------------------------------------------------------------
-- H域：人（客户/账户/人员）
-------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.customer (
    global_id       VARCHAR(30) NOT NULL PRIMARY KEY,
    legal_name      VARCHAR(100),
    id_number       VARCHAR(50),
    customer_status VARCHAR(20) DEFAULT 'ACTIVE'
);

CREATE TABLE IF NOT EXISTS public.account (
    account_id      VARCHAR(30) NOT NULL PRIMARY KEY,
    global_id       VARCHAR(30) REFERENCES public.customer(global_id),
    project_id      VARCHAR(20) REFERENCES public.property_project(project_id),
    balance         DECIMAL(12,2) DEFAULT 0.00,
    account_status  VARCHAR(20) DEFAULT 'ACTIVE'
);

CREATE TABLE IF NOT EXISTS public.subscription (
    subscr_id       VARCHAR(30) NOT NULL PRIMARY KEY,
    account_id      VARCHAR(30) REFERENCES public.account(account_id),
    space_id        VARCHAR(30),
    parking_id      VARCHAR(30),
    bc_id           VARCHAR(30),
    contract_id     VARCHAR(30),
    subscr_start    DATE,
    subscr_end      DATE,
    subscr_status   VARCHAR(20) DEFAULT 'ACTIVE'
);

CREATE TABLE IF NOT EXISTS public.person (
    person_id       VARCHAR(30) NOT NULL PRIMARY KEY,
    person_name     VARCHAR(50),
    work_type       VARCHAR(20),
    project_id      VARCHAR(20) REFERENCES public.property_project(project_id)
);

-------------------------------------------------------------------
-- F域：财（合同/账单/收款）
-------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.contract (
    contract_id     VARCHAR(30) NOT NULL PRIMARY KEY,
    project_id      VARCHAR(20) REFERENCES public.property_project(project_id),
    contract_start  DATE,
    contract_end    DATE
);

CREATE TABLE IF NOT EXISTS public.business_class (
    bc_id               VARCHAR(30) NOT NULL PRIMARY KEY,
    billing_base_type   VARCHAR(20),
    unit_price          DECIMAL(10,4),
    tax_rate            DECIMAL(5,4),
    settlement_frequency VARCHAR(20),
    settlement_anchor   VARCHAR(10),
    accounting_mode     VARCHAR(20)
);

CREATE TABLE IF NOT EXISTS public.bill (
    bill_id         VARCHAR(30) NOT NULL PRIMARY KEY,
    subscr_id       VARCHAR(30) REFERENCES public.subscription(subscr_id),
    period          VARCHAR(10),
    amount_due      DECIMAL(12,2),
    amount_paid     DECIMAL(12,2) DEFAULT 0.00,
    amount_balance  DECIMAL(12,2),
    bill_status     VARCHAR(20) DEFAULT 'PENDING',
    source_flag     VARCHAR(20) DEFAULT 'SYSTEM_AUTO'
);

CREATE TABLE IF NOT EXISTS public.payment (
    pay_id          VARCHAR(30) NOT NULL PRIMARY KEY,
    bill_id         VARCHAR(30) REFERENCES public.bill(bill_id),
    pay_channel     VARCHAR(20),
    pay_amount      DECIMAL(12,2),
    pay_time        TIMESTAMP DEFAULT NOW(),
    match_status    VARCHAR(20) DEFAULT 'UNMATCHED'
);

-------------------------------------------------------------------
-- E域：事（工单/事件）
-------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.work_order (
    order_id        VARCHAR(30) NOT NULL PRIMARY KEY,
    project_id      VARCHAR(20) REFERENCES public.property_project(project_id),
    order_type      VARCHAR(30),
    service_fee     DECIMAL(12,2),
    bill_id         VARCHAR(30)
);

CREATE TABLE IF NOT EXISTS public.cost_allocation (
    alloc_id        VARCHAR(30) NOT NULL PRIMARY KEY,
    project_id      VARCHAR(20) REFERENCES public.property_project(project_id),
    cost_type       VARCHAR(30),
    alloc_amount    DECIMAL(12,2),
    alloc_period    VARCHAR(10)
);


-------------------------------------------------------------------
-- 示例数据
-------------------------------------------------------------------

-- W域：项目
INSERT INTO public.property_project (project_id, project_name, project_status, region) VALUES
('P100123', '望京花园', 'OPERATING', '北京·朝阳'),
('P200456', '三亚湾度假村', 'OPERATING', '海南·三亚')
ON CONFLICT DO NOTHING;

-- W域：空间单元
INSERT INTO public.space_unit (space_id, project_id, billing_area, building_area) VALUES
('SU-P100123-3-2-101', 'P100123', 98.50, 102.30),
('SU-P100123-3-2-201', 'P100123', 120.00, 125.80),
('SU-P200456-A-1-502', 'P200456', 85.20, 89.60)
ON CONFLICT DO NOTHING;

-- W域：停车位
INSERT INTO public.parking_space (parking_id, project_id, parking_type) VALUES
('PK-P100123-B1-001', 'P100123', 'MONTHLY'),
('PK-P100123-B1-002', 'P100123', 'OWNED'),
('PK-P200456-B1-010', 'P200456', 'MONTHLY')
ON CONFLICT DO NOTHING;

-- W域：表计
INSERT INTO public.meter (meter_id, space_id, meter_type) VALUES
('MT-P100123-E-3-2-101', 'SU-P100123-3-2-101', 'ELECTRIC'),
('MT-P100123-W-3-2-101', 'SU-P100123-3-2-101', 'WATER'),
('MT-P100123-E-3-2-201', 'SU-P100123-3-2-201', 'ELECTRIC'),
('MT-P200456-E-A-1-502', 'SU-P200456-A-1-502', 'ELECTRIC')
ON CONFLICT DO NOTHING;

-- H域：客户
INSERT INTO public.customer (global_id, legal_name, id_number, customer_status) VALUES
('G-20260401-000001', '张三', '110105199001011234', 'ACTIVE'),
('G-20260401-000002', '李四', '460200198805052345', 'ACTIVE'),
('G-20260401-000003', '绿发物业三亚分公司', '91460200MA5XXXXX', 'ACTIVE')
ON CONFLICT DO NOTHING;

-- H域：账户
INSERT INTO public.account (account_id, global_id, project_id, balance, account_status) VALUES
('ACCT-P100123-000001', 'G-20260401-000001', 'P100123', 500.00, 'ACTIVE'),
('ACCT-P100123-000002', 'G-20260401-000002', 'P100123', 0.00, 'ACTIVE'),
('ACCT-P200456-000001', 'G-20260401-000002', 'P200456', 1200.00, 'ACTIVE'),
('ACCT-P200456-000002', 'G-20260401-000003', 'P200456', 10000.00, 'ACTIVE')
ON CONFLICT DO NOTHING;

-- H域：订阅关系
INSERT INTO public.subscription (subscr_id, account_id, space_id, parking_id, bc_id, contract_id, subscr_start, subscr_end, subscr_status) VALUES
('SUB-P100123-PROP-000001', 'ACCT-P100123-000001', 'SU-P100123-3-2-101', NULL, 'BC-PROP-RES', 'CT-P100123-001', '2023-04-01', NULL, 'ACTIVE'),
('SUB-P100123-PROP-000002', 'ACCT-P100123-000002', 'SU-P100123-3-2-201', NULL, 'BC-PROP-RES', 'CT-P100123-002', '2024-01-01', NULL, 'ACTIVE'),
('SUB-P100123-PARK-000001', 'ACCT-P100123-000001', NULL, 'PK-P100123-B1-001', 'BC-PARK-MON', 'CT-P100123-001', '2023-04-01', NULL, 'ACTIVE'),
('SUB-P200456-PROP-000001', 'ACCT-P200456-000001', 'SU-P200456-A-1-502', NULL, 'BC-PROP-RES', 'CT-P200456-001', '2025-06-01', NULL, 'ACTIVE'),
('SUB-P200456-PARK-000001', 'ACCT-P200456-000002', NULL, 'PK-P200456-B1-010', 'BC-PARK-MON', 'CT-P200456-002', '2025-06-01', NULL, 'ACTIVE')
ON CONFLICT DO NOTHING;

-- H域：人员
INSERT INTO public.person (person_id, person_name, work_type, project_id) VALUES
('H4-P100123-001', '王建国', 'OUTSOURCED', 'P100123'),
('H4-P100123-002', '赵丽', 'OUTSOURCED', 'P100123'),
('H5-P200456-001', '孙明', 'IN_HOUSE', 'P200456')
ON CONFLICT DO NOTHING;

-- F域：合同
INSERT INTO public.contract (contract_id, project_id, contract_start, contract_end) VALUES
('CT-P100123-001', 'P100123', '2023-04-01', '2028-03-31'),
('CT-P100123-002', 'P100123', '2024-01-01', '2028-12-31'),
('CT-P200456-001', 'P200456', '2025-06-01', '2030-05-31'),
('CT-P200456-002', 'P200456', '2025-06-01', '2028-05-31')
ON CONFLICT DO NOTHING;

-- F域：业务项
INSERT INTO public.business_class (bc_id, billing_base_type, unit_price, tax_rate, settlement_frequency, settlement_anchor, accounting_mode) VALUES
('BC-PROP-RES', 'AREA', 3.50, 0.06, 'MONTHLY', 'D01', 'CASH'),
('BC-PARK-MON', 'FIXED', 350.00, 0.06, 'MONTHLY', 'D01', 'CASH'),
('BC-PROP-COM', 'AREA', 8.00, 0.09, 'MONTHLY', 'D01', 'ACCRUAL')
ON CONFLICT DO NOTHING;

-- F域：账单
INSERT INTO public.bill (bill_id, subscr_id, period, amount_due, amount_paid, amount_balance, bill_status, source_flag) VALUES
('BL-P100123-202604-00001', 'SUB-P100123-PROP-000001', '2026-04', 344.75, 344.75, 0.00, 'SETTLED', 'SYSTEM_AUTO'),
('BL-P100123-202605-00001', 'SUB-P100123-PROP-000001', '2026-05', 344.75, 0.00, 344.75, 'PENDING', 'SYSTEM_AUTO'),
('BL-P100123-202604-00002', 'SUB-P100123-PROP-000002', '2026-04', 420.00, 420.00, 0.00, 'SETTLED', 'SYSTEM_AUTO'),
('BL-P100123-202604-00003', 'SUB-P100123-PARK-000001', '2026-04', 350.00, 350.00, 0.00, 'SETTLED', 'SYSTEM_AUTO'),
('BL-P200456-202604-00001', 'SUB-P200456-PROP-000001', '2026-04', 298.20, 0.00, 298.20, 'PENDING', 'SYSTEM_AUTO'),
('BL-P200456-202604-00002', 'SUB-P200456-PARK-000001', '2026-04', 350.00, 0.00, 350.00, 'PENDING', 'SYSTEM_AUTO')
ON CONFLICT DO NOTHING;

-- F域：收款
INSERT INTO public.payment (pay_id, bill_id, pay_channel, pay_amount, pay_time, match_status) VALUES
('PAY-WECHAT-20260410-001', 'BL-P100123-202604-00001', 'WECHAT', 344.75, '2026-04-10 09:15:00', 'AUTO_MATCHED'),
('PAY-BANK-20260412-001', 'BL-P100123-202604-00002', 'BANK', 420.00, '2026-04-12 14:30:00', 'AUTO_MATCHED'),
('PAY-ALIPAY-20260408-001', 'BL-P100123-202604-00003', 'ALIPAY', 350.00, '2026-04-08 11:20:00', 'AUTO_MATCHED')
ON CONFLICT DO NOTHING;

-- E域：工单
INSERT INTO public.work_order (order_id, project_id, order_type, service_fee, bill_id) VALUES
('WO-P100123-20260401', 'P100123', '增值服务-家政', 200.00, NULL),
('WO-P200456-20260402', 'P200456', '增值服务-搬家', 500.00, NULL)
ON CONFLICT DO NOTHING;

-- E域：成本分摊
INSERT INTO public.cost_allocation (alloc_id, project_id, cost_type, alloc_amount, alloc_period) VALUES
('CA-P100123-202604-LABOR', 'P100123', '劳务外包', 85000.00, '2026-04'),
('CA-P100123-202604-UTIL', 'P100123', '公区水电', 12500.00, '2026-04'),
('CA-P200456-202604-LABOR', 'P200456', '劳务外包', 42000.00, '2026-04'),
('CA-P200456-202604-MGMT', 'P200456', '管理费用', 18000.00, '2026-04')
ON CONFLICT DO NOTHING;
