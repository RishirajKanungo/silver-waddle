// Practice databases. Small enough to see every row, realistic enough to
// mirror the schemas used in big-tech SQL interviews. Deterministic (seeded),
// with deliberate traps: NULLs, unmatched keys, duplicates, ties, date gaps.

export interface Dataset {
  title: string;
  blurb: string;
  sql: string;
}

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const q = (v: unknown) => (v === null || v === undefined ? 'NULL' : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
const ins = (table: string, rows: unknown[][]) => rows.map((r) => `INSERT INTO ${table} VALUES (${r.map(q).join(', ')});`).join('\n');
const day = (base: string, add: number) => {
  const d = new Date(base + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + add);
  return d.toISOString().slice(0, 10);
};

// ---------------- toy tables for join visuals ----------------
const toy = `
CREATE TABLE students (id INTEGER PRIMARY KEY, name TEXT, club_id INTEGER);
CREATE TABLE clubs (id INTEGER PRIMARY KEY, club TEXT);
${ins('students', [[1, 'Ava', 10], [2, 'Ben', 20], [3, 'Cleo', 10], [4, 'Dev', null], [5, 'Eli', 40]])}
${ins('clubs', [[10, 'Chess'], [20, 'Robotics'], [30, 'Drama']])}
CREATE TABLE shirts (color TEXT);
CREATE TABLE sizes (size TEXT);
${ins('shirts', [['Red'], ['Blue']])}
${ins('sizes', [['S'], ['M'], ['L']])}
`;

// ---------------- shop (e-commerce, Amazon-style) ----------------
function shop() {
  const r = rng(101);
  const customers = [
    [1, 'Alice Chen', 'Seattle', '2023-01-15', null],
    [2, 'Bob Martin', 'Austin', '2023-02-03', 1],
    [3, 'Carla Diaz', 'Seattle', '2023-02-20', 1],
    [4, 'Dan Okafor', 'New York', '2023-03-11', null],
    [5, 'Eve Park', 'Austin', '2023-04-02', 2],
    [6, 'Farid Khan', 'Chicago', '2023-04-18', null],
    [7, 'Gina Rossi', 'New York', '2023-05-09', 4],
    [8, 'Hiro Tanaka', 'Seattle', '2023-06-21', 3],
    [9, 'Ines Silva', 'Chicago', '2023-07-30', null],
    [10, 'Jon Bell', 'Austin', '2023-08-12', 5],
  ];
  const products = [
    [1, 'Laptop Pro', 'Electronics', 1299.0],
    [2, 'Wireless Mouse', 'Electronics', 25.99],
    [3, 'USB-C Hub', 'Electronics', 49.5],
    [4, 'Desk Lamp', 'Home', 34.0],
    [5, 'Office Chair', 'Home', 189.0],
    [6, 'Coffee Beans', 'Grocery', 14.25],
    [7, 'Green Tea', 'Grocery', 8.75],
    [8, 'Noise-Cancel Headphones', 'Electronics', 249.0],
    [9, 'Standing Desk', 'Home', 499.0],
    [10, 'Water Bottle', 'Sports', 19.99],
    [11, 'Yoga Mat', 'Sports', 29.0],
    [12, 'Tennis Racket', 'Sports', 119.0], // never ordered
  ];
  const orders: unknown[][] = [];
  const items: unknown[][] = [];
  let oid = 1;
  for (let i = 0; i < 24; i++) {
    const cust = [1, 2, 3, 4, 5, 7, 8, 9, 10][Math.floor(r() * 9)]; // customer 6 never orders
    const date = day('2024-01-01', Math.floor(r() * 180));
    orders.push([oid, cust, date, i % 8 === 3 ? 'cancelled' : i % 8 === 6 ? 'returned' : i % 5 === 1 ? 'shipped' : 'delivered']);
    const n = 1 + Math.floor(r() * 3);
    const used = new Set<number>();
    for (let k = 0; k < n; k++) {
      let p = 1 + Math.floor(r() * 11);
      while (used.has(p)) p = 1 + ((p + 1) % 11);
      used.add(p);
      items.push([oid, p, 1 + Math.floor(r() * 3), products[p - 1][3]]);
    }
    oid++;
  }
  orders.sort((a, b) => String(a[2]).localeCompare(String(b[2])));
  return `
CREATE TABLE customers (id INTEGER PRIMARY KEY, name TEXT NOT NULL, city TEXT, signup_date TEXT, referred_by INTEGER REFERENCES customers(id));
CREATE TABLE products (id INTEGER PRIMARY KEY, name TEXT NOT NULL, category TEXT, price REAL);
CREATE TABLE orders (id INTEGER PRIMARY KEY, customer_id INTEGER REFERENCES customers(id), order_date TEXT, status TEXT);
CREATE TABLE order_items (order_id INTEGER REFERENCES orders(id), product_id INTEGER REFERENCES products(id), quantity INTEGER, unit_price REAL);
${ins('customers', customers)}
${ins('products', products)}
${ins('orders', orders)}
${ins('order_items', items)}
`;
}

// ---------------- hr (classic employees / managers) ----------------
const hr = `
CREATE TABLE departments (id INTEGER PRIMARY KEY, name TEXT, location TEXT);
CREATE TABLE employees (id INTEGER PRIMARY KEY, name TEXT, dept_id INTEGER REFERENCES departments(id), manager_id INTEGER REFERENCES employees(id), title TEXT, salary INTEGER, hire_date TEXT);
${ins('departments', [[1, 'Engineering', 'Mountain View'], [2, 'Data', 'Seattle'], [3, 'Sales', 'New York'], [4, 'Marketing', 'New York'], [5, 'Legal', 'Remote']])}
${ins('employees', [
  [1, 'Priya Shah', 1, null, 'VP Engineering', 310000, '2015-03-01'],
  [2, 'Marcus Lee', 1, 1, 'Staff Engineer', 240000, '2017-06-12'],
  [3, 'Sofia Alvarez', 1, 1, 'Senior Engineer', 205000, '2018-09-03'],
  [4, 'Tom Becker', 1, 2, 'Engineer', 165000, '2021-01-18'],
  [5, 'Yuki Mori', 1, 2, 'Engineer', 165000, '2021-07-05'],
  [6, 'Liam Walsh', 1, 3, 'Junior Engineer', 125000, '2023-02-27'],
  [7, 'Nadia Haddad', 2, 1, 'Head of Data', 230000, '2016-11-14'],
  [8, 'Omar Farouk', 2, 7, 'Senior Data Scientist', 195000, '2019-04-22'],
  [9, 'Grace Kim', 2, 7, 'Data Engineer', 172000, '2020-08-10'],
  [10, 'Ravi Patel', 2, 7, 'Data Analyst', 128000, '2022-05-16'],
  [11, 'Emma Novak', 2, 8, 'Data Analyst', 128000, '2022-10-03'],
  [12, 'Carlos Ruiz', 3, null, 'Sales Director', 210000, '2014-02-10'],
  [13, 'Hannah Ford', 3, 12, 'Account Exec', 140000, '2019-12-01'],
  [14, 'Kwame Mensah', 3, 12, 'Account Exec', 132000, '2020-03-23'],
  [15, 'Lucy Wright', 3, 12, 'Sales Associate', 95000, '2023-06-19'],
  [16, 'Ben Cohen', 4, 12, 'Marketing Lead', 150000, '2018-01-08'],
  [17, 'Aisha Bello', 4, 16, 'Content Strategist', 105000, '2021-09-27'],
  [18, 'Victor Hugo', null, 1, 'Contractor', 90000, '2024-01-15'],
])}
`;

// ---------------- social (Meta-style) ----------------
function social() {
  const r = rng(202);
  const users = [
    [1, 'ana', 'US', '2024-01-02'], [2, 'bilal', 'IN', '2024-01-05'], [3, 'chloe', 'FR', '2024-01-09'], [4, 'diego', 'MX', '2024-01-14'],
    [5, 'ema', 'US', '2024-02-01'], [6, 'felix', 'DE', '2024-02-11'], [7, 'gwen', 'US', '2024-02-20'], [8, 'hari', 'IN', '2024-03-03'],
    [9, 'iris', 'BR', '2024-03-15'], [10, 'jamal', 'US', '2024-03-28'],
  ];
  const follows: unknown[][] = [];
  const seen = new Set<string>();
  for (let i = 0; i < 26; i++) {
    const a = 1 + Math.floor(r() * 10), b = 1 + Math.floor(r() * 10);
    if (a === b || seen.has(a + '-' + b)) continue;
    seen.add(a + '-' + b);
    follows.push([a, b]);
  }
  const posts: unknown[][] = [];
  const types = ['photo', 'video', 'text', 'reel'];
  for (let i = 1; i <= 30; i++) posts.push([i, 1 + Math.floor(r() * 9), day('2024-03-01', Math.floor(r() * 30)), types[Math.floor(r() * 4)]]);
  const likes: unknown[][] = [];
  const ls = new Set<string>();
  for (let i = 0; i < 70; i++) {
    const u = 1 + Math.floor(r() * 10), p = 1 + Math.floor(r() * 30);
    if (ls.has(u + '-' + p)) continue;
    ls.add(u + '-' + p);
    likes.push([u, p, day('2024-03-01', Math.floor(r() * 31))]);
  }
  // logins with streaks and gaps (for consecutive-day / retention problems)
  const logins: unknown[][] = [];
  const pattern: Record<number, number[]> = {
    1: [0, 1, 2, 3, 4, 8, 9, 15],
    2: [0, 2, 4, 6],
    3: [1, 2, 3, 10, 11, 12, 13, 14],
    4: [0],
    5: [5, 6, 7, 20, 21],
    6: [3, 4],
    7: [0, 1, 2, 3, 4, 5, 6],
    8: [12],
    9: [2, 3, 9],
    10: [18, 19, 20, 22],
  };
  for (const [u, days] of Object.entries(pattern)) for (const d of days) logins.push([Number(u), day('2024-04-01', d)]);
  return `
CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT UNIQUE, country TEXT, joined TEXT);
CREATE TABLE follows (follower_id INTEGER REFERENCES users(id), followee_id INTEGER REFERENCES users(id));
CREATE TABLE posts (id INTEGER PRIMARY KEY, user_id INTEGER REFERENCES users(id), created_at TEXT, content_type TEXT);
CREATE TABLE likes (user_id INTEGER REFERENCES users(id), post_id INTEGER REFERENCES posts(id), liked_at TEXT);
CREATE TABLE logins (user_id INTEGER REFERENCES users(id), login_date TEXT);
${ins('users', users)}
${ins('follows', follows)}
${ins('posts', posts)}
${ins('likes', likes)}
${ins('logins', logins)}
`;
}

// ---------------- bank (the learner's world) ----------------
function bank() {
  const r = rng(303);
  const accounts = [
    [101, 'Acme Corp', 'Checking', '2022-04-01', 'NYC'],
    [102, 'Acme Corp', 'Savings', '2022-04-01', 'NYC'],
    [103, 'Blue Harbor LLC', 'Checking', '2023-01-10', 'BOS'],
    [104, 'Maria Lopez', 'Checking', '2021-07-19', 'MIA'],
    [105, 'Maria Lopez', 'Savings', '2021-07-19', 'MIA'],
    [106, 'Wei Zhang', 'Checking', '2023-09-02', 'SFO'],
    [107, 'Dormant Co', 'Checking', '2020-02-02', 'CHI'],
  ];
  const txns: unknown[][] = [];
  let id = 1;
  for (const acc of [101, 102, 103, 104, 105, 106]) {
    let d = 0;
    txns.push([id++, acc, day('2024-01-01', d), 5000 + Math.round(r() * 20) * 500, 'deposit']);
    for (let k = 0; k < 6; k++) {
      d += 3 + Math.floor(r() * 25);
      const dep = r() < 0.4;
      const amt = (dep ? 1 : -1) * (50 + Math.round(r() * 120) * 10);
      txns.push([id++, acc, day('2024-01-01', d), amt, dep ? 'deposit' : r() < 0.5 ? 'card' : 'wire']);
    }
  }
  txns.sort((a, b) => String(a[2]).localeCompare(String(b[2])) || (a[0] as number) - (b[0] as number));
  txns.forEach((t, i) => (t[0] = i + 1));
  return `
CREATE TABLE accounts (id INTEGER PRIMARY KEY, customer TEXT, type TEXT, opened TEXT, branch TEXT);
CREATE TABLE transactions (id INTEGER PRIMARY KEY, account_id INTEGER REFERENCES accounts(id), txn_date TEXT, amount INTEGER, kind TEXT);
${ins('accounts', accounts)}
${ins('transactions', txns)}
`;
}

// ---------------- rides (Uber/Lyft-style) ----------------
function rides() {
  const r = rng(404);
  const drivers = [[1, 'Sam', 'SF', 4.9], [2, 'Lena', 'SF', 4.7], [3, 'Raj', 'NYC', 4.8], [4, 'Mia', 'NYC', 4.5], [5, 'Kofi', 'LA', 4.95]];
  const riders = [[1, 'r_amy'], [2, 'r_ben'], [3, 'r_cy'], [4, 'r_dee'], [5, 'r_ed'], [6, 'r_fay']];
  const trips: unknown[][] = [];
  for (let i = 1; i <= 36; i++) {
    const drv = drivers[Math.floor(r() * 5)];
    const st = r() < 0.15 ? 'cancelled' : 'completed';
    const hour = String(6 + Math.floor(r() * 16)).padStart(2, '0');
    trips.push([i, 1 + Math.floor(r() * 6), drv[0], `${day('2024-05-01', Math.floor(r() * 14))} ${hour}:${String(Math.floor(r() * 60)).padStart(2, '0')}`, drv[2], st === 'cancelled' ? null : Math.round((8 + r() * 45) * 100) / 100, st, st === 'cancelled' ? null : 3 + Math.floor(r() * 3)]);
  }
  return `
CREATE TABLE drivers (id INTEGER PRIMARY KEY, name TEXT, city TEXT, avg_rating REAL);
CREATE TABLE riders (id INTEGER PRIMARY KEY, handle TEXT);
CREATE TABLE trips (id INTEGER PRIMARY KEY, rider_id INTEGER REFERENCES riders(id), driver_id INTEGER REFERENCES drivers(id), requested_at TEXT, city TEXT, fare REAL, status TEXT, rating INTEGER);
${ins('drivers', drivers)}
${ins('riders', riders)}
${ins('trips', trips)}
`;
}

// ---------------- streaming (Netflix-style) ----------------
function streaming() {
  const r = rng(505);
  const shows = [[1, 'Galaxy Quest', 'Sci-Fi', 2021], [2, 'Kitchen Wars', 'Reality', 2022], [3, 'Deep Waters', 'Documentary', 2020], [4, 'Night Shift', 'Drama', 2023], [5, 'Laugh Track', 'Comedy', 2019], [6, 'Code Breakers', 'Drama', 2024]];
  const subs = [[1, 'Basic', '2024-01-03', null], [2, 'Premium', '2024-01-10', null], [3, 'Standard', '2024-01-22', '2024-03-15'], [4, 'Basic', '2024-02-05', null], [5, 'Premium', '2024-02-14', '2024-02-28'], [6, 'Standard', '2024-03-01', null], [7, 'Basic', '2024-03-09', null]];
  const views: unknown[][] = [];
  for (let i = 1; i <= 45; i++) views.push([i, 1 + Math.floor(r() * 7), 1 + Math.floor(r() * 6), day('2024-03-01', Math.floor(r() * 31)), 5 + Math.floor(r() * 115)]);
  return `
CREATE TABLE shows (id INTEGER PRIMARY KEY, title TEXT, genre TEXT, release_year INTEGER);
CREATE TABLE subscriptions (user_id INTEGER PRIMARY KEY, plan TEXT, started TEXT, cancelled TEXT);
CREATE TABLE views (id INTEGER PRIMARY KEY, user_id INTEGER, show_id INTEGER REFERENCES shows(id), view_date TEXT, minutes INTEGER);
${ins('shows', shows)}
${ins('subscriptions', subs)}
${ins('views', views)}
`;
}

export const DATASETS: Record<string, Dataset> = {
  toy: { title: 'Toy tables', blurb: 'students/clubs and shirts/sizes — tiny tables for seeing joins clearly.', sql: toy },
  shop: { title: 'E-commerce', blurb: 'customers, products, orders, order_items (Amazon-style).', sql: shop() },
  hr: { title: 'Company HR', blurb: 'employees (with managers), departments — the classic interview schema.', sql: hr },
  social: { title: 'Social network', blurb: 'users, follows, posts, likes, logins (Meta-style).', sql: social() },
  bank: { title: 'Bank', blurb: 'accounts and transactions — running balances and monthly rollups.', sql: bank() },
  rides: { title: 'Ride sharing', blurb: 'drivers, riders, trips (Uber/Lyft-style).', sql: rides() },
  streaming: { title: 'Streaming', blurb: 'shows, subscriptions, views (Netflix-style).', sql: streaming() },
};
