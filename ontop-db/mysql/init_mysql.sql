-- 电商场景 Demo - MySQL Init

-- 分类（含自引用外键）
CREATE TABLE IF NOT EXISTS category (
    category_id    INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    category_name  VARCHAR(100) NOT NULL,
    parent_id      INT NULL,
    created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (parent_id) REFERENCES category(category_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 商品
CREATE TABLE IF NOT EXISTS product (
    product_id     INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    product_name   VARCHAR(200) NOT NULL,
    category_id    INT NOT NULL,
    price          DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    stock          INT NOT NULL DEFAULT 0,
    description    TEXT,
    is_active      TINYINT(1) DEFAULT 1,
    created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES category(category_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 客户
CREATE TABLE IF NOT EXISTS customer (
    customer_id    INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    customer_name  VARCHAR(100) NOT NULL,
    email          VARCHAR(200),
    phone          VARCHAR(20),
    address        TEXT,
    registered_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    status         VARCHAR(20) DEFAULT 'ACTIVE'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 订单
CREATE TABLE IF NOT EXISTS orders (
    order_id       INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    customer_id    INT NOT NULL,
    order_date     DATETIME DEFAULT CURRENT_TIMESTAMP,
    total_amount   DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    order_status   VARCHAR(20) DEFAULT 'PENDING',
    shipping_addr  TEXT,
    FOREIGN KEY (customer_id) REFERENCES customer(customer_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 订单明细
CREATE TABLE IF NOT EXISTS order_item (
    item_id        INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    order_id       INT NOT NULL,
    product_id     INT NOT NULL,
    quantity       INT NOT NULL DEFAULT 1,
    unit_price     DECIMAL(10,2) NOT NULL,
    subtotal       DECIMAL(12,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
    FOREIGN KEY (order_id) REFERENCES orders(order_id),
    FOREIGN KEY (product_id) REFERENCES product(product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 示例数据：分类
INSERT INTO category (category_id, category_name, parent_id) VALUES
(1, '电子产品', NULL),
(2, '手机', 1),
(3, '电脑', 1),
(4, '服装', NULL),
(5, '男装', 4),
(6, '女装', 4);

-- 示例数据：商品
INSERT INTO product (product_id, product_name, category_id, price, stock, description) VALUES
(101, 'iPhone 16 Pro', 2, 8999.00, 500, '最新款苹果手机'),
(102, 'MacBook Air M4', 3, 9499.00, 200, '轻薄笔记本'),
(103, '纯棉T恤', 5, 99.00, 3000, '基础款纯棉T恤'),
(104, '连衣裙', 6, 299.00, 1500, '夏季连衣裙'),
(105, 'iPad Pro', 2, 6999.00, 300, '平板电脑');

-- 示例数据：客户
INSERT INTO customer (customer_id, customer_name, email, phone, address, status) VALUES
(1, '王明', 'wangming@example.com', '13800138001', '北京市朝阳区', 'ACTIVE'),
(2, '李华', 'lihua@example.com', '13900139002', '上海市浦东新区', 'ACTIVE'),
(3, '张三', 'zhangsan@example.com', '13700137003', '广州市天河区', 'INACTIVE');

-- 示例数据：订单
INSERT INTO orders (order_id, customer_id, order_date, total_amount, order_status, shipping_addr) VALUES
(1001, 1, '2026-04-01 10:30:00', 8999.00, 'COMPLETED', '北京市朝阳区'),
(1002, 1, '2026-04-02 14:20:00', 9598.00, 'COMPLETED', '北京市朝阳区'),
(1003, 2, '2026-04-03 09:00:00', 299.00, 'SHIPPED', '上海市浦东新区'),
(1004, 2, '2026-04-04 16:45:00', 16498.00, 'PENDING', '上海市浦东新区');

-- 示例数据：订单明细
INSERT INTO order_item (item_id, order_id, product_id, quantity, unit_price) VALUES
(1, 1001, 101, 1, 8999.00),
(2, 1002, 103, 2, 99.00),
(3, 1002, 102, 1, 9499.00),
(4, 1003, 104, 1, 299.00),
(5, 1004, 105, 1, 6999.00),
(6, 1004, 102, 1, 9499.00);
