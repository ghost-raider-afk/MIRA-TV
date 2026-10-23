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

test('Мониторинг displays scaled compact telemetry, respects gaps and keeps uptime informational', async ({ page }) => {
  const end = Date.now();
  const point = (minutes, fps, load, memory, uptime) => ({
    at:new Date(end - minutes * 60000).toISOString(),
    fps_avg:fps, player_load_percent:load,
    memory_mb:memory, uptime_hours:uptime
  });
  const points = [
    point(55,59.8,20,105,4.1),
    point(45,55.1,32,120,4.27),
    point(35,null,null,null,null), // Missing telemetry must break the line.
    point(25,37.2,52,148,4.6),
    point(15,58.4,24,168,4.77),
    point(5,59.6,21,172,4.93)
  ];
  const tv = {
    screen_id:31,screen_name:'Тестовый TV',label:'TV тест',
    location_name:'Точка тест',bound:true,online:true,
    last_metric_at:points.at(-1).at,problem_code:null
  };
  await page.route('**/api/overview**',async route=>{
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
      generated_at:new Date(end).toISOString(),range:'1h',
      summary:{locations:1,screens:1,online:1,offline:0,unbound:0,problems:0},
      telemetry:{sample_interval_seconds:600,expected_first_sample_seconds:10,retention_days:31},
      tvs:[tv],problems:[],selected_tv:tv,
      player_metrics:{screen_id:31,points}
    })});
  });
  await login(page);
  await expect(page.locator('.dashboard-commandbar h1')).toHaveText('Мониторинг');
  await expect(page.locator('[data-dashboard-card]:visible')).toHaveCount(4);
  await expect(page.locator('svg.dashboard-sparkline')).toHaveCount(3);
  await expect(page.locator('[data-dashboard-card="uptime"] svg')).toHaveCount(0);
  await expect(page.locator('[data-dashboard-uptime-samples]')).toHaveText('5');
  await expect(page.locator('[data-dashboard-uptime-state]')).toContainText('Player работает');
  await expect(page.locator('[data-dashboard-uptime-last]')).not.toHaveText('—');

  for (const id of ['fps','load','memory']) {
    const chart = page.locator('[data-dashboard-card="' + id + '"]');
    await expect(chart.locator('.dashboard-chart-axis-label')).toHaveCount(10);
    await expect(chart.locator('.dashboard-chart-line')).toHaveCount(2);
  }
  const fps=page.locator('[data-dashboard-card="fps"]');
  const box=await fps.locator('svg').boundingBox();
  await page.mouse.move(box.x + box.width*.69, box.y + box.height*.45);
  await expect(fps.locator('.dashboard-chart-tooltip')).toBeVisible();
  await expect(fps.locator('.dashboard-chart-tooltip')).toContainText('FPS');

  await page.setViewportSize({width:390,height:844});
  await expect.poll(async()=>page.evaluate(()=>{
    const svg=document.querySelector('[data-dashboard-card="fps"] svg');
    const host=document.querySelector('[data-dashboard-card="fps"] [data-dashboard-chart]');
    return Math.abs(svg.viewBox.baseVal.width-host.getBoundingClientRect().width)<3;
  })).toBe(true);
  const widths=await page.evaluate(()=>({
    page:document.documentElement.scrollWidth,
    viewport:document.documentElement.clientWidth
  }));
  expect(widths.page).toBeLessThanOrEqual(widths.viewport+1);
});
