// API client and precision string-based money/quantity formatters
// Never use raw floating-point operations for display formatting

/**
 * Rounds to 4 decimal places with epsilon correction.
 */
export function round4(val) {
  if (val === null || val === undefined || isNaN(val)) return 0;
  return Math.round((Number(val) + Number.EPSILON) * 10000) / 10000;
}

/**
 * Formats money with strictly two decimal places and commas using integer/string segments.
 * Avoids floating-point formatting artifacts.
 * 
 * @param {number|string} val - Amount to format
 * @param {string} [currencySymbol='$'] - Optional currency symbol
 * @returns {string} - e.g. "$4,950.00"
 */
export function formatMoney(val, currencySymbol = '$') {
  if (val === null || val === undefined || val === '') return '—';
  const num = Number(val);
  if (isNaN(num)) return '—';

  const isNeg = num < 0;
  const absNum = Math.abs(num);
  // Split into integer and 2-decimal fractional part
  const fixed = absNum.toFixed(2);
  const [intPart, decPart] = fixed.split('.');
  const withCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const formatted = `${withCommas}.${decPart}`;

  if (isNeg) {
    return `-${currencySymbol}${formatted}`;
  }
  return `${currencySymbol}${formatted}`;
}

/**
 * Formats quantity with up to 4 decimals, removing trailing zeroes.
 * 
 * @param {number|string} val - Quantity to format
 * @returns {string} - e.g. "90.00" or "12.3456"
 */
export function formatQty(val) {
  if (val === null || val === undefined || val === '') return '—';
  const num = Number(val);
  if (isNaN(num)) return '—';

  const isNeg = num < 0;
  const absNum = Math.abs(num);
  const fixed = absNum.toFixed(4);
  const [intPart, decPart] = fixed.split('.');
  const withCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  
  // Keep 2 decimals minimum, up to 4 if non-zero
  let trimmedDec = decPart;
  if (trimmedDec.endsWith('00')) {
    trimmedDec = trimmedDec.slice(0, 2);
  } else if (trimmedDec.endsWith('0')) {
    trimmedDec = trimmedDec.slice(0, 3);
  }

  const res = `${withCommas}.${trimmedDec}`;
  return isNeg ? `-${res}` : res;
}

/**
 * Formats dates into human-readable ledger style (e.g. "15-Jan-2026").
 */
export function formatLedgerDate(dateStr) {
  if (!dateStr) return '—';
  const str = String(dateStr).slice(0, 10);
  const [year, month, day] = str.split('-');
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthIdx = parseInt(month, 10) - 1;
  if (monthIdx >= 0 && monthIdx < 12) {
    return `${day}-${monthNames[monthIdx]}-${year}`;
  }
  return str;
}

// Base HTTP request helper
async function request(endpoint, options = {}) {
  const url = endpoint.startsWith('/') ? `/api${endpoint}` : `/api/${endpoint}`;
  const config = {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  };

  try {
    const res = await fetch(url, config);
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const errorMsg = data.message || data.error || `Server returned error status ${res.status}`;
      const err = new Error(errorMsg);
      err.status = res.status;
      err.data = data;
      throw err;
    }

    return data;
  } catch (err) {
    if (!err.status) {
      err.message = `Network connectivity error: ${err.message}`;
    }
    throw err;
  }
}

// API Methods
export const api = {
  // Items
  getItems: () => request('/items'),
  createItem: (item) => request('/items', { method: 'POST', body: JSON.stringify(item) }),

  // Movements
  getMovements: (params = {}) => {
    const search = new URLSearchParams();
    if (params.item_id) search.append('item_id', params.item_id);
    if (params.from) search.append('from', params.from);
    if (params.to) search.append('to', params.to);
    const query = search.toString();
    return request(`/movements${query ? `?${query}` : ''}`);
  },
  createMovement: (movement) => request('/movements', { method: 'POST', body: JSON.stringify(movement) }),

  // Reports
  getValuation: (asOf) => request(`/reports/valuation?asOf=${encodeURIComponent(asOf)}`),
  getCogs: (from, to) => request(`/reports/cogs?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),

  // Expiry
  writeoffExpiry: (asOf) => request(`/expiry/writeoff?asOf=${encodeURIComponent(asOf)}`, { method: 'POST' }),
};

