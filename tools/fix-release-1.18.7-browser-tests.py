from pathlib import Path


def replace_once(path, old, new):
    p = Path(path)
    text = p.read_text(encoding='utf-8')
    if old not in text:
        raise SystemExit(f'expected snippet not found in {path}: {old[:120]!r}')
    p.write_text(text.replace(old, new, 1), encoding='utf-8')

# The first event-driven Player render now produces the initial LKG preview.
replace_once(
    'tests/browser/admin-player-apply-e2e.spec.js',
    """        preview:binding?.preview_available === true,\n        ping:Number(binding?.ping_ms),\n        address:String(binding?.remote_address || '')\n""",
    """        preview:binding?.preview_available === true,\n        previewUpdatedAt:String(binding?.preview_updated_at || ''),\n        ping:Number(binding?.ping_ms),\n        address:String(binding?.remote_address || '')\n"""
)
replace_once(
    'tests/browser/admin-player-apply-e2e.spec.js',
    """    await expect.poll(tvNetworkState, { timeout:10000 }).toMatchObject({\n      ok:true,\n      online:true,\n      preview:false\n    });\n    const measured = await tvNetworkState();\n""",
    """    await expect.poll(tvNetworkState, { timeout:10000 }).toMatchObject({\n      ok:true,\n      online:true,\n      preview:true\n    });\n    const measured = await tvNetworkState();\n    expect(measured.previewUpdatedAt).not.toBe('');\n"""
)
replace_once(
    'tests/browser/admin-player-apply-e2e.spec.js',
    """    await expect(tvCard.locator('.screen-tv-face img')).toHaveCount(1, { timeout:5000 });\n    await expect(tvCard.locator('.screen-tv-face')).toHaveClass(/has-player-frame/, { timeout:5000 });\n""",
    """    const previewImage = tvCard.locator('.screen-tv-face img');\n    await expect(previewImage).toHaveCount(1, { timeout:5000 });\n    await previewImage.evaluate((node) => { node.dataset.identityProbe = 'stable-preview-img'; });\n    const previewSrc = await previewImage.getAttribute('src');\n    const previewRevision = (await tvNetworkState()).previewUpdatedAt;\n    await adminPage.waitForTimeout(5200);\n    await expect(tvCard.locator('.screen-tv-face img[data-identity-probe=\"stable-preview-img\"]')).toHaveCount(1);\n    expect(await previewImage.getAttribute('src')).toBe(previewSrc);\n    expect((await tvNetworkState()).previewUpdatedAt).toBe(previewRevision);\n    await expect(tvCard.locator('.screen-tv-face')).toHaveClass(/has-player-frame/, { timeout:5000 });\n"""
)

# Runtime audit mocks the Device Session endpoint; mock preview publish too and assert it does not loop.
replace_once(
    'tests/browser/player-runtime-audit.spec.js',
    """  const weather = weatherResponse();\n  let deltaRequests = 0;\n\n  try {\n""",
    """  const weather = weatherResponse();\n  let deltaRequests = 0;\n  let previewPublishes = 0;\n\n  try {\n"""
)
replace_once(
    'tests/browser/player-runtime-audit.spec.js',
    """    await page.route('**/api/device/player-logs', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ accepted_through: 1000000 }) }));\n""",
    """    await page.route('**/api/device/player-logs', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ accepted_through: 1000000 }) }));\n    await page.route('**/api/device/preview', (route) => {\n      previewPublishes += 1;\n      return route.fulfill({ status: 202, contentType: 'application/json', body: JSON.stringify({ stored:true }) });\n    });\n"""
)
replace_once(
    'tests/browser/player-runtime-audit.spec.js',
    """    expect(audit.resourceRequests).toBeLessThan(80);\n""",
    """    expect(audit.resourceRequests).toBeLessThan(80);\n    expect(previewPublishes).toBeLessThanOrEqual(1);\n"""
)
