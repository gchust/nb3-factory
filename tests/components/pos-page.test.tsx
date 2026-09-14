import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import PosPage from '@/pages/pos';

const products = [
  {
    id: 1,
    name: 'Cola',
    barcode: 'B-1',
    category: 'food',
    price: 10.5,
    stock: 5,
    status: 'on_sale',
    images: [],
    createdAt: '2026-09-14T00:00:00.000Z',
    updatedAt: '2026-09-14T00:00:00.000Z',
  },
  {
    id: 2,
    name: 'Tea',
    barcode: 'B-2',
    category: 'food',
    price: 3.25,
    stock: 5,
    status: 'on_sale',
    images: [],
    createdAt: '2026-09-14T00:00:00.000Z',
    updatedAt: '2026-09-14T00:00:00.000Z',
  },
];

const listProducts = vi.fn(async () => products);
const createOrder = vi.fn(async () => ({
  id: 7,
  orderNumber: 'SO-TEST',
  originalAmount: 21,
  discountAmount: 0,
  payableAmount: 21,
}));

vi.mock('@/lib/retail-api', () => ({
  useRetailApi: () => ({
    access: vi.fn(),
    listProducts,
    listManagedProducts: vi.fn(),
    createProduct: vi.fn(),
    updateProduct: vi.fn(),
    listOrders: vi.fn(),
    createOrder,
    returnOrder: vi.fn(),
    listPurchases: vi.fn(),
    createPurchase: vi.fn(),
    dailyReport: vi.fn(),
  }),
  readRetailError: () => ({}),
  retailErrorKey: () => 'retail.errors.generic',
}));

describe('POS page', () => {
  beforeEach(() => {
    listProducts.mockClear();
    createOrder.mockClear();
  });

  it('adds products to the cart and checks out with the quantities entered', async () => {
    const user = userEvent.setup();
    render(<PosPage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Cola/ })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /Cola/ }));
    await user.click(screen.getByRole('button', { name: /Cola/ }));
    await user.click(screen.getByRole('button', { name: /Tea/ }));

    // 10.5 * 2 + 3.25 = 24.25; the line subtotal and the payable total both show it.
    expect(screen.getAllByText('24.25').length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: 'Check out' }));

    await waitFor(() => {
      expect(createOrder).toHaveBeenCalledTimes(1);
    });
    expect(createOrder).toHaveBeenCalledWith({
      paymentMethod: 'cash',
      discountPercent: 0,
      items: [
        { productId: 1, quantity: 2 },
        { productId: 2, quantity: 1 },
      ],
    });
  });
});
