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
    const priceBoxes = prices.map((price) => price.getBBox());
    const content = item.querySelector('.table-item-content');
    const clipRef = content?.getAttribute('clip-path')?.match(/#([^)]*)/)?.[1];
    const clipRect = clipRef ? document.getElementById(clipRef)?.querySelector('rect') : null;
    const clipRight = clipRect
      ? Number(clipRect.getAttribute('x')) + Number(clipRect.getAttribute('width'))
      : null;
    const firstPriceLeft = priceBoxes.length ? Math.min(...priceBoxes.map((priceBox) => priceBox.x)) : null;
    return {
      tone:item.classList.contains('tone-accent') ? 'accent' : 'light',
      nameFill:name?.getAttribute('fill') || '',
      metaFill:meta?.getAttribute('fill') || '',
      priceFills:prices.map((price) => price.getAttribute('fill') || ''),
      clippedContent:Boolean(clipRect),
      overlapsPrice:clipRight === null || firstPriceLeft === null || clipRight >= firstPriceLeft - 1
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
    name:`ЧЕШСКИЙ КАБАНЧИК, ПШЕНИЧНОЕ ОСОБОЕ СВЕТЛОЕ ${suffix}`,
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
    { id:`section-${suffix}`, kind:'section', name:'ПИВО СВЕТЛОЕ НЕФИЛЬТРОВАННОЕ ОСОБОЕ', enabled:true },
    { id:`item-a-${suffix}`, kind:'item', product_id:product.id, enabled:true },
    { id:`item-b-${suffix}`, kind:'item', product_id:product.id, enabled:true }
  ];

  await saveStyle(page, screen, rows, 'readable');
  await page.goto(`/scene?screen=${screen.id}`);
  const svg = page.locator('#scene-editor-stage svg.menu-table-svg');
  await expect(svg.locator('.table-item')).toHaveCount(2);
  await expect(svg).not.toContainText('Хабаровский край');
  await expect(svg).toContainText('Пивоварня · светлое, фильтрованное');
  await expect(svg.locator('.item-strength').first()).toHaveText(' · 4,5%');

  const readable = await rowVisuals(page);
  expect(readable.map((row) => row.tone)).toEqual(['light', 'accent']);
  expect(readable.every((row) => row.priceFills.length === 1 && row.priceFills.every((fill) => fill === row.nameFill))).toBe(true);
  expect(readable.every((row) => row.clippedContent)).toBe(true);
  expect(readable.some((row) => row.overlapsPrice)).toBe(false);

  const headerGeometry = await svg.locator('.table-section').first().evaluate((section) => {
    const title = section.querySelector('.section-title');
    const titleZone = section.querySelector('.section-title-zone');
    const labels = [...section.querySelectorAll('.price-label')];
    const clipRef = titleZone?.getAttribute('clip-path')?.match(/#([^)]*)/)?.[1];
    const clipRect = clipRef ? document.getElementById(clipRef)?.querySelector('rect') : null;
    const clipRight = clipRect ? Number(clipRect.getAttribute('x')) + Number(clipRect.getAttribute('width')) : Infinity;
    const firstPriceLeft = labels.length ? Math.min(...labels.map((label) => label.getBBox().x)) : Infinity;
    return {
      protected:clipRight < firstPriceLeft,
      titleSize:Number(title?.getAttribute('font-size') || 0),
      labelSizes:labels.map((label) => Number(label.getAttribute('font-size') || 0))
    };
  });
  expect(headerGeometry.protected).toBe(true);
  expect(headerGeometry.titleSize).toBeGreaterThan(30);
  expect(headerGeometry.labelSizes).toHaveLength(1);
  expect(headerGeometry.labelSizes.every((size) => size > 24)).toBe(true);

  const inlineStrength = await svg.locator('.item-name').first().evaluate((name) => {
    const strength = name.querySelector('.item-strength');
    return {
      nameSize:Number.parseFloat(getComputedStyle(name).fontSize),
      strengthSize:Number.parseFloat(getComputedStyle(strength).fontSize)
    };
  });
  expect(inlineStrength.strengthSize).toBeCloseTo(inlineStrength.nameSize, 3);

  await saveStyle(page, screen, rows, 'legacy');
  await page.reload();
  await expect(svg.locator('.table-item')).toHaveCount(2);
  const classic = await rowVisuals(page);

  expect(readable.map(({ tone, nameFill, metaFill, priceFills }) => ({ tone, nameFill, metaFill, priceFill:priceFills[0] })))
    .toEqual(classic.map(({ tone, nameFill, metaFill, priceFills }) => ({ tone, nameFill, metaFill, priceFill:priceFills[0] })));
});


test('A→Я sorts a logical section across both visual columns after transferring a product', async ({ page }) => {
  await page.setViewportSize({ width:1600, height:900 });
  await login(page);
  const suffix = `sort-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const locationResult = await page.request.post('/api/locations', {
    data:{ name:`Sort ${suffix}`, address:'Browser CI' }
  });
  expect(locationResult.status()).toBe(201);
  const location = await locationResult.json();
  const productIds = [];
  for (const name of ['Янтарное','Ячменное','Альфа','Бавария','Арфа']) {
    const result = await page.request.post('/api/catalog/products', {
      data:{ name:`${name} ${suffix}`, producer:'Пивоварня', strength:'4,5%', price_primary:'200',
        alcoholic:true, beverage_color:'light', filtration:'filtered', active:true }
    });
    expect(result.status()).toBe(201);
    productIds.push((await result.json()).id);
  }
  const screenResult = await page.request.post(`/api/locations/${location.id}/screens`, { data:{} });
  expect(screenResult.status()).toBe(201);
  const screen = await screenResult.json();
  const ids = {
    section:`sort-section-${suffix}`,
    lz:`sort-left-z-${suffix}`,
    rz:`sort-right-z-${suffix}`,
    la:`sort-left-a-${suffix}`,
    rb:`sort-right-b-${suffix}`,
    ra:`sort-right-a-${suffix}`
  };
  await saveStyle(page, screen, [
    { id:ids.section, kind:'section', name:'Пиво', column:'full', enabled:true },
    { id:ids.lz, kind:'item', product_id:productIds[0], column:'left', enabled:true },
    { id:ids.rz, kind:'item', product_id:productIds[1], column:'right', enabled:true },
    { id:ids.la, kind:'item', product_id:productIds[2], column:'left', enabled:true },
    { id:ids.rb, kind:'item', product_id:productIds[3], column:'right', enabled:true },
    { id:ids.ra, kind:'item', product_id:productIds[4], column:'right', enabled:true }
  ], 'readable');

  await page.goto(`/scene?screen=${screen.id}`);
  await page.locator('#scene-editor-table-layer').click();
  await page.getByRole('button', { name:'Редактировать содержимое', exact:true }).click();
  const modal = page.locator('#scene-editor-table-edit-layer');
  const row = (id) => modal.locator(`.scene-table-editor-row[data-source-row-ids="${id}"]`);
  await expect(row(ids.la)).toHaveAttribute('data-column', '0');
  await row(ids.la).locator('.scene-table-editor-placement-button[data-column="right"]').click();
  await expect(row(ids.la)).toHaveAttribute('data-column', '1');

  await row(ids.section).getByRole('button', { name:'Сортировать раздел по алфавиту' }).click();
  const order = async (column) => modal.locator(`.scene-table-editor-row[data-column="${column}"]`)
    .evaluateAll((nodes) => nodes.map((node) => node.dataset.sourceRowIds));
  expect(await order('0')).toEqual([ids.la]);
  expect(await order('1')).toEqual([ids.ra, ids.rb, ids.lz, ids.rz]);

  const preview = await page.locator('#scene-editor-stage svg.menu-table-svg .table-item').evaluateAll((nodes) => {
    const records = nodes.map((node) => {
      const name = node.querySelector('.item-name');
      return {
        text:name?.textContent || '',
        x:Number(name?.getAttribute('x') || 0),
        y:Number(name?.getAttribute('y') || 0),
        tone:node.classList.contains('tone-accent') ? 'accent' : 'light'
      };
    });
    return {
      left:records.filter((entry) => entry.x < 600).sort((a,b) => a.y - b.y),
      right:records.filter((entry) => entry.x >= 600).sort((a,b) => a.y - b.y)
    };
  });
  expect(preview.left.map((entry) => entry.text.split(' ')[0])).toEqual(['Альфа']);
  expect(preview.left.map((entry) => entry.tone)).toEqual(['light']);
  expect(preview.right.map((entry) => entry.text.split(' ')[0]))
    .toEqual(['Арфа','Бавария','Янтарное','Ячменное']);
  expect(preview.right.map((entry) => entry.tone))
    .toEqual(['light','accent','light','accent']);
});


test('moving a product across visual columns does not change its logical section', async ({ page }) => {
  await page.setViewportSize({ width:1600, height:900 });
  await login(page);
  const suffix = `transfer-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const locationResult = await page.request.post('/api/locations', {
    data:{ name:`Transfer ${suffix}`, address:'Browser CI' }
  });
  expect(locationResult.status()).toBe(201);
  const location = await locationResult.json();
  const productIds = [];
  for (const name of ['Янтарное','Алтунин','Бавария']) {
    const result = await page.request.post('/api/catalog/products', {
      data:{ name:`${name} ${suffix}`, producer:'Пивоварня', characteristics:'',
        strength:'4,5%', price_primary:'200',
        alcoholic:true, beverage_color:'light', filtration:'filtered', active:true }
    });
    expect(result.status()).toBe(201);
    productIds.push((await result.json()).id);
  }
  const screenResult = await page.request.post(`/api/locations/${location.id}/screens`, { data:{} });
  expect(screenResult.status()).toBe(201);
  const screen = await screenResult.json();
  const ids = {
    left:`left-heading-${suffix}`,
    right:`right-heading-${suffix}`,
    moving:`transfer-moving-${suffix}`,
    stable:`transfer-stable-${suffix}`,
    destination:`transfer-destination-${suffix}`
  };
  await saveStyle(page, screen, [
    { id:ids.left, kind:'section', name:'Левая', column:'left', enabled:true },
    { id:ids.moving, kind:'item', product_id:productIds[0], column:'left', enabled:true },
    { id:ids.stable, kind:'item', product_id:productIds[1], column:'left', enabled:true },
    { id:ids.right, kind:'section', name:'Правая', column:'right', enabled:true },
    { id:ids.destination, kind:'item', product_id:productIds[2], column:'right', enabled:true }
  ], 'readable');
  await page.goto(`/scene?screen=${screen.id}`);
  await page.locator('#scene-editor-table-layer').click();
  await page.getByRole('button', { name:'Редактировать содержимое', exact:true }).click();
  const modal = page.locator('#scene-editor-table-edit-layer');
  const row = (id) => modal.locator(`.scene-table-editor-row[data-source-row-ids="${id}"]`);
  await row(ids.moving).locator('.scene-table-editor-placement-button[data-column="right"]').click();
  await expect(row(ids.moving)).toHaveAttribute('data-column', '1');
  const following = await modal.locator('.scene-table-editor-row').evaluateAll((nodes) =>
    nodes.map((node) => node.dataset.sourceRowIds));
  expect(following).toEqual([ids.left,ids.moving,ids.stable,ids.right,ids.destination]);

  await row(ids.right).getByRole('button', { name:'Сортировать раздел по алфавиту' }).click();
  const rightOrder = await modal.locator('.scene-table-editor-row.is-item[data-column="1"]').evaluateAll((nodes) =>
    nodes.map((node) => node.dataset.sourceRowIds));
  expect(rightOrder).toEqual([ids.moving,ids.destination],
    'right section sort must not absorb a product from the preceding logical section');
  await row(ids.left).getByRole('button', { name:'Сортировать раздел по алфавиту' }).click();
  expect(await modal.locator('.scene-table-editor-row').evaluateAll((nodes) =>
    nodes.map((node) => node.dataset.sourceRowIds)))
    .toEqual([ids.left,ids.moving,ids.stable,ids.right,ids.destination]);
  await row(ids.left).locator('.scene-table-editor-placement-button[data-column="right"]').click();
  expect(await modal.locator('.scene-table-editor-row').evaluateAll((nodes) =>
    nodes.map((node) => node.dataset.sourceRowIds)))
    .toEqual([ids.left,ids.moving,ids.stable,ids.right,ids.destination],
      'moving a section title does not reparent its products');
  const rightTones = await page.locator('#scene-editor-stage svg.menu-table-svg .table-item').evaluateAll((nodes) =>
    nodes.map((node) => ({
      x:Number(node.querySelector('.item-name')?.getAttribute('x') || 0),
      y:Number(node.querySelector('.item-name')?.getAttribute('y') || 0),
      tone:node.classList.contains('tone-accent') ? 'accent' : 'light'
    })).filter((entry) => entry.x > 600).sort((a,b) => a.y - b.y).map((entry) => entry.tone));
  expect(rightTones).toEqual(['light','light'], 'each logical section restarts the visual tone alternation');
});
