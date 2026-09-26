import { test, expect } from '@playwright/test';

async function login(page) {
  await page.goto('/signin');
  await page.getByLabel('Логин').fill('admin');
  await page.getByLabel('Пароль').fill(process.env.E2E_ADMIN_PASSWORD || 'Browser-CI-Password1!');
  await Promise.all([
    page.waitForURL((url) => url.pathname === '/'),
    page.getByRole('button', { name: /войти/i }).click()
  ]);
}

async function fixture(page) {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const locationResponse = await page.request.post('/api/locations', { data:{ name:`Scene ${suffix}`, address:'Visual CI' } });
  expect(locationResponse.status()).toBe(201);
  const location = await locationResponse.json();

  const productResponse = await page.request.post('/api/catalog/products', { data:{
    name:`Scene product ${suffix}`, producer:'MIRA', characteristics:'', strength:'', price_primary:'250',
    alcoholic:false, beverage_color:'none', filtration:'none', active:true
  } });
  expect(productResponse.status()).toBe(201);
  const product = await productResponse.json();

  const screenResponse = await page.request.post(`/api/locations/${location.id}/screens`, { data:{} });
  expect(screenResponse.status()).toBe(201);
  const screen = await screenResponse.json();
  const editor = await (await page.request.get(`/api/screens/${screen.id}/editor`)).json();
  const saved = await page.request.put(`/api/screens/${screen.id}/draft`, { data:{
    revision:editor.draft.revision,
    rows:[
      { id:`scene-section-${suffix}`, kind:'section', name:'СЦЕНА', enabled:true },
      { id:`scene-item-${suffix}`, kind:'item', product_id:product.id, enabled:true }
    ],
    settings:{ background_color:'#101828', accent_color:'#F4C915', text_color:'#F8FAFC' },
    screen:{ location_id:screen.location_id, name:screen.name, resolution:'1920×1080', status:'draft', active:true }
  } });
  expect(saved.ok()).toBeTruthy();
  return { screen, product, location };
}

test('Scene editor keeps layers, shared Player preview and contextual properties on one desktop page', async ({ page }) => {
  await page.setViewportSize({ width:1600, height:900 });
  await login(page);
  const { screen, product } = await fixture(page);
  await page.goto(`/scene?screen=${screen.id}`);

  await expect(page.locator('#scene-editor-layers')).toBeVisible();
  await expect(page.locator('#scene-editor-stage')).toBeVisible();
  await expect(page.locator('#scene-editor-properties')).toBeVisible();
  await expect(page.locator('#scene-editor-screen')).toHaveValue(String(screen.id));
  await expect(page.locator('#scene-editor-resolution')).toHaveText('1920×1080');
  const backgroundLayer = page.locator('#scene-editor-background-layer');
  const promotionLayer = page.locator('#scene-editor-promotion-layer');
  const promotionRowLayer = page.locator('#scene-editor-promotion-row-layer');
  const animationLayer = page.locator('#scene-editor-animation-layer');
  const tableLayer = page.locator('#scene-editor-table-layer');
  for (const layer of [backgroundLayer, promotionLayer, promotionRowLayer, animationLayer, tableLayer]) {
    await expect(layer).toBeVisible();
    await expect(layer.locator('svg')).toHaveCount(1);
    expect((await layer.boundingBox())?.height).toBeLessThanOrEqual(28);
  }
  await expect(page.locator('#scene-editor-properties-title')).toHaveText('Элемент не выбран');
  const inspectorWidth1600 = (await page.locator('.scene-editor-properties-panel').boundingBox())?.width || 0;
  expect(inspectorWidth1600).toBeGreaterThanOrEqual(296);
  expect(inspectorWidth1600).toBeLessThanOrEqual(312);
  const previewWidth1600 = (await page.locator('#scene-editor-stage-shell').boundingBox())?.width || 0;
  expect(previewWidth1600).toBeGreaterThan(650);
  await page.setViewportSize({ width:1920, height:1080 });
  const inspectorWidth1920 = (await page.locator('.scene-editor-properties-panel').boundingBox())?.width || 0;
  expect(inspectorWidth1920).toBeGreaterThanOrEqual(296);
  expect(inspectorWidth1920).toBeLessThanOrEqual(312);
  await page.setViewportSize({ width:1600, height:900 });
  await expect(page.locator('#scene-editor-table-edit-layer')).toBeHidden();
  await expect(page.locator('#scene-editor-undo')).toBeDisabled();
  await expect(page.locator('#scene-editor-redo')).toBeDisabled();

  await page.locator('#scene-editor-table-layer').click();
  await expect(page.locator('#scene-editor-properties-title')).toHaveText('Таблица меню');
  await expect(page.locator('#scene-editor-table-edit-layer')).toBeVisible();
  const tableEditorPanel = page.locator('#scene-editor-table-edit-layer .scene-table-editor-dialog');
  await expect(tableEditorPanel).toBeVisible();
  await expect(page.locator('#scene-editor-table-edit-layer .scene-table-editor-row')).toHaveCount(2);
  await expect(page.locator('#scene-editor-table-edit-layer [data-editor-preview-row-control]')).toHaveCount(0);
  const tableProductSelect = page.locator('#scene-editor-table-edit-layer [data-preview-product-select]').first();
  await expect(tableProductSelect).toBeVisible();
  await expect(tableProductSelect).toHaveAttribute('role', 'combobox');
  expect(parseFloat(await tableProductSelect.evaluate((node) => getComputedStyle(node).fontSize))).toBeGreaterThanOrEqual(11);
  const compactRowHeight = (await page.locator('#scene-editor-table-edit-layer .scene-table-editor-row').first().boundingBox())?.height || 0;
  expect(compactRowHeight).toBeGreaterThanOrEqual(24);
  expect(compactRowHeight).toBeLessThanOrEqual(26);
  expect(await page.locator('#scene-editor-table-edit-layer .scene-table-editor-scroll').evaluate((node) => getComputedStyle(node).rowGap)).toBe('0px');
  expect(await tableEditorPanel.evaluate((node) => getComputedStyle(node).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)');
  await expect(page.locator('#scene-editor-table-edit-layer select[data-preview-product-select]')).toHaveCount(0);
  await tableProductSelect.click();
  await expect(page.locator('#scene-editor-table-edit-layer .editor-preview-choice-popup')).toBeVisible();
  const productSearch = page.locator('#scene-editor-table-edit-layer .editor-preview-choice-search');
  await expect(productSearch).toBeFocused();
  await productSearch.fill(product.name);
  await expect(page.locator('#scene-editor-table-edit-layer [role="option"]')).toHaveCount(1);
  await expect(page.locator('#scene-editor-table-edit-layer [role="option"]').first()).toContainText(product.name);
  await productSearch.press('Escape');
  await expect(page.locator('#scene-editor-table-edit-layer .editor-preview-choice-popup')).toBeHidden();

  const promotionEditor = page.locator('#scene-editor-table-edit-layer .scene-table-editor-side .editor-preview-promotion-editor');
  await expect(promotionEditor).toBeVisible();
  await promotionEditor.locator('input[type="checkbox"]').check();
  await expect(promotionEditor.getByRole('radiogroup')).toHaveCount(0);
  await expect(page.locator('#scene-editor-stage .promotion-row-glow')).toHaveAttribute('data-promotion-row-animation', 'wave');
  await expect(page.locator('#scene-editor-stage .promotion-badge-glow')).toHaveAttribute('data-promotion-badge-animation', 'shine');
  await expect(page.locator('#scene-editor-stage')).toHaveAttribute('data-player-active', 'true');
  const promotionVisual = await page.locator('#scene-editor-stage .promotion-badge').first().evaluate((node) => {
    const row = node.closest('.table-item');
    const text = row?.querySelector('.promotion-badge-label .promotion');
    const path = node.querySelector('path');
    const glowStops = [...node.ownerSVGElement.querySelectorAll('#mira-promo-row-glow stop')];
    const itemName = row?.querySelector('.item-name');
    return {
      textSize:Number(text?.getAttribute('font-size') || 0),
      textWeight:Number(text?.getAttribute('font-weight') || 0),
      textTransform:text?.getAttribute('transform') || '',
      baselineDelta:Math.abs(Number(text?.getAttribute('y') || 0) - Number(itemName?.getAttribute('y') || 0)),
      badgeHeight:path?.getBBox?.().height || 0,
      badgeFill:path?.getAttribute('fill') || '',
      maxGlowOpacity:Math.max(0, ...glowStops.map((stop) => Number(stop.getAttribute('stop-opacity') || 0)))
    };
  });
  expect(promotionVisual.textSize).toBeGreaterThanOrEqual(15);
  expect(promotionVisual.textWeight).toBeGreaterThanOrEqual(900);
  expect(promotionVisual.textTransform).toContain('scale(1 1.12)');
  expect(promotionVisual.baselineDelta).toBeLessThan(.1);
  expect(promotionVisual.badgeHeight).toBeGreaterThanOrEqual(29);
  expect(promotionVisual.badgeFill).toContain('mira-promo-badge-depth');
  expect(promotionVisual.maxGlowOpacity).toBeGreaterThanOrEqual(.7);

  await page.locator('.scene-table-editor-close').click();
  await expect(page.locator('#scene-editor-table-edit-layer')).toBeHidden();

  const priceSize = page.locator('#scene-editor-properties').getByLabel('Кегль цен');
  await expect(priceSize).toHaveValue('27');
  await priceSize.fill('34');
  await expect.poll(() => page.locator('#scene-editor-stage .price').first().evaluate((node) =>
    Number(node.getAttribute('font-size'))
  )).toBeCloseTo(35.7, 1);

  await promotionRowLayer.click();
  await expect(page.locator('#scene-editor-properties-title')).toHaveText('Акционная строка');
  const rowInspector = page.locator('#scene-editor-properties');
  const rowEffects = rowInspector.getByLabel('Пресет подсветки');
  await expect(rowEffects.locator('option')).toHaveCount(5);
  await rowEffects.selectOption('fill');
  await expect(rowInspector.getByLabel('Подсветка строки')).toBeChecked();
  await expect(rowInspector.getByLabel('Движение подсветки')).toBeChecked();

  await promotionLayer.click();
  await expect(page.locator('#scene-editor-properties-title')).toHaveText('Акция');
  const promotionInspector = page.locator('#scene-editor-properties');
  await promotionInspector.getByLabel('Форма плашки акции').selectOption('chevron');
  await promotionInspector.getByLabel('Размер шрифта акции').fill('120');
  await promotionInspector.getByLabel('Жирность шрифта акции').selectOption('800');
  await promotionInspector.getByLabel('Высота шрифта акции').fill('125');
  await promotionInspector.getByLabel('Межбуквенный интервал акции').fill('1');
  const badgeEffects = promotionInspector.getByLabel('Пресет эффекта');
  await expect(badgeEffects.locator('option')).toHaveCount(2);
  await badgeEffects.selectOption('breathe');
  await badgeEffects.selectOption('shine');
  await expect(promotionInspector.getByLabel('Свечение плашки')).toBeChecked();
  await expect(promotionInspector.getByLabel('Перелив')).toBeChecked();
  await expect(promotionInspector.getByLabel('Солнечный блик')).toBeChecked();
  await expect(page.locator('#scene-editor-stage .promotion-badge')).toHaveAttribute('data-promotion-badge-shape', 'chevron');
  await expect(page.locator('#scene-editor-stage .promotion-badge-glow')).toHaveAttribute('data-promotion-badge-animation', 'shine');

  await promotionInspector.getByLabel('Вся анимация акции').selectOption('none');
  const staticPromotionGlow = page.locator('#scene-editor-stage .promotion-row-glow');
  await expect.poll(() => staticPromotionGlow.evaluate((node) => Number.parseFloat(getComputedStyle(node).opacity))).toBeGreaterThan(0);

  await promotionRowLayer.click();
  const staticRowInspector = page.locator('#scene-editor-properties');
  await staticRowInspector.getByLabel('Движение подсветки').uncheck();
  await expect.poll(() => staticPromotionGlow.evaluate((node) => Number.parseFloat(getComputedStyle(node).opacity))).toBeGreaterThan(0);
  await staticRowInspector.getByLabel('Подсветка строки').uncheck();
  await expect.poll(() => staticPromotionGlow.evaluate((node) => Number.parseFloat(getComputedStyle(node).opacity))).toBe(0);
  await staticRowInspector.getByLabel('Подсветка строки').check();

  await promotionLayer.click();
  await page.locator('#scene-editor-properties').getByLabel('Вся анимация акции').selectOption('cinematic');

  await animationLayer.click();
  await expect(page.locator('#scene-editor-properties-title')).toHaveText('Анимация сцены');
  const animationInspector = page.locator('#scene-editor-properties');
  await expect(animationInspector.getByRole('radiogroup')).toHaveCount(0);
  await animationInspector.getByLabel('Характер').selectOption('wave');
  const promotionGlow = page.locator('#scene-editor-stage .promotion-row-glow');
  await expect(promotionGlow).toHaveAttribute('data-promotion-row-animation', 'fill');
  await expect(promotionGlow).toHaveAttribute('data-motion', 'promotion-glow');
  const promotionClip = promotionGlow.locator('..');
  await expect(promotionClip).toHaveClass(/promotion-row-clip/);
  expect(await promotionClip.evaluate((node) => getComputedStyle(node).clipPath)).not.toBe('none');
  expect(await promotionClip.evaluate((node) => getComputedStyle(node).transform)).toBe('none');

  await page.locator('#scene-editor-background-layer').click();
  await expect(page.locator('#scene-editor-properties-title')).toHaveText('Фон');
  await expect(page.locator('#scene-editor-properties').getByLabel('Цвет фона')).toHaveValue('#101828');
  await expect(page.locator('#scene-editor-properties').getByLabel('Фоновое изображение')).toBeVisible();

  await page.locator('#scene-editor-table-layer').click();
  await expect(page.locator('#scene-editor-properties-title')).toHaveText('Таблица меню');
  await expect(page.locator('#scene-editor-table-edit-layer')).toBeVisible();

  const geometry = await page.evaluate(() => ({
    documentClient:document.documentElement.clientHeight,
    documentScroll:document.documentElement.scrollHeight,
    layersClient:document.querySelector('.scene-editor-layers-panel')?.clientHeight || 0,
    layersScroll:document.querySelector('.scene-editor-layers-panel')?.scrollHeight || 0,
    propertiesClient:document.querySelector('.scene-editor-properties-panel')?.clientHeight || 0,
    propertiesScroll:document.querySelector('.scene-editor-properties-panel')?.scrollHeight || 0,
    propertiesWidth:document.querySelector('.scene-editor-properties-panel')?.getBoundingClientRect().width || 0
  }));
  expect(geometry.documentScroll).toBeLessThanOrEqual(geometry.documentClient + 2);
  expect(geometry.layersScroll).toBeLessThanOrEqual(geometry.layersClient + 2);
  expect(geometry.propertiesScroll).toBeLessThanOrEqual(geometry.propertiesClient + 2);
  expect(geometry.propertiesWidth).toBeGreaterThanOrEqual(296);
  expect(geometry.propertiesWidth).toBeLessThanOrEqual(312);

  const shellBox = await page.locator('#scene-editor-stage-shell').boundingBox();
  expect(shellBox).not.toBeNull();
  const areaShare = (shellBox.width * shellBox.height) / (1600 * 900);
  expect(areaShare).toBeGreaterThan(.25);
  expect(areaShare).toBeLessThan(.55);

  await page.locator('.scene-table-editor-close').click();
  await expect(page.locator('#scene-editor-table-edit-layer')).toBeHidden();
  await page.route('**/api/weather/preview**', async (route) => {
    const url = new URL(route.request().url());
    await route.fulfill({
      status:200,
      contentType:'application/json',
      body:JSON.stringify({
        location_name:'Тестовый город',
        latitude:Number(url.searchParams.get('latitude')),
        longitude:Number(url.searchParams.get('longitude')),
        timezone:url.searchParams.get('timezone') || 'UTC',
        temperature:9,
        apparent_temperature:7,
        humidity:68,
        wind_speed:11,
        weather_code:3,
        is_day:true,
        condition:'Облачно',
        icon:'cloud',
        updated_at:'2026-09-23T18:00',
        forecast:[
          { time:'2026-09-23T19:00', temperature:8, weather_code:3, icon:'cloud' }
        ]
      })
    });
  });

  await page.locator('#scene-editor-add').click();
  const addMenu = page.locator('#scene-editor-add-menu');
  await expect(addMenu).toBeVisible();
  await expect(addMenu.getByRole('menuitem')).toHaveCount(5);
  await addMenu.getByRole('menuitem', { name:/Текстовое поле/ }).click();
  await expect(page.locator('.scene-editor-layer')).toHaveCount(1);
  await expect(page.locator('.scene-editor-layer-select strong')).toHaveText('Текстовое поле');
  await expect(page.locator('.scene-editor-selection-box')).toHaveCount(1);
  await expect(page.locator('#scene-editor-properties-title')).toHaveText('Элемент 1');
  await expect(page.locator('#scene-editor-properties-kind')).toHaveText('T');
  await expect(page.locator('#scene-editor-properties-kind')).toHaveAttribute('aria-label', 'Текстовое поле');
  await expect(page.locator('#scene-editor-stage [data-scene-element-type="text"]')).toHaveCount(1);

  const inspector = page.locator('#scene-editor-properties');
  await inspector.getByLabel('Текст', { exact:true }).fill('бар маяк');
  await inspector.getByLabel('X', { exact:true }).fill('300');
  await inspector.getByLabel('Y', { exact:true }).fill('160');
  await inspector.getByText('Шрифт и абзац', { exact:true }).click();
  await inspector.getByLabel('Размер, px', { exact:true }).fill('96');
  await expect(page.locator('#scene-editor-dirty-state')).toHaveText('Не сохранено');
  await expect(page.locator('#scene-editor-stage [data-scene-element-type="text"]')).toContainText('бар маяк');
  await expect(page.locator('#scene-editor-undo')).toBeEnabled();

  const seHandle = page.locator('.scene-editor-resize-handle[data-direction="se"]');
  await expect(seHandle).toBeVisible();
  await expect(page.locator('.scene-editor-resize-handle')).toHaveCount(8);
  const handleBox = await seHandle.boundingBox();
  expect(handleBox).not.toBeNull();
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(handleBox.x + 34, handleBox.y + 20);
  await page.mouse.up();
  expect(Number(await inspector.getByLabel('Ширина', { exact:true }).inputValue())).toBeGreaterThan(720);
  expect(Number(await inspector.getByLabel('Высота', { exact:true }).inputValue())).toBeGreaterThan(220);

  await page.locator('#scene-editor-add').click();
  await addMenu.getByRole('menuitem', { name:/Погода/ }).click();
  await expect(page.locator('.scene-editor-layer')).toHaveCount(2);
  const weatherElement = page.locator('#scene-editor-stage [data-scene-element-type="weather"]');
  const weatherContent = weatherElement.locator('[data-scene-weather-mount]');
  await expect(weatherElement).toHaveCount(1);
  await expect(weatherContent).toHaveCount(1);
  await expect(inspector.locator('summary[aria-label^="Погода:"]')).toBeVisible();
  await expect(inspector.getByLabel('Автомасштаб при resize')).toHaveCount(0);
  await expect(inspector.getByLabel('Масштаб внутри, %')).toHaveCount(0);
  await expect(inspector.locator('summary[aria-label^="Типографика:"]')).toBeVisible();
  await expect(inspector.getByLabel('Шрифт температуры')).toHaveValue('arial');
  await inspector.getByLabel('Широта').fill('50.55034');
  await inspector.getByLabel('Долгота').fill('137.00995');
  await expect(weatherElement.locator('.weather-widget')).toBeVisible({ timeout:5000 });

  const weatherFontOptions = await inspector.getByLabel('Шрифт температуры').locator('option').allTextContents();
  expect(weatherFontOptions).toEqual(expect.arrayContaining([
    'MIRA Sans','MIRA Sans Condensed','MIRA Sans Mono','MIRA Serif','MIRA Serif Condensed'
  ]));
  await inspector.getByLabel('Шрифт температуры').selectOption('mira-mono');
  await inspector.getByLabel('Кегль температуры, pt').fill('62');
  await inspector.getByLabel('Кегль города, pt').fill('16');
  await inspector.getByLabel('Масштаб иконок, %').fill('150');
  await expect.poll(() => weatherElement.locator('.weather-widget').evaluate((node) =>
    Number.parseFloat(node.style.getPropertyValue('--weather-icon-size-px'))
  )).toBeGreaterThan(120);

  await inspector.getByLabel('Ширина', { exact:true }).fill('260');
  await inspector.getByLabel('Высота', { exact:true }).fill('180');
  await expect.poll(() => weatherContent.evaluate((node) => ({
    scale:Number(node.dataset.sceneContentScale),
    width:node.style.width,
    height:node.style.height,
    transform:node.style.transform
  }))).toEqual({ scale:1, width:'100%', height:'100%', transform:'none' });

  await page.locator('#scene-editor-add').click();
  await expect(addMenu.getByRole('menuitem', { name:/Погода/ })).toBeDisabled();
  await addMenu.getByRole('menuitem', { name:/Логотип/ }).click();
  await expect(page.locator('.scene-editor-layer')).toHaveCount(3);
  await expect(page.locator('#scene-editor-stage [data-scene-element-type="logo"]')).toHaveCount(1);

  const saveResponse = page.waitForResponse((response) =>
    response.url().endsWith(`/api/screens/${screen.id}/draft`) && response.request().method() === 'PUT'
  );
  await page.locator('#scene-editor-save').click();
  expect((await saveResponse).ok()).toBeTruthy();
  await expect(page.locator('#scene-editor-dirty-state')).toHaveText('Сохранено');

  const stored = await (await page.request.get(`/api/screens/${screen.id}/editor`)).json();
  expect(stored.draft.scene.elements).toHaveLength(3);
  expect(stored.draft.scene.elements[0].text.runs[0].value).toBe('бар маяк');
  expect(stored.draft.scene.elements[0].x).toBe(300);
  expect(stored.draft.scene.elements[1].type).toBe('weather');
  expect(stored.draft.scene.elements[1].weather.temperature_font_family).toBe('mira-mono');
  expect(stored.draft.scene.elements[1].weather.temperature_font_size_pt).toBe(62);
  expect(stored.draft.scene.elements[1].weather.location_font_size_pt).toBe(16);
  expect(stored.draft.scene.elements[1].weather.icon_scale_percent).toBe(150);
  expect(stored.draft.settings.price_font_size_pt).toBe(34);
  expect(stored.draft.settings.promotion_badge_shape).toBe('chevron');
  expect(stored.draft.settings.promotion_font_size_percent).toBe(120);
  expect(stored.draft.settings.promotion_font_weight).toBe(800);
  expect(stored.draft.settings.promotion_font_height_percent).toBe(125);
  expect(stored.draft.settings.promotion_letter_spacing_px).toBe(1);
  const storedPromotion = stored.draft.rows.find((row) => row.kind === 'item');
  expect(storedPromotion.promotion).toBe(true);
  expect(storedPromotion.promotion_animation).toBe('fill');
  expect(storedPromotion.promotion_badge_animation).toBe('shine');
  expect(stored.animation.profile.pattern).toBe('wave');

  await page.goto(`/screen-editor?id=${screen.id}`);
  await expect(page.locator('#editor-elements-stack')).toHaveCount(0);
  await expect(page.locator('#editor-add-element')).toHaveCount(0);
  await expect(page.locator('#editor-background-file')).toHaveCount(0);
  await expect(page.locator('#editor-table-x')).toHaveCount(0);
  await expect(page.locator('#editor-menu-preview [data-editor-preview-row-control]')).toHaveCount(0);
  await expect(page.locator('#editor-menu-preview [data-scene-elements-layer]')).toHaveCount(1);
  await expect(page.locator('#editor-menu-preview [data-scene-element-type]')).toHaveCount(3);
  await expect(page.locator('#editor-scene-link')).toHaveAttribute('href', `/scene?screen=${screen.id}`);
  await expect(page.locator('#editor-preview-scene-link')).toHaveAttribute('href', `/scene?screen=${screen.id}`);
});

test('background, weather, image and video settings apply atomically to selected monitors', async ({ page }) => {
  await page.setViewportSize({ width:1600, height:900 });
  await login(page);
  const { screen, location } = await fixture(page);
  const targetResponse = await page.request.post(`/api/locations/${screen.location_id}/screens`, { data:{} });
  expect(targetResponse.status()).toBe(201);
  const target = await targetResponse.json();

  const targetBefore = await (await page.request.get(`/api/screens/${target.id}/editor`)).json();
  const rejected = await page.request.put(`/api/screens/${screen.id}/scene/apply`, { data:{
    kind:'background',
    target_screen_ids:[target.id, 99999999],
    background:{ background_color:'#223344', background_image_url:'' }
  } });
  expect(rejected.status()).toBe(400);
  const targetAfterRejected = await (await page.request.get(`/api/screens/${target.id}/editor`)).json();
  expect(targetAfterRejected.draft.revision).toBe(targetBefore.draft.revision);
  expect(targetAfterRejected.draft.settings.background_color || '#101828').not.toBe('#223344');

  await page.goto(`/scene?screen=${screen.id}`);
  const inspector = page.locator('#scene-editor-properties');

  await page.locator('#scene-editor-background-layer').click();
  await inspector.getByLabel('Цвет фона').evaluate((node) => {
    node.value = '#223344';
    node.dispatchEvent(new Event('input', { bubbles:true }));
  });
  let applyGroup = inspector.locator('.scene-editor-multi-apply');
  await expect(applyGroup.locator('summary')).toHaveText('Применить к мониторам');
  await applyGroup.locator('summary').click();
  await applyGroup.getByRole('checkbox', { name:`Применить к ${location.name} — ${target.name}`, exact:true }).check();
  await applyGroup.getByRole('button', { name:'Применить к выбранным' }).click();
  await expect(page.locator('#scene-editor-message')).toContainText('Настройки применены');

  const add = page.locator('#scene-editor-add');
  const addMenu = page.locator('#scene-editor-add-menu');

  await add.click();
  await addMenu.getByRole('menuitem', { name:/Погода/ }).click();
  await inspector.getByLabel('X', { exact:true }).fill('410');
  await inspector.getByLabel('Y', { exact:true }).fill('180');
  applyGroup = inspector.locator('.scene-editor-multi-apply');
  await applyGroup.locator('summary').click();
  await applyGroup.getByRole('checkbox', { name:`Применить к ${location.name} — ${target.name}`, exact:true }).check();
  await applyGroup.getByRole('button', { name:'Применить к выбранным' }).click();
  await expect(page.locator('#scene-editor-message')).toContainText('Настройки применены');

  await add.click();
  await addMenu.getByRole('menuitem', { name:/Картинка/ }).click();
  await inspector.getByLabel('X', { exact:true }).fill('520');
  await inspector.getByLabel('Ширина', { exact:true }).fill('360');
  applyGroup = inspector.locator('.scene-editor-multi-apply');
  await applyGroup.locator('summary').click();
  await applyGroup.getByRole('checkbox', { name:`Применить к ${location.name} — ${target.name}`, exact:true }).check();
  await applyGroup.getByRole('button', { name:'Применить к выбранным' }).click();
  await expect(page.locator('#scene-editor-message')).toContainText('Настройки применены');

  await add.click();
  await addMenu.getByRole('menuitem', { name:/Видео/ }).click();
  await inspector.getByLabel('Y', { exact:true }).fill('470');
  await inspector.getByLabel('Высота', { exact:true }).fill('280');
  applyGroup = inspector.locator('.scene-editor-multi-apply');
  await applyGroup.locator('summary').click();
  await applyGroup.getByRole('checkbox', { name:`Применить к ${location.name} — ${target.name}`, exact:true }).check();
  await applyGroup.getByRole('button', { name:'Применить к выбранным' }).click();
  await expect(page.locator('#scene-editor-message')).toContainText('Настройки применены');

  const storedTarget = await (await page.request.get(`/api/screens/${target.id}/editor`)).json();
  expect(storedTarget.draft.settings.background_color).toBe('#223344');
  const weather = storedTarget.draft.scene.elements.find((item) => item.type === 'weather');
  const image = storedTarget.draft.scene.elements.find((item) => item.type === 'image');
  const video = storedTarget.draft.scene.elements.find((item) => item.type === 'video');
  expect({ x:weather.x, y:weather.y }).toEqual({ x:410, y:180 });
  expect({ x:image.x, width:image.width }).toEqual({ x:520, width:360 });
  expect({ y:video.y, height:video.height }).toEqual({ y:470, height:280 });
});

test('Scene table editor stays readable and scrollable with a dense menu', async ({ page }) => {
  await page.setViewportSize({ width:1600, height:900 });
  await login(page);
  const { screen, product } = await fixture(page);
  const editor = await (await page.request.get(`/api/screens/${screen.id}/editor`)).json();
  const rows = [];
  for (let section = 0; section < 3; section += 1) {
    rows.push({ id:`dense-section-${section}`, kind:'section', name:`РАЗДЕЛ ${section + 1}`, enabled:true });
    for (let index = 0; index < 10; index += 1) {
      rows.push({
        id:`dense-item-${section}-${index}`,
        kind:'item',
        product_id:product.id,
        promotion:index === 2,
        promotion_text:index === 2 ? 'АКЦИЯ' : '',
        enabled:true
      });
    }
  }
  const saved = await page.request.put(`/api/screens/${screen.id}/draft`, { data:{
    revision:editor.draft.revision,
    rows,
    settings:{
      ...editor.draft.settings,
      table_x:56,
      table_y:15,
      table_width_px:1374,
      table_height_px:925
    },
    scene:editor.draft.scene
  } });
  expect(saved.ok()).toBeTruthy();

  await page.goto(`/scene?screen=${screen.id}`);
  await page.locator('#scene-editor-table-layer').click();

  const panel = page.locator('.scene-table-editor-dialog');
  const scroll = page.locator('.scene-table-editor-scroll');
  const editorRows = page.locator('.scene-table-editor-row');
  await expect(panel).toBeVisible();
  await expect(editorRows).toHaveCount(33);
  await expect(page.locator('#scene-editor-table-edit-layer [data-editor-preview-row-control]')).toHaveCount(0);

  const density = await page.evaluate(() => {
    const scroller = document.querySelector('.scene-table-editor-scroll');
    const rows = [...document.querySelectorAll('.scene-table-editor-row')].slice(0, 8);
    return {
      clientHeight:scroller?.clientHeight || 0,
      scrollHeight:scroller?.scrollHeight || 0,
      rowGap:parseFloat(getComputedStyle(scroller).rowGap || getComputedStyle(scroller).gap || '0'),
      fontSizes:rows.map((row) => parseFloat(getComputedStyle(row.querySelector('.editor-preview-inline-control') || row).fontSize)),
      controlHeights:rows.map((row) => (row.querySelector('.editor-preview-inline-control') || row).getBoundingClientRect().height),
      boxes:rows.map((row) => {
        const rect = row.getBoundingClientRect();
        return { top:rect.top, bottom:rect.bottom, height:rect.height };
      })
    };
  });
  expect(density.scrollHeight).toBeGreaterThan(density.clientHeight);
  expect(density.rowGap).toBeLessThanOrEqual(1);
  expect(density.fontSizes.every((size) => size >= 11)).toBe(true);
  expect(density.controlHeights.every((height) => height >= 24 && height <= 25)).toBe(true);
  expect(density.boxes.every((box) => box.height >= 24 && box.height <= 26)).toBe(true);
  for (let index = 1; index < density.boxes.length; index += 1) {
    expect(density.boxes[index].top).toBeGreaterThanOrEqual(density.boxes[index - 1].bottom);
  }

  const sectionInput = page.locator('.scene-table-editor-row.is-section .editor-preview-section-input').first();
  await sectionInput.fill('НОВОЕ НАЗВАНИЕ РАЗДЕЛА');
  await expect(sectionInput).toHaveValue('НОВОЕ НАЗВАНИЕ РАЗДЕЛА');
  await expect(sectionInput).toBeFocused();

  const productChoice = page.locator('.scene-table-editor-row.is-item [data-preview-product-select]').first();
  await productChoice.click();
  await expect(page.locator('.scene-table-editor-row.is-item .editor-preview-choice-popup').first()).toBeVisible();
  await expect(page.locator('.scene-table-editor-row.is-item .editor-preview-choice-search').first()).toBeFocused();
});

test('Glass table modal updates canonical Preview live and never changes table geometry on close', async ({ page }) => {
  await page.setViewportSize({ width:1600, height:900 });
  await login(page);
  const { screen, product } = await fixture(page);
  const editor = await (await page.request.get(`/api/screens/${screen.id}/editor`)).json();
  const rows = [
    { id:'modal-section-1', kind:'section', name:'ИСХОДНЫЙ РАЗДЕЛ', enabled:true },
    { id:'modal-item-1', kind:'item', product_id:product.id, promotion:false, promotion_text:'', enabled:true }
  ];
  const saved = await page.request.put(`/api/screens/${screen.id}/draft`, { data:{
    revision:editor.draft.revision,
    rows,
    settings:{
      ...editor.draft.settings,
      table_x:56,
      table_y:15,
      table_width_px:1374,
      table_height_px:925
    },
    scene:editor.draft.scene
  } });
  expect(saved.ok()).toBeTruthy();

  await page.goto(`/scene?screen=${screen.id}`);
  const sectionRect = page.locator('#scene-editor-stage .table-section rect').first();
  await expect(sectionRect).toBeVisible();

  const before = await sectionRect.evaluate((node) => ({
    x:Number(node.getAttribute('x')),
    width:Number(node.getAttribute('width'))
  }));
  expect(before.x).toBeCloseTo(56, 1);
  expect(before.width).toBeCloseTo(1374, 1);

  await page.locator('.scene-editor-table-selection-box').click();
  const modal = page.locator('#scene-editor-table-edit-layer');
  await expect(modal).toBeVisible();
  const dialog = page.locator('.scene-table-editor-dialog');
  await expect(dialog).toBeVisible();
  await expect(page.locator('body')).toHaveClass(/scene-table-editor-open/);
  const glass = await dialog.evaluate((node) => {
    const style = getComputedStyle(node);
    const color = style.backgroundColor;
    const rgba = color.match(/^rgba?\(([^)]+)\)$/);
    const slash = color.match(/\/\s*([0-9.]+)\s*\)$/);
    let alpha = 1;
    if (rgba) {
      const parts = rgba[1].split(',').map((part) => part.trim());
      if (parts.length === 4) alpha = Number(parts[3]);
    } else if (slash) alpha = Number(slash[1]);
    return { alpha, backdropFilter:style.backdropFilter || style.webkitBackdropFilter || 'none' };
  });
  expect(glass.alpha).toBeLessThan(.8);
  expect(glass.backdropFilter).not.toBe('none');

  const sectionInput = modal.locator('.scene-table-editor-row.is-section .editor-preview-section-input').first();
  await sectionInput.fill('LIVE РАЗДЕЛ');
  await expect(page.locator('#scene-editor-stage .section-title').first()).toHaveText('LIVE РАЗДЕЛ');

  const sectionsBeforeAdd = await page.locator('#scene-editor-stage .table-section').count();
  await modal.getByRole('button', { name:'+ Раздел', exact:true }).click();
  await expect(page.locator('#scene-editor-stage .table-section')).toHaveCount(sectionsBeforeAdd + 1);
  const canonicalStage = await page.locator('#scene-editor-stage').evaluate((node) => ({
    width:node.style.width,
    height:node.style.height,
    viewportWidth:node.dataset.sceneViewportWidth,
    viewportHeight:node.dataset.sceneViewportHeight,
    transform:node.style.transform
  }));
  expect(canonicalStage.width).toBe('1920px');
  expect(canonicalStage.height).toBe('1080px');
  expect(canonicalStage.viewportWidth).toBe('1920');
  expect(canonicalStage.viewportHeight).toBe('1080');
  expect(canonicalStage.transform).toContain('scale(');

  await modal.locator('.scene-table-editor-close').click();
  await expect(modal).toBeHidden();
  await expect(page.locator('body')).not.toHaveClass(/scene-table-editor-open/);

  const after = await sectionRect.evaluate((node) => ({
    x:Number(node.getAttribute('x')),
    width:Number(node.getAttribute('width'))
  }));
  expect(after.x).toBeCloseTo(before.x, 2);
  expect(after.width).toBeCloseTo(before.width, 2);
  expect(Number(await page.locator('#scene-editor-properties').getByLabel('Ширина таблицы').inputValue())).toBe(1374);

  const tableBox = page.locator('.scene-editor-table-selection-box');
  await expect(tableBox).toBeVisible();
  let dragBox = null;
  await expect.poll(async () => {
    dragBox = await tableBox.boundingBox();
    return dragBox !== null;
  }).toBe(true);
  expect(dragBox).not.toBeNull();
  await page.mouse.move(dragBox.x + dragBox.width / 2, dragBox.y + dragBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(dragBox.x + dragBox.width / 2 + 12, dragBox.y + dragBox.height / 2 + 8);
  await page.mouse.up();
  await expect(modal).toBeHidden();
});

test('Scene editor stays a single-page touch workspace on mobile', async ({ page }) => {
  await page.setViewportSize({ width:390, height:844 });
  await login(page);
  const { screen } = await fixture(page);
  await page.goto(`/scene?screen=${screen.id}`);

  await expect(page.locator('.scene-editor-mobile-toolbar')).toBeVisible();
  const size = await page.evaluate(() => ({
    clientHeight:document.documentElement.clientHeight,
    scrollHeight:document.documentElement.scrollHeight,
    clientWidth:document.documentElement.clientWidth,
    scrollWidth:document.documentElement.scrollWidth
  }));
  expect(size.scrollHeight).toBeLessThanOrEqual(size.clientHeight + 2);
  expect(size.scrollWidth).toBeLessThanOrEqual(size.clientWidth + 2);

  await page.getByRole('button', { name:/Слои/ }).click();
  await expect(page.locator('.scene-editor-layers-panel')).toBeVisible();
  await page.locator('#scene-editor-table-layer').click();
  await expect(page.locator('#scene-editor-table-edit-layer')).toBeVisible();
  await expect(page.locator('.scene-table-editor-dialog')).toBeVisible();
  await page.locator('.scene-table-editor-close').click();
  await expect(page.locator('#scene-editor-table-edit-layer')).toBeHidden();
  await expect(page.locator('.scene-editor-properties-panel')).toBeVisible();

  await page.locator('.scene-editor-mobile-toolbar').getByRole('button', { name:/Элемент/ }).click();
  await expect(page.locator('#scene-editor-add-menu')).toBeVisible();
  await page.locator('#scene-editor-add-menu').getByRole('menuitem', { name:/Текстовое поле/ }).click();
  await expect(page.locator('.scene-editor-selection-box')).toHaveCount(1);
  await expect(page.locator('.scene-editor-resize-handle')).toHaveCount(8);
});


test('Scene weather preview resolves selected city and intrinsic autoscale keeps content inside the element box', async ({ page }) => {
  await page.setViewportSize({ width:1600, height:900 });
  await login(page);
  const { screen } = await fixture(page);
  const promotionBundle = await (await page.request.get(`/api/screens/${screen.id}/editor`)).json();
  const promotionSave = await page.request.put(`/api/screens/${screen.id}/draft`, { data:{
    revision:promotionBundle.draft.revision,
    rows:promotionBundle.draft.rows.map((row) => row.kind === 'item'
      ? { ...row, promotion:true, promotion_text:'АКЦИЯ', promotion_animation:'wave', promotion_badge_animation:'shine' }
      : row),
    settings:promotionBundle.draft.settings,
    scene:promotionBundle.draft.scene
  } });
  expect(promotionSave.ok()).toBeTruthy();

  await page.route('**/api/weather/locations**', async (route) => {
    await route.fulfill({
      status:200,
      contentType:'application/json',
      body:JSON.stringify([{ name:'Комсомольск-на-Амуре', admin1:'Хабаровский край', country:'Россия', latitude:50.5503, longitude:137.0079, timezone:'Asia/Vladivostok' }])
    });
  });
  const previewRequests = [];
  let previewAttempts = 0;
  await page.route('**/api/weather/preview**', async (route) => {
    const url = new URL(route.request().url());
    previewRequests.push(Object.fromEntries(url.searchParams));
    previewAttempts += 1;
    if (previewAttempts === 1) {
      await route.fulfill({ status:503, contentType:'application/json', body:JSON.stringify({ error:'temporary weather provider failure' }) });
      return;
    }
    await route.fulfill({
      status:200,
      contentType:'application/json',
      body:JSON.stringify({
        location_name:url.searchParams.get('name'),
        latitude:Number(url.searchParams.get('latitude')),
        longitude:Number(url.searchParams.get('longitude')),
        timezone:url.searchParams.get('timezone'),
        temperature:7,
        apparent_temperature:5,
        humidity:71,
        wind_speed:9,
        weather_code:3,
        is_day:true,
        condition:'Облачно',
        icon:'cloud',
        updated_at:new Date().toISOString(),
        forecast:[
          { time:new Date(Date.now()+3600000).toISOString(), temperature:8, icon:'cloud' },
          { time:new Date(Date.now()+7200000).toISOString(), temperature:7, icon:'cloud' },
          { time:new Date(Date.now()+10800000).toISOString(), temperature:6, icon:'cloud' }
        ]
      })
    });
  });

  await page.goto(`/scene?screen=${screen.id}`);
  await page.locator('#scene-editor-add').click();
  await page.locator('#scene-editor-add-menu').getByRole('menuitem', { name:/Погода/ }).click();

  const location = page.locator('#scene-editor-properties').getByLabel('Населённый пункт');
  await location.fill('Комсомольск-на-Амуре');
  const latitudeField = page.locator('#scene-editor-properties').getByLabel('Широта');
  const longitudeField = page.locator('#scene-editor-properties').getByLabel('Долгота');
  await expect(latitudeField).toHaveValue('50.5503');
  await expect(longitudeField).toHaveValue('137.0079');
  await expect(latitudeField).toHaveAttribute('step', 'any');
  await expect(longitudeField).toHaveAttribute('step', 'any');
  expect(await latitudeField.evaluate((field) => field.validity.valid)).toBe(true);
  expect(await longitudeField.evaluate((field) => field.validity.valid)).toBe(true);
  await expect(page.locator('#scene-editor-properties').getByLabel('Часовой пояс')).toHaveValue('Asia/Vladivostok');

  const weatherNode = page.locator('div[data-scene-element-type="weather"][data-scene-element-id]');
  await expect(page.locator('.scene-editor-layer-select strong')).toHaveText('Погода');
  await expect(page.locator('.scene-editor-selection-box.is-selected')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  const weatherLocation = weatherNode.locator('.weather-widget-location');
  await expect(weatherLocation).toHaveText('Комсомольск-на-Амуре');
  const locationLayout = await weatherLocation.evaluate((node) => {
    const content = node.parentElement;
    const rect = node.getBoundingClientRect();
    const contentRect = content?.getBoundingClientRect();
    const style = getComputedStyle(node);
    return {
      text:node.textContent,
      width:rect.width,
      contentWidth:contentRect?.width || 0,
      whiteSpace:style.whiteSpace,
      textOverflow:style.textOverflow,
      overflowX:style.overflowX,
      scrollWidth:node.scrollWidth,
      clientWidth:node.clientWidth
    };
  });
  expect(locationLayout.text).toBe('Комсомольск-на-Амуре');
  expect(locationLayout.width).toBeGreaterThan(locationLayout.contentWidth * .95);
  expect(locationLayout.whiteSpace).toBe('normal');
  expect(locationLayout.textOverflow).toBe('clip');
  expect(locationLayout.scrollWidth).toBeLessThanOrEqual(locationLayout.clientWidth + 1);
  await expect(weatherNode.locator('.weather-widget-temperature')).toHaveText('7°');
  const weatherIcon = weatherNode.locator('.weather-widget-icon');
  const weatherTemperature = weatherNode.locator('.weather-widget-temperature');
  const weatherVisual = weatherNode.locator('.weather-widget-visual');
  await expect(weatherIcon).toBeVisible();
  await expect(weatherNode.locator('.weather-atmosphere')).toHaveCount(1);
  const weatherColumns = await weatherNode.evaluate((node) => {
    const icon = node.querySelector('.weather-widget-icon')?.getBoundingClientRect();
    const temperature = node.querySelector('.weather-widget-temperature')?.getBoundingClientRect();
    const visual = node.querySelector('.weather-widget-visual')?.getBoundingClientRect();
    if (!icon || !temperature || !visual) return null;
    return {
      iconCenter:icon.left + icon.width / 2,
      temperatureCenter:temperature.left + temperature.width / 2,
      visualCenter:visual.left + visual.width / 2
    };
  });
  expect(weatherColumns).not.toBeNull();
  expect(weatherColumns.iconCenter).toBeLessThan(weatherColumns.temperatureCenter);
  expect(weatherColumns.temperatureCenter).toBeLessThan(weatherColumns.visualCenter);

  const stableWeatherWidget = weatherNode.locator('.weather-widget');
  const stableWeatherContent = weatherNode.locator('[data-scene-weather-mount]');
  const weatherMetrics = () => weatherNode.evaluate((node) => {
    const logicalFromPercent = (value, total) => (Number.parseFloat(value) / 100) * total;
    const left = node.style.left;
    const top = node.style.top;
    const width = node.style.width;
    const height = node.style.height;
    if (![left, top, width, height].every((value) => value.endsWith('%'))) return null;
    return {
      x:logicalFromPercent(left, 1920),
      y:logicalFromPercent(top, 1080),
      width:logicalFromPercent(width, 1920),
      height:logicalFromPercent(height, 1080)
    };
  });
  const weatherBefore = await weatherMetrics();
  const weatherContentScaleBefore = Number(await stableWeatherContent.getAttribute('data-scene-content-scale'));
  const viewportScaleBefore = Number(await page.locator('#scene-editor-stage').getAttribute('data-scene-viewport-scale'));

  await page.locator('#scene-editor-promotion-row-layer').click();
  await page.locator('#scene-editor-properties').getByLabel('Пресет подсветки').selectOption('fill');
  await page.locator('#scene-editor-promotion-layer').click();
  const badgeMotion = page.locator('#scene-editor-properties').getByLabel('Пресет эффекта');
  await badgeMotion.selectOption('breathe');
  await badgeMotion.selectOption('shine');
  await page.locator('#scene-editor-animation-layer').click();
  const animationScale = page.locator('#animation-scale');
  const animationBrightness = page.locator('#animation-brightness');
  await animationScale.fill('0.09');
  await animationBrightness.fill('0.55');
  await animationScale.fill('0.025');
  await animationBrightness.fill('0.18');

  const weatherAfter = await weatherMetrics();
  const weatherContentScaleAfter = Number(await stableWeatherContent.getAttribute('data-scene-content-scale'));
  const viewportScaleAfter = Number(await page.locator('#scene-editor-stage').getAttribute('data-scene-viewport-scale'));
  expect(weatherBefore).not.toBeNull();
  expect(weatherAfter).not.toBeNull();
  expect(Math.abs(viewportScaleBefore - viewportScaleAfter)).toBeLessThan(.000001);
  expect(Math.abs(weatherContentScaleBefore - weatherContentScaleAfter)).toBeLessThan(.0001);
  expect(weatherAfter).toEqual(weatherBefore);
  const weatherType = await weatherNode.evaluate((node) => {
    const facts = node.querySelector('.weather-widget-facts');
    const time = node.querySelector('.weather-widget-forecast-item > span');
    return {
      factsSize:facts ? parseFloat(getComputedStyle(facts).fontSize) : 0,
      timeSize:time ? parseFloat(getComputedStyle(time).fontSize) : 0
    };
  });
  expect(weatherType.factsSize).toBeGreaterThanOrEqual(12);
  expect(weatherType.timeSize).toBeGreaterThanOrEqual(11);
  const weatherEmphasis = await weatherNode.evaluate((node) => {
    const location = node.querySelector('.weather-widget-location');
    const temperature = node.querySelector('.weather-widget-temperature');
    const icon = node.querySelector('.weather-widget-icon');
    const locationStyle = location ? getComputedStyle(location) : null;
    const temperatureStyle = temperature ? getComputedStyle(temperature) : null;
    return {
      locationSize:locationStyle ? parseFloat(locationStyle.fontSize) : 0,
      temperatureSize:temperatureStyle ? parseFloat(temperatureStyle.fontSize) : 0,
      locationShadow:locationStyle?.textShadow || 'none',
      temperatureShadow:temperatureStyle?.textShadow || 'none',
      iconWidth:icon ? parseFloat(getComputedStyle(icon).width) : 0,
      iconFilter:icon ? getComputedStyle(icon).filter : 'none'
    };
  });
  expect(weatherEmphasis.locationSize).toBeGreaterThanOrEqual(12);
  expect(weatherEmphasis.temperatureSize).toBeGreaterThanOrEqual(40);
  expect(weatherEmphasis.locationShadow).not.toBe('none');
  expect(weatherEmphasis.temperatureShadow).not.toBe('none');
  expect(weatherEmphasis.iconWidth).toBeGreaterThanOrEqual(50);
  expect(weatherEmphasis.iconFilter).not.toBe('none');
  await expect.poll(() => previewRequests.length, { timeout:7000 }).toBeGreaterThanOrEqual(2);
  expect(previewRequests.at(-1)).toMatchObject({
    name:'Комсомольск-на-Амуре',
    latitude:'50.5503',
    longitude:'137.0079',
    timezone:'Asia/Vladivostok'
  });

  await page.locator('.scene-editor-layer-select', { hasText:'Погода' }).click();
  await expect(page.locator('#scene-editor-properties-title')).toContainText('Элемент');

  const width = page.locator('#scene-editor-properties').getByLabel('Ширина');
  const height = page.locator('#scene-editor-properties').getByLabel('Высота');
  await width.fill('250');
  await height.fill('150');

  await expect.poll(async () => weatherNode.evaluate((node) => {
    const outer = node.getBoundingClientRect();
    const widget = node.querySelector('.weather-widget');
    const visual = node.querySelector('.weather-widget-visual');
    if (!(widget instanceof HTMLElement) || !(visual instanceof HTMLElement)) return false;
    const widgetRect = widget.getBoundingClientRect();
    const visualRect = visual.getBoundingClientRect();
    const visibleWidgetInside =
      widgetRect.left >= outer.left - 1 && widgetRect.top >= outer.top - 1
      && widgetRect.right <= outer.right + 1 && widgetRect.bottom <= outer.bottom + 1;
    const visualInsideWidget =
      visualRect.left >= widgetRect.left - 1 && visualRect.top >= widgetRect.top - 1
      && visualRect.right <= widgetRect.right + 1 && visualRect.bottom <= widgetRect.bottom + 1;
    return visibleWidgetInside && visualInsideWidget && getComputedStyle(visual).overflow === 'hidden';
  })).toBe(true);

  await expect(weatherNode).toHaveCSS('overflow', 'hidden');
  await expect(weatherNode.locator('.weather-widget-visual')).toHaveCSS('overflow', 'hidden');
  const weatherMount = weatherNode.locator('[data-scene-weather-mount]');
  const effectiveScale = Number(await weatherMount.getAttribute('data-scene-content-scale'));
  expect(effectiveScale).toBe(1);
  const fillGeometry = await weatherNode.evaluate((node) => {
    const outer = node.getBoundingClientRect();
    const mount = node.querySelector('[data-scene-weather-mount]')?.getBoundingClientRect();
    if (!mount) return null;
    return {
      widthDelta:Math.abs(outer.width - mount.width),
      heightDelta:Math.abs(outer.height - mount.height),
      leftDelta:Math.abs(outer.left - mount.left),
      topDelta:Math.abs(outer.top - mount.top)
    };
  });
  expect(fillGeometry).not.toBeNull();
  for (const delta of Object.values(fillGeometry)) expect(delta).toBeLessThan(.1);
});


test('Scene weather uses same-origin preview even when navigator reports offline', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'onLine', { configurable:true, get:() => false });
  });
  await page.setViewportSize({ width:1600, height:900 });
  await login(page);
  const { screen } = await fixture(page);

  const editorResponse = await page.request.get(`/api/screens/${screen.id}/editor`);
  expect(editorResponse.ok()).toBeTruthy();
  const editor = await editorResponse.json();
  const weatherElement = {
    id:'weather-offline-probe',
    type:'weather',
    enabled:true,
    x:1400,
    y:0,
    width:520,
    height:360,
    z_index:20,
    opacity:1,
    rotation_deg:0,
    content_auto_scale:true,
    content_scale_percent:100,
    content_reference_width:520,
    content_reference_height:360,
    weather:{
      mode:'current-and-forecast',
      location_name:'Комсомольск-на-Амуре',
      latitude:50.55034,
      longitude:137.00995,
      timezone:'Asia/Vladivostok',
      refresh_minutes:15,
      show_location:true,
      show_condition:true,
      show_feels_like:true,
      show_humidity:true,
      show_wind:true,
      show_forecast:true,
      forecast_items:3,
      temperature_font_family:'arial',
      temperature_size_percent:100,
      location_size_percent:100,
      animation_enabled:true,
      animation_speed:1,
      animation_intensity:1,
      widget_motion_enabled:true
    }
  };
  const save = await page.request.put(`/api/screens/${screen.id}/draft`, { data:{
    revision:editor.draft.revision,
    rows:editor.draft.rows,
    settings:editor.draft.settings,
    scene:{ version:1, elements:[weatherElement] }
  } });
  expect(save.ok()).toBeTruthy();

  let previewRequests = 0;
  await page.route('**/api/weather/preview**', async (route) => {
    previewRequests += 1;
    const url = new URL(route.request().url());
    await route.fulfill({
      status:200,
      contentType:'application/json',
      body:JSON.stringify({
        location_name:url.searchParams.get('name'),
        latitude:Number(url.searchParams.get('latitude')),
        longitude:Number(url.searchParams.get('longitude')),
        timezone:url.searchParams.get('timezone'),
        temperature:9,
        apparent_temperature:7,
        humidity:68,
        wind_speed:11,
        weather_code:3,
        is_day:true,
        condition:'Облачно',
        icon:'cloud',
        updated_at:new Date().toISOString(),
        forecast:[]
      })
    });
  });

  await page.goto(`/scene?screen=${screen.id}`);
  const weather = page.locator('[data-scene-element-id="weather-offline-probe"]');
  await expect(weather.locator('.weather-widget-location')).toHaveText('Комсомольск-на-Амуре', { timeout:5000 });
  await expect(weather.locator('.weather-widget-temperature')).toHaveText('9°');
  expect(previewRequests).toBeGreaterThanOrEqual(1);
});
