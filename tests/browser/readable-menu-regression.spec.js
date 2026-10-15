import { test, expect } from '@playwright/test';

async function login(page) {
  await page.goto('/signin');
  await page.getByLabel('Логин').fill('admin');
  await page.getByLabel('Пароль').fill(process.env.E2E_ADMIN_PASSWORD || 'Browser-CI-Password1!');
  await Promise.all([
    page.waitForURL((url) => url.pathname === '/'),
    page.getByRole('button', { name:/войти/i }).click()
  ]);
}

async function saveStyle(page, screen, rows, tableStyle) {
  const editor = await (await page.request.get(`/api/screens/${screen.id}/editor`)).json();
  const response = await page.request.put(`/api/screens/${screen.id}/draft`, { data:{
    revision:editor.draft.revision,
    rows,
    settings:{
      ...editor.draft.settings,
      table_style:tableStyle,
      background_color:'#101828',
      accent_color:'#F6C90E',
      text_color:'#F8FAFC',
      font_scale_percent:100,
      font_family:'arial-narrow',
      table_x:56,
      table_y:15,
      table_width_px:1374,
      table_height_px:925
    },
    screen:{
      location_id:screen.location_id,
      name:screen.name,
      resolution:'1920×1080',
      status:'draft',
      active:true
    }
  } });
  expect(response.status()).toBe(200);
}

async function rowVisuals(page) {
  return page.locator('#scene-editor-stage svg.menu-table-svg .table-item').evaluateAll((items) => items.map((item) => {
    const name = item.querySelector('.item-name');
    const meta = item.querySelector('.item-meta');
    const prices = [...item.querySelectorAll('.table-item-prices .price')];
    const nameBox = name?.getBBox();
    const metaBox = meta?.getBBox();
    const priceBoxes = prices.map((price) => price.getBBox());
    return {
      tone:item.classList.contains('tone-accent') ? 'accent' : 'light',
      nameFill:name?.getAttribute('fill') || '',
      metaFill:meta?.getAttribute('fill') || '',
      priceFills:prices.map((price) => price.getAttribute('fill') || ''),
      overlapsPrice:Boolean(priceBoxes.length && [nameBox, metaBox].filter(Boolean).some((box) =>
        box.x + box.width > Math.min(...priceBoxes.map((priceBox) => priceBox.x)) - 1))
    };
  }));
}

test('readable table reuses classic row colors, protects price columns and hides address metadata', async ({ page }) => {
  await page.setViewportSize({ width:1600, height:900 });
  await login(page);
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const locationResponse = await page.request.post('/api/locations', { data:{ name:`Readable ${suffix}`, address:'Browser CI' } });
  expect(locationResponse.status()).toBe(201);
  const location = await locationResponse.json();
  const productResponse = await page.request.post('/api/catalog/products', { data:{
    name:`ДЛИННОЕ НАЗВАНИЕ ТОВАРА ${suffix}`,
    producer:'Пивоварня',
    address:'Хабаровский край, Комсомольск-на-Амуре',
    characteristics:'светлое, фильтрованное',
    strength:'4,5%',
    price_primary:'268',
    alcoholic:true,
    beverage_color:'light',
    filtration:'filtered',
    active:true
  } });
  expect(productResponse.status()).toBe(201);
  const product = await productResponse.json();
  const screenResponse = await page.request.post(`/api/locations/${location.id}/screens`, { data:{} });
  expect(screenResponse.status()).toBe(201);
  const screen = await screenResponse.json();
  const rows = [
    { id:`section-${suffix}`, kind:'section', name:'ПИВО СВЕТЛОЕ ФИЛЬТРОВАННОЕ', enabled:true },
    { id:`item-a-${suffix}`, kind:'item', product_id:product.id, enabled:true },
    { id:`item-b-${suffix}`, kind:'item', product_id:product.id, enabled:true }
  ];

  await saveStyle(page, screen, rows, 'readable');
  await page.goto(`/scene?screen=${screen.id}`);
  const svg = page.locator('#scene-editor-stage svg.menu-table-svg');
  await expect(svg.locator('.table-item')).toHaveCount(2);
  await expect(svg).not.toContainText('Хабаровский край');
  await expect(svg).toContainText('Пивоварня · 4,5% · светлое, фильтрованное');

  const readable = await rowVisuals(page);
  expect(readable.map((row) => row.tone)).toEqual(['light', 'accent']);
  expect(readable.every((row) => row.priceFills.length === 2 && row.priceFills.every((fill) => fill === row.nameFill))).toBe(true);
  expect(readable.some((row) => row.overlapsPrice)).toBe(false);

  await saveStyle(page, screen, rows, 'legacy');
  await page.reload();
  await expect(svg.locator('.table-item')).toHaveCount(2);
  const classic = await rowVisuals(page);

  expect(readable.map(({ tone, nameFill, metaFill, priceFills }) => ({ tone, nameFill, metaFill, priceFills })))
    .toEqual(classic.map(({ tone, nameFill, metaFill, priceFills }) => ({ tone, nameFill, metaFill, priceFills })));
});
