import { ApiCategory, ApiTableLive, Dish } from '../types';

// Resolve API base URL dynamically or fallback to dev server
export function getApiBaseUrl(): string {
  const urlParams = new URLSearchParams(window.location.search);
  const paramUrl = urlParams.get('api_url');
  if (paramUrl) {
    return paramUrl.replace(/\/$/, '');
  }
  
  // If running on local server directly
  if (window.location.port === '8000') {
    return window.location.origin;
  }

  return 'http://localhost:8000';
}

/**
 * Fetch public menu from local_server (Bola)
 * Endpoint: GET /api/public/menu/
 */
export async function fetchPublicMenu(): Promise<Dish[] | null> {
  const baseUrl = getApiBaseUrl();
  try {
    const response = await fetch(`${baseUrl}/api/public/menu/`, {
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      console.warn(`[PublicMenu] Server returned ${response.status}`);
      return null;
    }

    const categories: ApiCategory[] = await response.json();
    const dishes: Dish[] = [];

    categories.forEach((cat) => {
      cat.products.forEach((prod) => {
        if (!prod.is_available) return;

        // Map product price to UZS number
        const priceNum = typeof prod.price === 'number' ? prod.price : parseFloat(prod.price || '0');

        // Resolve absolute image URL if relative
        let imageUrl = prod.image || 'https://lh3.googleusercontent.com/aida-public/AB6AXuAjBNg-KD66pIrve3Tt-SFnY3EyKxsO9X26Ey1lbLKjGhFaWTeck4DU_2OQWT-5heMdgWnWwPLtNMyWcBBICip4dBXAa0Wytjgk0hamHBclayor5Ig4155L0Axj_p_ZVbYDb1CMPadFSot1qyRfD4yq7wCl7KAU5EmCb_uxIoez0JAe-aEBXOxkyre7BCy1rM39hMeu0B36FYLHUoLqRhw-uE2PEWVUiBdhxjJRSD0s8C_3zcoad_saVo_DGXC3V0f1CNQaFdHHRFr8';
        if (imageUrl.startsWith('/')) {
          imageUrl = `${baseUrl}${imageUrl}`;
        }

        dishes.push({
          id: `product-${prod.id}`,
          name: prod.name,
          category: (cat.name as Dish['category']) || 'Plov',
          priceUZS: priceNum,
          description: prod.description || '',
          portion: '1 portion',
          prepTimeMinutes: prod.preparation_time || 20,
          calories: 550,
          proteinGrams: 28,
          carbsGrams: 65,
          image: imageUrl,
          ingredients: [
            { name: 'Fresh local ingredients', icon: 'skillet' }
          ],
          allergens: ['Halal Certified'],
        });
      });
    });

    return dishes;
  } catch (error) {
    console.warn('[PublicMenu] Could not connect to local_server API:', error);
    return null;
  }
}

/**
 * Fetch live table status & active order balance
 * Endpoint: GET /api/public/table/<qr_code>/
 */
export async function fetchTableLive(qrCode: string): Promise<ApiTableLive | null> {
  const baseUrl = getApiBaseUrl();
  try {
    const response = await fetch(`${baseUrl}/api/public/table/${encodeURIComponent(qrCode)}/`, {
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      return null;
    }

    return await response.json();
  } catch (error) {
    console.warn('[TableLive] Could not fetch live table data:', error);
    return null;
  }
}

/**
 * Trigger waiter call on staff devices via WebSocket + Notification
 * Endpoint: POST /api/public/table/<qr_code>/call-waiter/
 */
export async function callWaiterApi(qrCode: string, reason: string): Promise<{ status: string; message?: string } | null> {
  const baseUrl = getApiBaseUrl();
  try {
    const response = await fetch(`${baseUrl}/api/public/table/${encodeURIComponent(qrCode)}/call-waiter/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({ reason }),
    });

    if (!response.ok) {
      return null;
    }

    return await response.json();
  } catch (error) {
    console.warn('[CallWaiter] Could not send call waiter alert:', error);
    return null;
  }
}
